import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { mapWithConcurrency } from "@/lib/concurrency";
import { resolveAiModels } from "@/lib/ai/model";
import { curateArticle } from "@/lib/curation/curator";
import { cleanUrl, unwrapUrl } from "@/lib/curation/unwrap-url";
import { extractNewsletterItems } from "@/lib/inbound/extract";
import { matchSources, type MatchableSource } from "@/lib/inbound/match";
import { fetchEmailContent } from "@/lib/inbound/receive";
import { dedupeByUrl, tallyItems, type ItemOutcome } from "@/lib/inbound/tally";

/**
 * RQ-007 step 3: turn stored emails into articles.
 *
 * Two phases in one run, because they are two different failures. Content fetching can fail
 * for an outage and should be retried; extraction failing means this email cannot be read
 * and retrying it costs money for the same answer.
 *
 * Nothing here aborts the batch. One malformed newsletter must not stop the other nineteen,
 * so every email is its own try and its own recorded outcome.
 */

export interface IngestResult {
  contentFetched: number;
  contentFailed: number;
  emailsProcessed: number;
  emailsIgnored: number;
  emailsFailed: number;
  articlesCreated: number;
  duplicatesSkipped: number;
  /** True when the run stopped at the article cap rather than because it ran out of work. */
  cappedOut: boolean;
  notes: string[];
}

const empty = (): IngestResult => ({
  contentFetched: 0,
  contentFailed: 0,
  emailsProcessed: 0,
  emailsIgnored: 0,
  emailsFailed: 0,
  articlesCreated: 0,
  duplicatesSkipped: 0,
  cappedOut: false,
  notes: [],
});

/**
 * Phase one: fetch the bodies of emails the webhook only recorded.
 *
 * Three attempts and then FAILED. A row that has exhausted them is left alone rather than
 * retried for ever, and Resend still holds the email, so a person can replay it from the
 * dashboard once whatever was broken is fixed.
 */
async function fetchPendingContent(result: IngestResult, limit: number): Promise<void> {
  const pending = await prisma.inboundEmail.findMany({
    where: {
      status: "CONTENT_PENDING",
      retryCount: { lt: config.emailIngest.maxContentAttempts },
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  /**
   * A few at a time. One fetch is a round trip to Resend and a single row update, so a
   * backlog of forty was forty round trips end to end for no reason.
   *
   * The counters are still mutated in place rather than returned and reduced, unlike the
   * item loop below. That is safe: JavaScript is single threaded, so an increment cannot
   * interleave with another increment, and note order in this phase carries no meaning.
   * The item loop is different only because a test asserts its totals.
   */
  await mapWithConcurrency(
    pending,
    config.emailIngest.emailConcurrency,
    async (email) => {
      const outcome = await fetchEmailContent(email.resendEmailId);

      if (outcome.ok) {
        await prisma.inboundEmail.update({
          where: { id: email.id },
          data: {
            html: outcome.content.html,
            text: outcome.content.text,
            status: "RECEIVED",
            error: null,
          },
        });
        result.contentFetched += 1;
        return;
      }

      const attempts = email.retryCount + 1;
      const exhausted =
        !outcome.retryable || attempts >= config.emailIngest.maxContentAttempts;

      await prisma.inboundEmail.update({
        where: { id: email.id },
        data: {
          retryCount: attempts,
          status: exhausted ? "FAILED" : "CONTENT_PENDING",
          error: outcome.reason,
        },
      });

      result.contentFailed += 1;

      if (exhausted) {
        result.notes.push(
          `${email.resendEmailId}: content could not be fetched (${outcome.reason})`
        );
      }
    }
  );
}

/** Every EMAIL source, across organizations, since an inbound email has no tenant. */
async function loadEmailSources(): Promise<MatchableSource[]> {
  const sources = await prisma.rSSSource.findMany({
    where: { type: "EMAIL" },
    select: {
      id: true,
      organizationId: true,
      senderAddress: true,
      inboundTag: true,
      parseMode: true,
      active: true,
      url: true,
    },
  });

  return sources as unknown as MatchableSource[];
}

/**
 * Phase two: read each email and create what it points at.
 */
export async function runEmailIngestion(options: { limit?: number } = {}): Promise<IngestResult> {
  const result = empty();
  const limit = options.limit ?? 50;

  await fetchPendingContent(result, limit);

  const sources = await loadEmailSources();

  const emails = await prisma.inboundEmail.findMany({
    where: { status: "RECEIVED" },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  await mapWithConcurrency(emails, config.emailIngest.emailConcurrency, async (email) => {
    if (result.articlesCreated >= config.emailIngest.maxArticlesPerRun) {
      /**
       * A return rather than a break: a worker cannot stop its siblings, and would not
       * want to. The ones already in flight finish the email they hold, so the cap can be
       * overshot by up to `emailConcurrency - 1` emails' worth of articles. At a cap of
       * 200 against about sixteen articles from the largest newsletter seen, that is
       * slack rather than a problem, and stopping mid-email would be worse: it would
       * leave a row half processed with no record of how far it got.
       */
      if (!result.cappedOut) {
        // Stated rather than silent: a run that stopped early must say so, or the next
        // person to look sees a number and assumes it was everything. Guarded, because
        // every worker still running will pass this check.
        result.cappedOut = true;
        result.notes.push(
          `stopped at the cap of ${config.emailIngest.maxArticlesPerRun} articles; ${emails.length} emails were queued`
        );
      }
      return;
    }

    try {
      const match = matchSources(
        { from: email.from, subaddressTag: email.subaddressTag },
        sources
      );

      if (match.sources.length === 0) {
        await prisma.inboundEmail.update({
          where: { id: email.id },
          data: { status: "IGNORED_UNKNOWN_SENDER", processedAt: new Date() },
        });
        result.emailsIgnored += 1;
        return;
      }

      let created = 0;
      let duplicates = 0;
      const failures: string[] = [];

      // One email, possibly several organizations: each curates independently, against its
      // own brand voice and its own threshold, and pays for its own calls.
      for (const source of match.sources) {
        const outcome = await ingestForSource(email, source);
        created += outcome.created;
        duplicates += outcome.duplicates;
        if (outcome.note) result.notes.push(outcome.note);
        if (outcome.failure) failures.push(outcome.failure);
      }

      /**
       * A failure for any source means this email was not dealt with.
       *
       * Every source is attempted first rather than stopping at the first failure, so one
       * organization's broken extraction does not cost another organization its articles.
       * Whatever was created stays: re-processing this row later cannot duplicate it,
       * because the curator checks for duplicates by URL and by embedding.
       */
      if (failures.length > 0) {
        const reason = failures.join("; ");

        await prisma.inboundEmail.update({
          where: { id: email.id },
          data: { status: "FAILED", error: reason, processedAt: new Date() },
        });

        result.emailsFailed += 1;
        result.articlesCreated += created;
        result.duplicatesSkipped += duplicates;
        result.notes.push(`${email.resendEmailId}: ${reason}`);
        return;
      }

      await prisma.inboundEmail.update({
        where: { id: email.id },
        data: { status: "PROCESSED", processedAt: new Date(), error: null },
      });

      // The health signal the sources screen reads.
      await prisma.rSSSource.updateMany({
        where: { id: { in: match.sources.map((source) => source.id) } },
        data: { lastReceivedAt: email.receivedAt },
      });

      result.emailsProcessed += 1;
      result.articlesCreated += created;
      result.duplicatesSkipped += duplicates;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";

      await prisma.inboundEmail.update({
        where: { id: email.id },
        data: { status: "FAILED", error: reason, processedAt: new Date() },
      });

      result.emailsFailed += 1;
      result.notes.push(`${email.resendEmailId}: ${reason}`);
    }
  });

  return result;
}

interface SourceOutcome {
  created: number;
  duplicates: number;
  /** Something worth saying about a run that nevertheless finished. */
  note: string | null;
  /**
   * Set when this email was not dealt with and must not be marked processed.
   *
   * Separate from `note` on purpose. A note is advisory and the caller may ignore it; a
   * failure changes what the caller writes to the row.
   */
  failure: string | null;
}

/**
 * One email, one source.
 *
 * A digest becomes many articles, each linking to somebody else's page. An essay becomes one
 * article whose content is the email's own text, which is the only case where a newsletter's
 * words are stored, and it is stored for curation rather than for republication.
 */
async function ingestForSource(
  email: { id: string; html: string | null; text: string | null; subject: string | null; receivedAt: Date },
  source: MatchableSource & { url?: string }
): Promise<SourceOutcome> {
  const { model } = await resolveAiModels(source.organizationId);

  const extracted = await extractNewsletterItems(
    { html: email.html, text: email.text },
    source.parseMode ?? "DIGEST",
    model
  );

  /**
   * A failure and an empty email take different paths from here.
   *
   * They used to take the same one, as a `note`, which is advisory text. The caller then
   * marked the email PROCESSED with a null error either way, so four of the largest
   * newsletters were recorded as dealt with having produced nothing, with no reason
   * stored and no possibility of a retry.
   */
  if (extracted.mode === "FAILED") {
    return { created: 0, duplicates: 0, note: null, failure: extracted.reason };
  }

  if (extracted.mode === "NONE") {
    return {
      created: 0,
      duplicates: 0,
      note: `${email.id}: ${extracted.reason}`,
      failure: null,
    };
  }

  if (extracted.mode === "ESSAY") {
    // The web version when the email gave one, and the source's own address otherwise. Never
    // a constructed URL: a link that does not resolve is worse than no link.
    const url = extracted.item.webVersionUrl ?? source.url ?? null;

    if (!url) {
      return {
        created: 0,
        duplicates: 0,
        note: `${email.id}: an essay with no web version and no source address, so nothing to link to`,
        failure: null,
      };
    }

    const outcome = await curateArticle(
      cleanUrl(url),
      extracted.item.title,
      extracted.item.plainTextBody,
      source.organizationId
    );

    return {
      created: outcome.success ? 1 : 0,
      duplicates: outcome.isDuplicate ? 1 : 0,
      note: outcome.success || outcome.isDuplicate ? null : `${email.id}: ${outcome.error}`,
      // An essay is one article. If curating it failed and it was not a duplicate, this
      // email produced nothing, and that is a failure rather than a quiet note.
      failure:
        outcome.success || outcome.isDuplicate
          ? null
          : `curating the essay failed: ${outcome.error ?? "unknown error"}`,
    };
  }

  const droppedNotes: string[] = [];

  if (extracted.dropped.length > 0) {
    droppedNotes.push(
      `${email.id}: ${extracted.dropped.length} item(s) dropped for naming a URL that was not in the email`
    );
  }

  /**
   * The items, a few at a time.
   *
   * Each one is a redirect chain to unwrap and then two model calls, which is three to seven
   * seconds of waiting and almost no work. Sequentially, twenty items were two minutes.
   *
   * Each returns its own outcome instead of adding to counters in this scope: with a pool
   * the completion order varies, and totals that depend on it would make the same email
   * report different numbers on different runs.
   */
  const outcomes = await mapWithConcurrency(
    // Deduplicated first: two copies of one URL in the same batch would both pass the
    // duplicate check before either wrote, and nothing downstream would catch it.
    dedupeByUrl(extracted.items),
    config.emailIngest.itemConcurrency,
    async (item): Promise<ItemOutcome> => {
      // Mandatory, as the plan says: the same story arriving through a feed and through two
      // newsletters is three wrapper URLs and none of them is the article's own.
      const unwrapped = await unwrapUrl(item.url);

      if (!unwrapped.unwrapped && unwrapped.note?.startsWith("stopped: ")) {
        // A URL the safety check refused is not stored. Something else would fetch it later.
        if (
          unwrapped.note.includes("not a public address") ||
          unwrapped.note.includes("not allowed")
        ) {
          return {
            created: 0,
            duplicate: false,
            note: `${email.id}: refused a link (${unwrapped.note})`,
          };
        }
      }

      /**
       * Title and snippet only, never the newsletter's own body.
       *
       * The copyright posture, and it is enforced here rather than described: a digest item
       * stores what it is and where it is, and the curation pipeline scores it on that. A
       * free subscription is not a republication licence.
       */
      const content = item.snippet.length > 0 ? item.snippet : item.title;

      const outcome = await curateArticle(
        unwrapped.url,
        item.title,
        content,
        source.organizationId
      );

      if (outcome.success) return { created: 1, duplicate: false, note: null };
      if (outcome.isDuplicate) return { created: 0, duplicate: true, note: null };

      return {
        created: 0,
        duplicate: false,
        note: `${email.id}: ${item.url} ${outcome.error}`,
      };
    }
  );

  const tally = tallyItems(outcomes);
  const notes = [...droppedNotes, ...tally.notes];

  // A digest that yielded nothing is not a failure. The extraction succeeded and the
  // answer was an empty list, which the prompt states is valid: a newsletter can be all
  // sponsors and job listings, and every item can legitimately be a duplicate.
  return {
    created: tally.created,
    duplicates: tally.duplicates,
    note: notes.length > 0 ? notes.join("; ") : null,
    failure: null,
  };
}

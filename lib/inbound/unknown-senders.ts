import { prisma } from "@/lib/db";
import { bareAddress } from "@/lib/inbound/address";
import { matchSources, type MatchableSource } from "@/lib/inbound/match";

/**
 * RQ-007 step 3: which senders are arriving that no source claims?
 *
 * This is the panel that turns a shared mailbox into something operable. Without it, the
 * only way to learn that a newsletter is being dropped is to notice the articles never
 * showed up, and the emails sit at IGNORED_UNKNOWN_SENDER where nobody looks.
 *
 * ## Why this is OWNER only, and platform-wide
 *
 * `InboundEmail` carries no organizationId, deliberately: an email arriving at a shared
 * address does not belong to a tenant until a source claims it. That makes any view over
 * these rows platform-wide, and one organization would otherwise read what the other
 * subscribed to, subject lines included.
 *
 * Restricting the panel to OWNER and saying so is the honest resolution. The alternative,
 * pretending to an isolation the shared address cannot provide, would be worse than the
 * disclosure. Callers must enforce the role; this module does not, because it has no
 * request context to enforce it from.
 *
 * ## Why not only IGNORED_UNKNOWN_SENDER
 *
 * That status means the job has already looked and found nothing. Reading only those rows
 * would hide every sender whose email has arrived but not yet been through a run, which on
 * a fresh mailbox is all of them: the panel would be empty exactly when it is most needed,
 * and would fill up only after a run had already discarded the mail.
 *
 * So the question asked here is the more useful one: **which senders would no source claim
 * if the job ran right now.** That is a superset of IGNORED_UNKNOWN_SENDER, it is computed
 * with the same `matchSources` the job uses so the two cannot disagree, and each group
 * reports its own status breakdown so a genuinely-ignored sender is distinguishable from
 * one that is merely still queued.
 */

/** Statuses where the email is still in play. A PROCESSED email found its source already. */
const UNSETTLED: Array<"CONTENT_PENDING" | "RECEIVED" | "IGNORED_UNKNOWN_SENDER"> = [
  "CONTENT_PENDING",
  "RECEIVED",
  "IGNORED_UNKNOWN_SENDER",
];

export interface UnknownSenderEmail {
  from: string;
  subject: string | null;
  subaddressTag: string | null;
  receivedAt: Date;
  status: string;
}

export interface UnknownSenderGroup {
  /** The bare address, lowercased, which is what an EMAIL source should be created with. */
  sender: string;
  /** As it appeared on the wire, for display. Newsletters put a display name here. */
  displayFrom: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** Most recent subjects, so a person can tell a newsletter from a receipt. */
  subjectSamples: string[];
  /** Any `+tag` seen from this sender, so a promoted source can carry it. */
  tags: string[];
  /** How many of this sender's emails sit in each status. */
  byStatus: Record<string, number>;
  /** True when at least one email was already discarded for having no source. */
  alreadyIgnored: boolean;
}

/** How many subject lines are worth keeping per sender. Enough to recognise it, no more. */
const SUBJECT_SAMPLES = 3;

/**
 * Group unmatched emails by sender.
 *
 * Grouped on the bare address rather than the raw From header: a newsletter changes its
 * display name whenever its marketing team feels like it, and "TLDR <x@y>" and "TLDR AI
 * <x@y>" are one sender, not two. Grouping on the header would split them and invite two
 * sources for the same feed.
 */
export function groupUnknownSenders(
  emails: UnknownSenderEmail[],
  sources: MatchableSource[]
): UnknownSenderGroup[] {
  const groups = new Map<string, UnknownSenderGroup>();

  for (const email of emails) {
    const match = matchSources(
      { from: email.from, subaddressTag: email.subaddressTag },
      sources
    );

    // Claimed by a source. Nothing to promote, and listing it would be a lie.
    if (match.sources.length > 0) continue;

    const sender = bareAddress(email.from)?.toLowerCase();
    if (!sender) continue; // A From we cannot parse cannot be turned into a source.

    const existing = groups.get(sender);

    if (!existing) {
      groups.set(sender, {
        sender,
        displayFrom: email.from,
        count: 1,
        firstSeenAt: email.receivedAt,
        lastSeenAt: email.receivedAt,
        subjectSamples: email.subject ? [email.subject] : [],
        tags: email.subaddressTag ? [email.subaddressTag] : [],
        byStatus: { [email.status]: 1 },
        alreadyIgnored: email.status === "IGNORED_UNKNOWN_SENDER",
      });
      continue;
    }

    existing.count += 1;
    if (email.receivedAt < existing.firstSeenAt) existing.firstSeenAt = email.receivedAt;
    if (email.receivedAt > existing.lastSeenAt) {
      existing.lastSeenAt = email.receivedAt;
      existing.displayFrom = email.from;
    }
    if (email.subject && existing.subjectSamples.length < SUBJECT_SAMPLES) {
      existing.subjectSamples.push(email.subject);
    }
    if (email.subaddressTag && !existing.tags.includes(email.subaddressTag)) {
      existing.tags.push(email.subaddressTag);
    }
    existing.byStatus[email.status] = (existing.byStatus[email.status] ?? 0) + 1;
    if (email.status === "IGNORED_UNKNOWN_SENDER") existing.alreadyIgnored = true;
  }

  // Most mail first: the sender flooding the mailbox is the one worth configuring.
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
  );
}

/**
 * Every EMAIL source across every organization.
 *
 * Deliberately unscoped, and it must be: an email is unmatched only if *no* organization
 * claims it. Scoping this to the caller's organization would list the other tenant's
 * newsletters as unknown and invite a duplicate source for a feed already configured.
 */
export async function loadAllEmailSources(): Promise<MatchableSource[]> {
  const sources = await prisma.rSSSource.findMany({
    where: { type: "EMAIL" },
    select: {
      id: true,
      organizationId: true,
      senderAddress: true,
      inboundTag: true,
      parseMode: true,
      active: true,
    },
  });

  return sources as MatchableSource[];
}

export interface UnknownSendersReport {
  groups: UnknownSenderGroup[];
  /** Unsettled emails examined, whether matched or not. */
  emailsExamined: number;
  /** True when the row cap was hit, so the report is a sample rather than the whole story. */
  truncated: boolean;
}

/** Rows read in one pass. High enough to cover a real backlog, bounded so the route cannot hang. */
const MAX_ROWS = 2_000;

export async function getUnknownSenders(
  options: { limit?: number } = {}
): Promise<UnknownSendersReport> {
  const limit = Math.min(options.limit ?? MAX_ROWS, MAX_ROWS);

  const [emails, sources] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: { status: { in: UNSETTLED } },
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        from: true,
        subject: true,
        subaddressTag: true,
        receivedAt: true,
        status: true,
      },
    }),
    loadAllEmailSources(),
  ]);

  return {
    groups: groupUnknownSenders(emails, sources),
    emailsExamined: emails.length,
    truncated: emails.length === limit,
  };
}

/**
 * Put this sender's held emails back in the queue after a source has claimed them.
 *
 * An email that was discarded for having no source is reset to the state it was in before
 * the job looked at it, which depends on whether its body was ever fetched. Resetting a
 * body-less row to RECEIVED would strand it: phase two would read null content and fail it
 * for good, so it goes back to CONTENT_PENDING and the fetch is retried first.
 *
 * `retryCount` is cleared with it. The count exists to stop an endlessly failing fetch, and
 * a source being configured is new information, not another attempt at the same thing.
 */
export async function requeueSender(sender: string): Promise<{ requeued: number }> {
  const held = await prisma.inboundEmail.findMany({
    where: { status: "IGNORED_UNKNOWN_SENDER" },
    select: { id: true, from: true, html: true, text: true },
  });

  const target = sender.trim().toLowerCase();
  const mine = held.filter((email) => bareAddress(email.from)?.toLowerCase() === target);

  if (mine.length === 0) return { requeued: 0 };

  const withBody = mine.filter((e) => e.html !== null || e.text !== null).map((e) => e.id);
  const withoutBody = mine.filter((e) => e.html === null && e.text === null).map((e) => e.id);

  if (withBody.length > 0) {
    await prisma.inboundEmail.updateMany({
      where: { id: { in: withBody } },
      data: { status: "RECEIVED", processedAt: null, error: null },
    });
  }

  if (withoutBody.length > 0) {
    await prisma.inboundEmail.updateMany({
      where: { id: { in: withoutBody } },
      data: { status: "CONTENT_PENDING", processedAt: null, error: null, retryCount: 0 },
    });
  }

  return { requeued: mine.length };
}

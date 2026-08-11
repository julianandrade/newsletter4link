import type { TenantClient } from "@/lib/db/tenant";
import { resolveAiModels } from "@/lib/ai/model";
import { generateRewrite, hashSource, type AskModel } from "@/lib/rewrite/generate";
import { resolveRewriteInput, type FetchPage } from "@/lib/rewrite/input";
import {
  readCurrentRewrite,
  saveRewrite,
  withinDailyCap,
  type StoredRewrite,
  type Trigger,
} from "@/lib/rewrite/store";

/**
 * RQ-006: one article in, a stored rewrite or a recorded refusal out.
 *
 * This is the only place the pieces are wired together, so there is one answer to
 * "when does a Link Take get written" rather than one per call site.
 *
 * The trigger is approval, not ingestion. The plan generated when an article passed the
 * relevance threshold, which spends four times over: fifty candidates arrive a week and
 * an edition carries eight to twelve. Approval is already the human act at the centre of
 * RQ-005, and an approved article is one somebody intends to publish.
 */

export type PipelineOutcome =
  | { status: "generated"; rewriteId: string; rewrite: StoredRewrite }
  | { status: "reused"; rewrite: StoredRewrite }
  | { status: "refused"; reason: string; rewriteId: string | null }
  | { status: "skipped"; reason: string };

export interface PipelineOptions {
  /** Regenerate even when a current rewrite exists and is not stale. */
  force?: boolean;
  /**
   * One editor's ask for this attempt, from the Regenerate control. Null on every
   * automatic path, and never read from the organization's settings: it is stored on the
   * row it produced so the history can say which instruction wrote which version.
   */
  instruction?: string | null;
  /** Injected for tests. */
  ask?: AskModel;
  fetchPage?: FetchPage;
  now?: Date;
}

/**
 * Write a Link Take for one article, or say why not.
 *
 * Order of refusals matters, and it is cheapest first: an existing rewrite short-circuits
 * before the cap is read, the cap before the input is resolved, and the input floor
 * before the model is called. Nothing here spends before it has to.
 */
export async function rewriteArticle(
  db: TenantClient,
  articleId: string,
  trigger: Trigger,
  options: PipelineOptions = {}
): Promise<PipelineOutcome> {
  const article = await db.article.findUnique({ where: { id: articleId } });

  if (!article) {
    return { status: "skipped", reason: "no such article in this organization" };
  }

  const existing = await readCurrentRewrite(db, articleId);

  // A current, passing rewrite is reused. Stale is regenerated, which is the whole point
  // of recording what the article said at the time.
  if (
    !options.force &&
    existing.rewrite &&
    existing.rewrite.status === "GENERATED" &&
    !existing.stale
  ) {
    return { status: "reused", rewrite: existing.rewrite };
  }

  // A refusal is not retried on every read. Whatever made it refuse, thin input or a
  // check it could not satisfy, will still be true a minute later, and retrying turns one
  // wasted pair of calls into an unbounded number.
  if (!options.force && existing.rewrite?.status === "FAILED" && !existing.stale) {
    return {
      status: "skipped",
      reason:
        existing.rewrite.error ??
        "a previous attempt was refused and the article has not changed since",
    };
  }

  const cap = await withinDailyCap(db, trigger, options.now);
  if (!cap.allowed) {
    return { status: "skipped", reason: cap.reason ?? "the daily cap is reached" };
  }

  const settings = await db.orgSettings.findUnique();
  const { model } = await resolveAiModels(db.organizationId);

  const resolved = await resolveRewriteInput(
    { feedContent: article.content, sourceUrl: article.sourceUrl },
    { fetchPage: options.fetchPage }
  );

  const articleHash = hashSource(article.content);
  const language = settings?.rewriteLanguage ?? "pt-PT";

  // Not usable means not attempted, and the reason is stored rather than thrown away:
  // "there is no Link Take" is a question somebody will ask.
  if (!resolved.usable) {
    const rewriteId = await saveRewrite(db, {
      articleId,
      outcome: {
        status: "REFUSED",
        reason: resolved.note,
        inputMode: resolved.mode,
        check: null,
        checkSummary: "not attempted: input below the usable floor",
        sourceHash: articleHash,
        attempts: 0,
      },
      model,
      language,
      articleHash,
      instruction: options.instruction ?? null,
    });

    return { status: "refused", reason: resolved.note, rewriteId };
  }

  const outcome = await generateRewrite(
    {
      title: article.title,
      source: resolved.source,
      mode: resolved.mode,
      publication: publicationOf(article.sourceUrl),
      publishedAt: article.publishedAt,
      language,
      orgContext: settings?.orgContextPrompt ?? null,
      brandVoice: settings?.brandVoicePrompt ?? null,
      relevanceHeading: settings?.relevanceHeading ?? "Relevancia para a Link",
      instruction: options.instruction ?? null,
      model,
    },
    options.ask
  );

  const rewriteId = await saveRewrite(db, {
    articleId,
    outcome,
    model,
    language,
    articleHash,
    instruction: options.instruction ?? null,
  });

  if (outcome.status === "REFUSED") {
    return { status: "refused", reason: outcome.reason, rewriteId };
  }

  const stored = await readCurrentRewrite(db, articleId);

  return {
    status: "generated",
    rewriteId,
    // The stored row rather than the outcome: what a reader sees must be what was
    // written down, not a parallel copy of it.
    rewrite: stored.rewrite as StoredRewrite,
  };
}

/** The publication name, from the URL, since nothing stores it separately. */
export function publicationOf(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

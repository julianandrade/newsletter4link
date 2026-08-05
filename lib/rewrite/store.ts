import type { TenantClient } from "@/lib/db/tenant";
import { EAGER_DAILY_CAP, ON_OPEN_DAILY_CAP } from "@/lib/rewrite/config";
import { hashSource, isStale, type GenerateOutcome } from "@/lib/rewrite/generate";

/**
 * RQ-006: reading and writing rewrites, with the history the review asked for.
 *
 * Nothing is overwritten. The plan had one rewrite per article, so regenerating
 * destroyed the record of what had been published, generated from what, by which model,
 * and whether the checks passed. For a feature whose main risk is copyright and
 * fabrication, that record is the thing most wanted six months later, so a new rewrite
 * supersedes the old one and the old row stays (review F5).
 *
 * A refused generation is stored too, as FAILED. It is never shown to a reader, and it
 * is what lets somebody ask why an article has no Link Take and get an answer.
 */

export interface StoredRewrite {
  id: string;
  title: string;
  body: string;
  language: string;
  model: string;
  inputMode: "FULL_TEXT" | "EXCERPT";
  status: "GENERATED" | "FAILED" | "STALE";
  checksPassed: boolean;
  checkSummary: string | null;
  longestSharedRun: number | null;
  wordCount: number | null;
  generatedAt: Date;
  error: string | null;
}

/**
 * Persist an outcome, superseding whatever it replaces.
 *
 * The supersede and the insert are one transaction: two current rewrites for one article
 * is a state no reader could resolve, and a crash between the two writes would leave
 * exactly that.
 */
export async function saveRewrite(
  db: TenantClient,
  input: {
    articleId: string;
    outcome: GenerateOutcome;
    model: string;
    language: string;
    /** Hash of the article text at the time, so staleness can be computed later. */
    articleHash: string;
  }
): Promise<string> {
  const { outcome } = input;
  const now = new Date();

  return db.$raw.$transaction(async (tx) => {
    // Scoped by the article, which the caller has already resolved through the tenant
    // client, so this cannot reach another organization's rows.
    await tx.articleRewrite.updateMany({
      where: { articleId: input.articleId, supersededAt: null },
      data: { supersededAt: now },
    });

    const created = await tx.articleRewrite.create({
      data: {
        articleId: input.articleId,
        title: outcome.status === "GENERATED" ? outcome.title : "",
        body: outcome.status === "GENERATED" ? outcome.body : "",
        language: input.language,
        model: input.model,
        inputMode: outcome.inputMode,
        status: outcome.status === "GENERATED" ? "GENERATED" : "FAILED",
        error: outcome.status === "REFUSED" ? outcome.reason : null,
        checksPassed: outcome.status === "GENERATED",
        checkSummary: outcome.checkSummary,
        // Serialized through a plain object array: Prisma's Json input type does not
        // accept a typed interface array directly, and casting the type away would hide
        // a real mismatch rather than express this one.
        checkFailures:
          outcome.check && outcome.check.failures.length > 0
            ? outcome.check.failures.map((failure) => ({
                code: failure.code,
                detail: failure.detail,
              }))
            : undefined,
        longestSharedRun: outcome.check?.stats.longestSharedRun ?? null,
        wordCount: outcome.check?.stats.words ?? null,
        sourceHash: input.articleHash,
      },
      select: { id: true },
    });

    return created.id;
  });
}

export interface CurrentRewrite {
  rewrite: StoredRewrite | null;
  /** True when the article changed after the rewrite was written (F6). */
  stale: boolean;
}

/**
 * The rewrite in force for an article, and whether it still matches the article.
 *
 * Returns a FAILED row as well as a passing one. A reader is shown nothing either way,
 * but an editor asking "why is there no Link Take here" deserves the reason rather than
 * silence, and the caller decides which of those it is.
 */
export async function readCurrentRewrite(
  db: TenantClient,
  articleId: string
): Promise<CurrentRewrite> {
  const [row, article] = await Promise.all([
    db.articleRewrite.findFirst({
      where: { articleId, supersededAt: null },
      orderBy: { generatedAt: "desc" },
    }),
    db.article.findUnique({ where: { id: articleId } }),
  ]);

  if (!row) return { rewrite: null, stale: false };

  const hash = article?.contentHash ?? (article ? hashSource(article.content) : null);

  return {
    rewrite: row as unknown as StoredRewrite,
    stale: isStale({ sourceHash: row.sourceHash }, hash),
  };
}

/** Every version for an article, newest first. The audit trail, for one article. */
export async function readRewriteHistory(
  db: TenantClient,
  articleId: string
): Promise<StoredRewrite[]> {
  const rows = await db.articleRewrite.findMany({
    where: { articleId },
    orderBy: { generatedAt: "desc" },
  });

  return rows as unknown as StoredRewrite[];
}

export type Trigger = "approval" | "on-open";

/**
 * Whether another generation is allowed today, and why not when it is not.
 *
 * The two triggers are counted separately and against different caps. A person opening
 * one article to read it is not the runaway case, and holding it to the same budget as
 * automatic generation would mean a reader hitting a wall because a collection run had
 * been busy.
 *
 * The cap on approvals is deliberately small. This is a weekly product: an edition
 * carries eight to twelve stories, so a few dozen candidates a week is generous, and the
 * plan's 300 a day was sized for a daily one.
 */
export async function withinDailyCap(
  db: TenantClient,
  trigger: Trigger,
  now: Date = new Date()
): Promise<{ allowed: boolean; used: number; cap: number; reason?: string }> {
  const cap = trigger === "approval" ? EAGER_DAILY_CAP : ON_OPEN_DAILY_CAP;
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  // Counts every attempt, refusals included. A refusal costs two model calls, so
  // excluding them would let a bad day of failures spend without limit.
  const used = await db.articleRewrite.count({
    where: { generatedAt: { gte: since } },
  });

  if (used >= cap) {
    return {
      allowed: false,
      used,
      cap,
      reason: `${used} rewrites already generated today, and the cap for ${trigger === "approval" ? "approvals" : "reads"} is ${cap}`,
    };
  }

  return { allowed: true, used, cap };
}

import type { TenantClient } from "@/lib/db/tenant";
import { isRewriteStale, type CurrentRewrite, type StoredRewrite } from "@/lib/rewrite/store";
import type { EmailLinkTake } from "@/lib/email/edition-template";

/**
 * Whether a take may be sent.
 *
 * Four independent reasons to refuse, and each is a separate test: nothing was ever written,
 * the attempt was refused, the checks did not pass, or the article moved after it was written.
 * `supersededAt` is not checked here because `readCurrentRewrite` only ever returns the current
 * row.
 *
 * The empty-body case looks paranoid and is not: a FAILED row stores `body: ""`, and a future
 * status that is neither GENERATED nor FAILED would otherwise send an empty story.
 */
export function isUsableTake(current: CurrentRewrite): boolean {
  const { rewrite, stale } = current;
  if (!rewrite) return false;
  if (stale) return false;
  if (rewrite.status !== "GENERATED") return false;
  if (!rewrite.checksPassed) return false;
  if (!rewrite.body.trim()) return false;
  if (!rewrite.title.trim()) return false;
  return true;
}

/**
 * The usable take for each of these articles, keyed by article id.
 *
 * An article with no usable take is simply absent from the map, which is what lets a caller
 * distinguish "flagged and ready" from "flagged and blocked" without a second query.
 *
 * Two queries, not one per id. This used to call `readCurrentRewrite` in a loop, which cost
 * one round trip per article on top of the one already paid to load the edition, on every
 * GET and every save; an edition of a dozen stories paid for a dozen round trips even when
 * nothing was flagged. `readCurrentRewrite` stays as it is for its one-article callers; this
 * is the batched sibling for callers, like the edition builder, that need the answer for
 * many ids at once. Both compute staleness through `isRewriteStale`, so there is one rule
 * between them, and both feed the same `isUsableTake`, so there is one definition of usable.
 *
 * Passing every article id in the edition rather than only the flagged ones is a choice made
 * by the caller, not this function: the builder's toggle has to say whether a take exists the
 * moment a story is checked, not only after the next reload, and the two send-path callers
 * still filter to the flagged ids first because that is all they need.
 */
export async function readLinkTakesFor(
  db: TenantClient,
  articleIds: readonly string[]
): Promise<Map<string, EmailLinkTake>> {
  const takes = new Map<string, EmailLinkTake>();
  if (articleIds.length === 0) return takes;

  const ids = [...articleIds];

  const [rewrites, articles] = await Promise.all([
    db.articleRewrite.findMany({
      where: { articleId: { in: ids }, supersededAt: null },
    }),
    db.article.findMany({ where: { id: { in: ids } } }),
  ]);

  const articleById = new Map(articles.map((article) => [article.id, article]));

  // supersededAt: null should already be one row per article (saveRewrite supersedes the
  // old one in the same transaction as the new insert), but the newest wins if that ever
  // stops being true, matching the orderBy in readCurrentRewrite's single-article findFirst.
  const latestByArticle = new Map<string, (typeof rewrites)[number]>();
  for (const row of rewrites) {
    const current = latestByArticle.get(row.articleId);
    if (!current || row.generatedAt > current.generatedAt) {
      latestByArticle.set(row.articleId, row);
    }
  }

  for (const [articleId, row] of latestByArticle) {
    const current: CurrentRewrite = {
      rewrite: row as unknown as StoredRewrite,
      stale: isRewriteStale(row, articleById.get(articleId)),
    };

    if (!isUsableTake(current) || !current.rewrite) continue;

    takes.set(articleId, {
      title: current.rewrite.title,
      body: current.rewrite.body,
      language: current.rewrite.language,
    });
  }

  return takes;
}

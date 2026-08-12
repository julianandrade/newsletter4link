import type { TenantClient } from "@/lib/db/tenant";
import { readCurrentRewrite, type CurrentRewrite } from "@/lib/rewrite/store";
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
 * Called only with the flagged ids, so an edition with nothing flagged issues no query at all.
 */
export async function readLinkTakesFor(
  db: TenantClient,
  articleIds: readonly string[]
): Promise<Map<string, EmailLinkTake>> {
  const takes = new Map<string, EmailLinkTake>();
  if (articleIds.length === 0) return takes;

  for (const articleId of articleIds) {
    const current = await readCurrentRewrite(db, articleId);
    if (!isUsableTake(current) || !current.rewrite) continue;
    takes.set(articleId, {
      title: current.rewrite.title,
      body: current.rewrite.body,
      language: current.rewrite.language,
    });
  }

  return takes;
}

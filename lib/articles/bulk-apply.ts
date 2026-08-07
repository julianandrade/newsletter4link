import type { TenantClient } from "@/lib/db/tenant";
import { writeForAction, type ParsedBulk } from "./bulk-action";

/**
 * Applying a parsed bulk action, and reporting honestly what it did.
 *
 * Two reads and one write rather than a single `updateMany`, because `updateMany` returns a
 * count and the client needs the ids: an undo built on the requested selection reopens the
 * verdicts another reviewer took in between, which is precisely the bug the RQ-005 spec
 * called out when it asked for `affectedIds` and never got it.
 *
 * Not a transaction. The window between the select and the write is small, and a lost race
 * costs one article a redundant write of the value it already holds. A transaction here
 * would hold a lock across a thousand-row selection for no gain.
 */
export interface BulkOutcome {
  affected: number;
  affectedIds: string[];
  skipped: number;
  /** Editions a discarded article was pulled out of. Always 0 for other actions. */
  detachedFrom: number;
}

export async function applyBulk(
  db: TenantClient,
  parsed: ParsedBulk,
  now: Date
): Promise<BulkOutcome> {
  const { where, data } = writeForAction(parsed.action, now);

  // Scoped by the tenant client, so ids from another organization simply do not match and
  // are reported as skipped rather than refused, which would confirm they exist.
  const matching = await db.article.findMany({
    where: { id: { in: parsed.ids }, ...where },
    select: { id: true },
  });

  const affectedIds = matching.map((row) => row.id);

  if (affectedIds.length === 0) {
    return {
      affected: 0,
      affectedIds: [],
      skipped: parsed.ids.length,
      detachedFrom: 0,
    };
  }

  await db.article.updateMany({
    // The guard already ran in the select above, so repeating it here would only reopen
    // the race it cannot close.
    where: { id: { in: affectedIds } },
    data: data as never,
  });

  const detachedFrom =
    parsed.action === "discard" ? await detachFromOpenEditions(db, affectedIds) : 0;

  return {
    affected: affectedIds.length,
    affectedIds,
    skipped: parsed.ids.length - affectedIds.length,
    detachedFrom,
  };
}

/**
 * Pull discarded articles out of every edition that has not gone out.
 *
 * A sent edition is deliberately left alone: it carries its own snapshot of what it
 * contained (`lib/editions/sent-snapshot.ts`), so removing the join row changes nothing a
 * reader will ever see, and leaving it is the smaller action.
 *
 * The edition ids come back from `db.edition.findMany`, which is organization-scoped.
 * `db.editionArticle.deleteMany` is not scoped and cannot be, since the join table has no
 * organizationId of its own, so ids reaching it must have been resolved this way and never
 * taken from a request body.
 */
async function detachFromOpenEditions(
  db: TenantClient,
  articleIds: string[]
): Promise<number> {
  const open = await db.edition.findMany({
    where: {
      status: { not: "SENT" },
      articles: { some: { articleId: { in: articleIds } } },
    },
    select: { id: true },
  });

  if (open.length === 0) return 0;

  await db.editionArticle.deleteMany({
    where: {
      editionId: { in: open.map((edition) => edition.id) },
      articleId: { in: articleIds },
    },
  });

  return open.length;
}

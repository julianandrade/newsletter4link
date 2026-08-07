/**
 * The vocabulary behind the all-articles screen: the where clause, the page, and which bulk
 * actions a filter can honestly offer.
 *
 * Kept out of the route and the screen so each rule is testable, and because the `discarded`
 * case is subtle in two different ways. Reading it works by naming `discardedAt` explicitly,
 * which is the one thing that overrides the tenant client's default exclusion; writing to it
 * is the mirror image, and is why `bulkActionsForFilter` exists. See the `article` block in
 * `lib/db/tenant.ts`.
 */

import type { BulkAction } from "./bulk-action";

export type ArticleListState = "pending" | "approved" | "rejected" | "discarded" | "all";

/**
 * Rows per page.
 *
 * There is a ceiling because a filter over a year of collection is thousands of rows and one
 * response should not carry them. There is a page number because the ceiling on its own made
 * everything past it unreachable, which is the defect this screen exists to remove.
 */
export const ARTICLE_PAGE_SIZE = 200;

const STATUS_BY_STATE: Record<string, string> = {
  pending: "PENDING_REVIEW",
  approved: "APPROVED",
  rejected: "REJECTED",
};

export function articleListWhere(params: {
  state: string | null;
  search: string | null;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (params.state && STATUS_BY_STATE[params.state]) {
    where.status = STATUS_BY_STATE[params.state];
  } else if (params.state === "discarded") {
    // Naming the column is what beats the wrapper's default. Nothing else here does.
    where.discardedAt = { not: null };
  }

  const search = params.search?.trim();
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }

  return where;
}

/**
 * The page asked for, as a number a query can be built from.
 *
 * Anything unreadable is page one rather than a 400: a hand-edited or stale URL should land
 * a reader on the first page of the filter they named, not on an error.
 */
export function articleListPage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Which bulk actions a filter can honestly offer.
 *
 * `nextActionsFor` in `components/article/article-state-controls.tsx` answers this per row.
 * Without the same rule per filter, the bar offers all five whatever is listed, and on
 * Discarded four of them are guaranteed no-ops: none of approve, reject, reset or discard
 * names `discardedAt` in `writeForAction`, so the match query in `applyBulk` picks the
 * tenant wrapper's `discardedAt: null` default back up and matches nothing. Selecting forty
 * discarded stories, pressing Discard, confirming, and being told "Nothing changed" is the
 * shape of that bug.
 */
export function bulkActionsForFilter(state: string): BulkAction[] {
  switch (state) {
    case "discarded":
      return ["restore"];
    case "approved":
      return ["reject", "reset", "discard"];
    case "rejected":
      return ["approve", "reset", "discard"];
    case "pending":
      return ["approve", "reject", "discard"];
    default:
      // `all`, and any unknown state, which falls back to the same list the where clause
      // does. It excludes discarded rows, so `restore` would match nothing here either.
      return ["approve", "reject", "reset", "discard"];
  }
}

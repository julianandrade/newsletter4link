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

/**
 * Whether the caller wants every matching id rather than a page of articles.
 *
 * Explicit `true` only. A missing parameter, an empty one, or a stray "1" all mean the
 * normal request: a route that returns a different shape on a typo is a route that fails
 * quietly.
 */
export function wantsIdsOnly(raw: string | null): boolean {
  return raw === "true";
}

/**
 * The ids this request should receive, taken from the set the filter already ordered.
 *
 * Both answers come from one ordered array on purpose. "Select all matching" resolves to
 * ids before any bulk action runs, and if those ids came from a second implementation of
 * "matching" the two would drift the first time either changed: the visible symptom is a
 * bulk action hitting rows the screen never listed.
 */
export function articleIdsForRequest(
  ordered: { id: string }[],
  { page, pageSize, idsOnly }: { page: number; pageSize: number; idsOnly: boolean }
): string[] {
  const ids = ordered.map((row) => row.id);
  if (idsOnly) return ids;
  return ids.slice((page - 1) * pageSize, page * pageSize);
}

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
    // Title or summary, which is what `app/api/articles/pending/route.ts` has always
    // searched. This searched titles alone, so the same word gave two different sets in two
    // article lists, and the narrower one was the screen advertised as showing everything.
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
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

/** Which bulk actions stop for a confirmation, and which run on the click. */
export const CONFIRMED_BULK_ACTIONS: BulkAction[] = ["reject", "discard"];

export interface BulkActionDescriptor {
  id: BulkAction;
  /** True when the action opens the confirmation dialog instead of running. */
  confirms: boolean;
}

/**
 * The bar's actions for a filter, each carrying whether it asks first.
 *
 * The asymmetry is on the record and is the reason this is a function rather than a `?:` in
 * the screen: bulk reject shipped without a confirmation and 23 curated stories were lost to
 * one click. Reject and Discard therefore ask; Approve, Back to the queue and Restore do
 * not, because all three either move work forward or put something back, and all three are
 * undoable from the same screen.
 *
 * It was protected only by a prose comment inside a 530-line client component, which is
 * exactly the protection that failed for `reset`. `tests/unit/article-list-filter.test.ts`
 * now asserts both halves, and the VIEWER case with them: a reader who decides nothing gets
 * no actions at all, so the bar renders nothing rather than buttons that answer 403.
 */
export function bulkActionDescriptors(
  state: string,
  canEdit: boolean
): BulkActionDescriptor[] {
  if (!canEdit) return [];

  return bulkActionsForFilter(state).map((id) => ({
    id,
    confirms: CONFIRMED_BULK_ACTIONS.includes(id),
  }));
}

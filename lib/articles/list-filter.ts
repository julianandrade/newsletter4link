/**
 * The where clause behind the all-articles screen.
 *
 * Kept out of the route so the mapping from a query string to a filter is testable, and
 * because the `discarded` case is subtle: it works by naming `discardedAt` explicitly,
 * which is the one thing that overrides the tenant client's default exclusion. See the
 * `article` block in `lib/db/tenant.ts`.
 */

export type ArticleListState = "pending" | "approved" | "rejected" | "discarded" | "all";

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

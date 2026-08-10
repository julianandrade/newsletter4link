/**
 * How a list route reads the order it was asked for.
 *
 * Every list screen sends `sortBy` and `sortOrder`, and every list route validated them
 * slightly differently, or not at all. Three of them accepted whatever arrived and handed
 * it straight to Prisma as a key, which turns a query string into a column name.
 *
 * The rule this file encodes: a route declares the fields it can honestly order by, and
 * anything outside that list falls back to the route's own default rather than erroring. A
 * stale bookmark or a hand-edited URL should land a reader on the list in a sensible order,
 * not on a 400.
 *
 * Where the sort runs is not a style choice:
 *
 *  - A route that paginates or caps its rows MUST sort in the database, or the sort only
 *    reorders the slice that happened to come back. That is not hypothetical: the curation
 *    screen sorted ten rows of a twelve-page history and presented the result as the order
 *    of the whole thing.
 *  - A route that provably returns the complete set with no `take` may sort in the browser.
 *    Only `/api/templates` and `/api/rss-sources` qualify, and both are a handful of rows.
 */

export type SortDirection = "asc" | "desc";

export interface SortRequest<Field extends string> {
  field: Field;
  direction: SortDirection;
}

/**
 * The order a request asked for, narrowed to what this route can serve.
 *
 * `aliases` exists for renames: the queue has sent `sortBy=publishedAt` since it shipped,
 * and that field is now called `date` because it orders by the publication date or the
 * capture time, whichever the row actually has. Old query strings keep working.
 */
export function parseSort<Field extends string>(
  params: URLSearchParams,
  allowed: readonly Field[],
  fallback: SortRequest<Field>,
  aliases: Record<string, Field> = {}
): SortRequest<Field> {
  const raw = params.get("sortBy");
  const named = raw ? (aliases[raw] ?? raw) : null;

  const field = allowed.includes(named as Field) ? (named as Field) : fallback.field;
  const direction: SortDirection =
    params.get("sortOrder") === "asc"
      ? "asc"
      : params.get("sortOrder") === "desc"
        ? "desc"
        : fallback.direction;

  return { field, direction };
}

/**
 * Compare two values of unknown-but-matching shape, nulls last in both directions.
 *
 * Nulls last rather than "nulls are small": a row with no score or no name is missing the
 * thing you are sorting by, and putting it at the top of "highest score first" answers a
 * question nobody asked. Both directions agree so the two ends of a column are the two ends
 * of the data, not the same block of empties.
 */
export function compareValues(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
  direction: SortDirection
): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const sign = direction === "asc" ? 1 : -1;

  if (typeof a === "string" && typeof b === "string") {
    // Locale compare, so "Émile" files with the E rather than after Z, and case does not
    // split a column into two alphabets.
    return sign * a.localeCompare(b, undefined, { sensitivity: "base" });
  }

  const aNum = a instanceof Date ? a.getTime() : Number(a);
  const bNum = b instanceof Date ? b.getTime() : Number(b);

  if (Number.isNaN(aNum) && Number.isNaN(bNum)) return 0;
  if (Number.isNaN(aNum)) return 1;
  if (Number.isNaN(bNum)) return -1;

  return sign * (aNum - bNum);
}

/**
 * Sort a fully-loaded list by a key function. For the two routes that return everything,
 * and for the client-side lists that mirror them.
 *
 * Stable, because `Array.prototype.sort` has been stable since ES2019 and a list that
 * reshuffles equal rows on every keystroke reads as broken even when the order is correct.
 */
export function sortBy<T>(
  rows: readonly T[],
  key: (row: T) => string | number | Date | null | undefined,
  direction: SortDirection
): T[] {
  return [...rows].sort((a, b) => compareValues(key(a), key(b), direction));
}

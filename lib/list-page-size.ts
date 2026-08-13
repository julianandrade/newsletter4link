/**
 * How many rows a list shows at once.
 *
 * One vocabulary for every list, because there wasn't one: articles paged at 200, the run
 * history at 10, the feeds at 50, and subscribers and projects rendered every row they had.
 * None of those numbers was written down anywhere, so each new list copied whichever
 * neighbour it was pasted from.
 *
 * Three sizes rather than five. Ten is a page you scroll past without deciding anything and
 * it triples the clicks to cross 434 feeds; two hundred is not paging, it is a cap with a
 * pager attached, which is exactly what articles had.
 */
export const PAGE_SIZES = [25, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 50;

/**
 * The size to actually use, given anything at all.
 *
 * Clamped rather than trusted because the value arrives from two places that can both lie:
 * a `<select>`, which hands back a string, and `localStorage`, which anyone can edit in
 * devtools. A page size of 5,000 is a hung tab and a page size of 0 is a division by zero
 * wearing a preference's clothes.
 */
export function clampPageSize(value: unknown): PageSize {
  const size = typeof value === "string" ? Number(value) : value;
  return PAGE_SIZES.includes(size as PageSize) ? (size as PageSize) : DEFAULT_PAGE_SIZE;
}

/**
 * Where one list's size is stored.
 *
 * Per list, because the right density for a run history is not the right density for an
 * article archive, and namespaced so the key never collides with anything else this app
 * keeps in storage.
 */
export function pageSizeKey(list: string): string {
  return `n4l.pageSize.${list}`;
}

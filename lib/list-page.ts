import { clampPageSize, DEFAULT_PAGE_SIZE, type PageSize } from "@/lib/list-page-size";

/**
 * How a list route reads a page out of its query string.
 *
 * One module rather than one per route, because the rule that matters is easy to get wrong
 * in a way nothing complains about: **a request with no `page` gets every row.**
 *
 * `app/dashboard/send/[id]/page.tsx` fetches `/api/subscribers` with no parameters and
 * makes the recipients of an edition out of whatever comes back. Paging by default would
 * have limited a send to the first fifty people, and the screen would have looked correct
 * while doing it, because the list it renders is the list it sends to. So absence of the
 * parameter means the whole list, and the screens that want a page ask for one.
 *
 * That is the opposite of the usual arrangement, where paging is the default and callers
 * opt out. The failure mode decides it: forgetting a flag here costs a slow page, and
 * forgetting it the other way costs a truncated newsletter.
 */
export interface ListPage {
  /** Whether the caller asked for a page at all. */
  paged: boolean;
  page: number;
  pageSize: PageSize;
}

export function parseListPage(params: URLSearchParams): ListPage {
  const raw = params.get("page");

  // Presence, not value: `?page=1` is a request for the first page, and no `page` at all is
  // a request for everything.
  const paged = raw !== null;
  const parsed = Number.parseInt(raw ?? "", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  return {
    paged,
    page,
    pageSize: paged ? clampPageSize(params.get("pageSize")) : DEFAULT_PAGE_SIZE,
  };
}

/** Prisma's window for one page. */
export function pageArgs(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * The page that actually has rows on it.
 *
 * A page number outlives the filter that made it reachable: narrowing a list while sitting
 * on page nine has to land somewhere real rather than on an empty page under a pager that
 * still claims nine exists.
 */
export function clampToTotal(page: number, pageSize: number, total: number): number {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, page), lastPage);
}

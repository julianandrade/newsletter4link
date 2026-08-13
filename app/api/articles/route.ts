import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { parseSort } from "@/lib/list-sort";
import {
  ARTICLE_SORT_ALIASES,
  ARTICLE_SORT_FIELDS,
  sortArticles,
} from "@/lib/articles/sort";
import {
  ARTICLE_PAGE_SIZE,
  articleIdsForRequest,
  articleListPage,
  articleListWhere,
  wantsIdsOnly,
} from "@/lib/articles/list-filter";

export const dynamic = "force-dynamic";

const ARTICLE_SELECT = {
  id: true,
  title: true,
  sourceUrl: true,
  author: true,
  publishedAt: true,
  capturedAt: true,
  relevanceScore: true,
  summary: true,
  category: true,
  status: true,
  discardedAt: true,
} as const;

/** The five columns an ordering reads, and nothing else. */
const ARTICLE_SORT_SELECT = {
  id: true,
  title: true,
  sourceUrl: true,
  publishedAt: true,
  capturedAt: true,
  relevanceScore: true,
} as const;

/**
 * GET /api/articles?state=pending|approved|rejected|discarded|all&search=&page=&sortBy=&sortOrder=
 *
 * Every article in this organization, in whatever state. The product had no such route:
 * `pending` and `approved` each had their own, and a REJECTED or discarded article was not
 * reachable from anywhere, which is why a rejection could not be undone from any screen.
 *
 * `total` is the population under the filter, counted separately, and it is load-bearing.
 * The response used to carry only `data.length`, which the screen presented as the count:
 * an organization with 340 rejections was told it had 200, offered "Select all 200", and
 * had no route at all to the other 140. That is the same unreachability this screen exists
 * to remove, moved rather than fixed. The count is what makes the paging honest, and the
 * `page` parameter is what makes the rest reachable.
 *
 * The count goes through the same tenant wrapper with the same where clause, so it inherits
 * the same discarded-row handling the list does, `lib/db/tenant.ts` line 112 mirroring
 * line 71. A total that counted discarded rows the list excludes would be its own lie.
 *
 * A read, so membership is enough. The writes behind the buttons on this screen go through
 * PATCH /api/articles/bulk, which requires EDITOR.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { db } = await requireOrgContext();

    const where = articleListWhere({
      state: searchParams.get("state"),
      search: searchParams.get("search"),
    });
    const page = articleListPage(searchParams.get("page"));
    const idsOnly = wantsIdsOnly(searchParams.get("idsOnly"));
    // Task 8 of the paging contract makes this the requested size; until then the route's
    // own constant is the page, so the two outputs stay in step.
    const pageSize = ARTICLE_PAGE_SIZE;
    const sort = parseSort(
      searchParams,
      ARTICLE_SORT_FIELDS,
      { field: "date", direction: "desc" },
      ARTICLE_SORT_ALIASES
    );

    /**
     * Ordering a page of a filter, in two passes.
     *
     * The obvious shape, `orderBy` plus `skip`/`take`, cannot express this list's order.
     * Two of the five sortable fields have no column behind them: `date` is
     * `COALESCE(publishedAt, capturedAt)`, which is what the Date cell renders and what
     * Prisma's `orderBy` has no way to say, and `source` is a publication name derived from
     * the URL in `sourceIdentity`. The route ordered by the raw `publishedAt` column with
     * NULLS LAST instead, which pushed all 379 undated articles onto the last pages while
     * each of them displayed a capture date from this week.
     *
     * So: read the five ordering columns for the whole filtered set, order it in full, and
     * take the page from the ordered ids. Sorting a page and calling it the order of the
     * filter is the same defect wearing a different hat, and it is what the curation screen
     * was doing to ten rows of a twelve-page history.
     *
     * The first pass reads six small columns and never leaves the server. At the current
     * 4,812 rows that is one indexed scan; if this corpus reaches the hundreds of
     * thousands, the fix is a stored `COALESCE` column, not a client-side sort.
     */
    const [ordering, total] = await Promise.all([
      db.article.findMany({ where, select: ARTICLE_SORT_SELECT }),
      db.article.count({ where }),
    ]);

    const ordered = sortArticles(ordering, sort);

    /**
     * `idsOnly=true` answers with the whole matching set and nothing else.
     *
     * This is what "select all 4,812 matching" resolves to before a bulk action runs. It
     * returns early, above the second query, because the caller wants ids rather than
     * articles: fetching and shaping thousands of rows to throw the bodies away would make
     * the safety step the slowest thing on the screen.
     */
    if (idsOnly) {
      return NextResponse.json({
        success: true,
        ids: articleIdsForRequest(ordered, { page, pageSize, idsOnly: true }),
        total,
      });
    }

    const pageIds = articleIdsForRequest(ordered, { page, pageSize, idsOnly: false });

    const rows = await db.article.findMany({
      where: { id: { in: pageIds } },
      select: ARTICLE_SELECT,
    });

    // `findMany` does not honour the order of an `in`, so put the page back in the order it
    // was chosen in rather than trusting whatever came back.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const articles = pageIds
      .map((id) => byId.get(id))
      .filter((row): row is (typeof rows)[number] => row !== undefined);

    return NextResponse.json({
      success: true,
      data: articles,
      // `count` is this page, `total` is the filter. Both are named for what they are,
      // because conflating them is the defect above.
      count: articles.length,
      total,
      page,
      pageSize: ARTICLE_PAGE_SIZE,
      sort,
    });
  } catch (error) {
    console.error("Error listing articles:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to list the articles" },
      { status: 500 }
    );
  }
}

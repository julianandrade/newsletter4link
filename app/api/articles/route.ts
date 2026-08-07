import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import {
  ARTICLE_PAGE_SIZE,
  articleListPage,
  articleListWhere,
} from "@/lib/articles/list-filter";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles?state=pending|approved|rejected|discarded|all&search=&page=
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

    // Together: the count does not depend on the rows, so awaiting them in sequence would
    // cost a round trip for nothing.
    const [articles, total] = await Promise.all([
      db.article.findMany({
        where,
        // Finding C1: nulls last, then the capture time. Mirrors the pending route.
        orderBy: [
          { publishedAt: { sort: "desc", nulls: "last" } },
          { capturedAt: "desc" },
        ],
        skip: (page - 1) * ARTICLE_PAGE_SIZE,
        take: ARTICLE_PAGE_SIZE,
        select: {
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
        },
      }),
      db.article.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: articles,
      // `count` is this page, `total` is the filter. Both are named for what they are,
      // because conflating them is the defect above.
      count: articles.length,
      total,
      page,
      pageSize: ARTICLE_PAGE_SIZE,
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

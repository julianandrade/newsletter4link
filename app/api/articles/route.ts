import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { articleListWhere } from "@/lib/articles/list-filter";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles?state=pending|approved|rejected|discarded|all&search=
 *
 * Every article in this organization, in whatever state. The product had no such route:
 * `pending` and `approved` each had their own, and a REJECTED or discarded article was not
 * reachable from anywhere, which is why a rejection could not be undone from any screen.
 *
 * A read, so membership is enough. The writes behind the buttons on this screen go through
 * PATCH /api/articles/bulk, which requires EDITOR.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { db } = await requireOrgContext();

    const articles = await db.article.findMany({
      where: articleListWhere({
        state: searchParams.get("state"),
        search: searchParams.get("search"),
      }),
      // Finding C1: nulls last, then the capture time. Mirrors the pending route.
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { capturedAt: "desc" },
      ],
      take: 200,
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
    });

    return NextResponse.json({ success: true, data: articles, count: articles.length });
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

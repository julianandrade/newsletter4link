import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles/approved
 * Get all approved articles with optional search/filter
 *
 * Query params:
 * - search: Filter by title (optional)
 * - excludeInEdition: Exclude articles already in an edition (optional, default false)
 *
 * This route read the global client with no organization filter, so it returned approved
 * articles from every organization to whichever one asked. The editions screen calls it,
 * so one tenant's curation was on another tenant's screen. It is now tenant-scoped.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const excludeInEdition = searchParams.get("excludeInEdition") === "true";

    const { db } = await requireOrgContext();

    /**
     * `db.$raw` with the filter written out, because the tenant client's generic does not
     * carry a `select` through to the return type and this query needs `_count`. The
     * organization filter is therefore mine to get right, and it is the first line of the
     * where clause so it cannot be lost in an edit.
     */
    const articles = await db.$raw.article.findMany({
      where: {
        organizationId: db.organizationId,
        status: "APPROVED",
        ...(search && {
          title: {
            contains: search,
            mode: "insensitive",
          },
        }),
        ...(excludeInEdition && {
          editions: {
            none: {},
          },
        }),
      },
      // Finding C1: nulls last, then the capture time. See the pending route.
      orderBy: [
        { relevanceScore: "desc" },
        { publishedAt: { sort: "desc", nulls: "last" } },
        { capturedAt: "desc" },
      ],
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
        createdAt: true,
        _count: {
          select: {
            editions: true,
          },
        },
      },
    });

    // Transform to include edition count
    const articlesWithEditionCount = articles.map((article) => ({
      ...article,
      editionCount: article._count.editions,
      _count: undefined,
    }));

    return NextResponse.json({
      success: true,
      data: articlesWithEditionCount,
      count: articlesWithEditionCount.length,
    });
  } catch (error) {
    console.error("Error fetching approved articles:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

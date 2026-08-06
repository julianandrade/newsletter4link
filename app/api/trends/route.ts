import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { bestKnownDate } from "@/lib/articles/date";
import { clampDays, clampLimit, computeTrends } from "@/lib/trends/compute";

export const dynamic = "force-dynamic";

// Re-exported so existing importers of these types keep working.
export type { Trend, TrendArticle, TrendDriver } from "@/lib/trends/compute";

/**
 * GET /api/trends
 *
 * Movement is computed on request from Article.category[] over the requested
 * window, by the same function the newsletter's trend radar uses. Every figure
 * is derived from real rows: nothing is seeded or estimated.
 *
 * Query params:
 * - days: window length, 14-365 (default 90)
 * - limit: how many topics to return (default 12)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const { searchParams } = new URL(request.url);
    const days = clampDays(searchParams.get("days"));
    const limit = clampLimit(searchParams.get("limit"));

    const now = Date.now();
    const from = new Date(now - days * 24 * 60 * 60 * 1000);

    const articles = await db.article.findMany({
      where: {
        publishedAt: { gte: from },
        status: { not: "REJECTED" },
      },
      // Finding C1: nulls last. The trend buckets by bestKnownDate below either way,
      // but this keeps an undated article from displacing dated ones out of the read.
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { capturedAt: "desc" }],
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        publishedAt: true,
        capturedAt: true,
        relevanceScore: true,
        category: true,
      },
    });

    /**
     * A trend buckets mentions by time, so an article with no publication date is bucketed
     * by when we captured it. That is the right answer rather than a compromise: a trend
     * measures when a topic was being talked about in our sources, and for an article a
     * newsletter told us about with no date, the day we saw it is the only fact we have
     * about its position in time. Dropping it instead would understate every topic that
     * arrives mainly through newsletters.
     */
    const { trends, meta } = computeTrends(
      articles.map((article) => ({
        ...article,
        publishedAt: bestKnownDate(article),
      })),
      { days, limit, now }
    );

    return NextResponse.json({ success: true, data: trends, meta });
  } catch (error) {
    console.error("Error computing trends:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
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

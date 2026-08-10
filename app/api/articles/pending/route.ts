import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { Prisma } from "@prisma/client";
import { parseSort } from "@/lib/list-sort";
import { bestKnownDateRangeWhere } from "@/lib/articles/date";
import {
  ARTICLE_SORT_ALIASES,
  ARTICLE_SORT_FIELDS,
  sortArticles,
} from "@/lib/articles/sort";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles/pending
 * Get all articles pending review with optional filtering (tenant-scoped)
 *
 * Query params:
 * - search: Search in title/summary
 * - categories: Comma-separated list of categories
 * - scoreMin: Minimum relevance score (default: 0)
 * - scoreMax: Maximum relevance score (default: 10)
 * - dateFrom: Published after date (ISO string)
 * - dateTo: Published before date (ISO string)
 * - sortBy: date, relevanceScore, title, source, capturedAt
 *           (`publishedAt` is accepted and means `date`)
 * - sortOrder: asc or desc
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const { searchParams } = new URL(request.url);

    // Parse filter parameters
    const search = searchParams.get("search") || "";
    const categoriesParam = searchParams.get("categories");
    const categories = categoriesParam ? categoriesParam.split(",").filter(Boolean) : [];
    const scoreMin = parseFloat(searchParams.get("scoreMin") || "0");
    const scoreMax = parseFloat(searchParams.get("scoreMax") || "10");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const sort = parseSort(
      searchParams,
      ARTICLE_SORT_FIELDS,
      { field: "relevanceScore", direction: "desc" },
      ARTICLE_SORT_ALIASES
    );

    // Build where clause
    const where: Prisma.ArticleWhereInput = {
      status: "PENDING_REVIEW",
    };

    // Search filter (title or summary)
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    // Categories filter (has any of the specified categories)
    if (categories.length > 0) {
      where.category = { hasSome: categories };
    }

    // Score range filter
    if (scoreMin > 0 || scoreMax < 10) {
      where.relevanceScore = {
        gte: scoreMin,
        lte: scoreMax,
      };
    }

    // Date range filter, over the same value the Date column shows. `publishedAt` alone
    // never matched an undated article, so a range silently hid 379 of them.
    const dateRange = bestKnownDateRangeWhere({ from: dateFrom, to: dateTo });
    if (dateRange) {
      // AND, so a range and a search narrow together instead of the second OR replacing
      // the first. `where.OR` is already taken by the search above.
      where.AND = [dateRange as Prisma.ArticleWhereInput];
    }

    /**
     * The order is applied here rather than by the database, and that is the fix.
     *
     * This route returns every pending article with no `take`, so an in-process sort is
     * total, and it is the only way `date` can mean what the screen shows: Postgres cannot
     * order by `COALESCE(publishedAt, capturedAt)` through Prisma's `orderBy`, and ordering
     * by the raw column with NULLS LAST is precisely the bug. `source` is derived from the
     * URL too, so it has no column to sort on either.
     *
     * One path for all five fields on purpose. Splitting "the database can do this one"
     * from "we do this one here" is how the two ends drift: Postgres sorts nulls first on a
     * descending order and puts uppercase before lowercase, and `sortArticles` does
     * neither.
     */
    const rows = await db.article.findMany({
      where,
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
      },
    });

    const articles = sortArticles(rows, sort);

    // Get unique categories from all pending articles for filter options
    const allPendingArticles = await db.article.findMany({
      where: { status: "PENDING_REVIEW" },
      select: { category: true },
    });

    const uniqueCategories = [
      ...new Set(allPendingArticles.flatMap((a) => a.category)),
    ].sort();

    return NextResponse.json({
      success: true,
      data: articles,
      count: articles.length,
      meta: {
        categories: uniqueCategories,
        // Echoed back so a screen can show the order it actually got rather than the one it
        // asked for, which are different whenever a stale `sortBy` falls back.
        sort,
      },
    });
  } catch (error) {
    console.error("Error fetching pending articles:", error);

    // Handle auth errors
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

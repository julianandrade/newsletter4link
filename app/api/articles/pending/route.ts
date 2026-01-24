import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles/pending
 * Get all articles pending review with optional filtering
 *
 * Query params:
 * - search: Search in title/summary
 * - categories: Comma-separated list of categories
 * - scoreMin: Minimum relevance score (default: 0)
 * - scoreMax: Maximum relevance score (default: 10)
 * - dateFrom: Published after date (ISO string)
 * - dateTo: Published before date (ISO string)
 * - sortBy: Field to sort by (relevanceScore, publishedAt, title)
 * - sortOrder: asc or desc
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filter parameters
    const search = searchParams.get("search") || "";
    const categoriesParam = searchParams.get("categories");
    const categories = categoriesParam ? categoriesParam.split(",").filter(Boolean) : [];
    const scoreMin = parseFloat(searchParams.get("scoreMin") || "0");
    const scoreMax = parseFloat(searchParams.get("scoreMax") || "10");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const sortBy = searchParams.get("sortBy") || "relevanceScore";
    const sortOrder = searchParams.get("sortOrder") || "desc";

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

    // Date range filter
    if (dateFrom || dateTo) {
      where.publishedAt = {};
      if (dateFrom) {
        where.publishedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Add one day to include the end date
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        where.publishedAt.lte = endDate;
      }
    }

    // Build orderBy clause
    const validSortFields = ["relevanceScore", "publishedAt", "title"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "relevanceScore";
    const orderByDirection = sortOrder === "asc" ? "asc" : "desc";

    const orderBy: Prisma.ArticleOrderByWithRelationInput[] = [
      { [orderByField]: orderByDirection },
    ];

    // Secondary sort by publishedAt if primary isn't publishedAt
    if (orderByField !== "publishedAt") {
      orderBy.push({ publishedAt: "desc" });
    }

    const articles = await prisma.article.findMany({
      where,
      orderBy,
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        author: true,
        publishedAt: true,
        relevanceScore: true,
        summary: true,
        category: true,
        status: true,
        createdAt: true,
      },
    });

    // Get unique categories from all pending articles for filter options
    const allPendingArticles = await prisma.article.findMany({
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
      },
    });
  } catch (error) {
    console.error("Error fetching pending articles:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

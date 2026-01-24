import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles/approved
 * Get all approved articles with optional search/filter
 *
 * Query params:
 * - search: Filter by title (optional)
 * - excludeInEdition: Exclude articles already in an edition (optional, default false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const excludeInEdition = searchParams.get("excludeInEdition") === "true";

    const articles = await prisma.article.findMany({
      where: {
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
      orderBy: [
        { relevanceScore: "desc" },
        { publishedAt: "desc" },
      ],
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

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/search/results/[id]/import
 * Import a search result as an article
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await params;

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    // Get the search result
    const searchResult = await prisma.searchResult.findUnique({
      where: { id },
      include: {
        searchTopic: true,
      },
    });

    if (!searchResult) {
      return NextResponse.json(
        { error: "Search result not found" },
        { status: 404 }
      );
    }

    // Verify the result belongs to the organization
    if (searchResult.searchTopic.organizationId !== ctx.organization.id) {
      return NextResponse.json(
        { error: "Search result not found" },
        { status: 404 }
      );
    }

    // Check if article already exists
    const existingArticle = await ctx.db.article.findUnique({
      where: {
        sourceUrl_organizationId: {
          sourceUrl: searchResult.url,
          organizationId: ctx.organization.id,
        },
      },
    });

    if (existingArticle) {
      // Update the search result to link to existing article
      await prisma.searchResult.update({
        where: { id },
        data: {
          status: "IMPORTED",
          importedArticleId: existingArticle.id,
        },
      });

      return NextResponse.json({
        success: true,
        data: existingArticle,
        message: "Article already exists",
        alreadyExisted: true,
      });
    }

    // Create new article from search result
    // Note: TenantClient auto-adds organizationId
    const article = await (ctx.db.article.create as Function)({
      data: {
        sourceUrl: searchResult.url,
        title: searchResult.title,
        content: searchResult.content || searchResult.snippet,
        author: searchResult.author,
        publishedAt: searchResult.publishedAt || new Date(),
        relevanceScore: searchResult.aiScore,
        summary: searchResult.aiSummary,
        category: searchResult.aiTopics,
        status: "PENDING_REVIEW",
        embedding: [],
      },
    });

    // Update search result status
    await prisma.searchResult.update({
      where: { id },
      data: {
        status: "IMPORTED",
        importedArticleId: article.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article imported successfully",
      alreadyExisted: false,
    });
  } catch (error) {
    console.error("Error importing search result:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to import search result" },
      { status: 500 }
    );
  }
}

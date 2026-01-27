import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * Request body for direct import
 */
interface DirectImportRequest {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  author?: string;
  publishedAt?: string;
  aiScore?: number;
  aiSummary?: string;
  aiTopics?: string[];
}

/**
 * POST /api/search/import
 * Direct import of search result as article (without requiring SearchResult DB record)
 * Used for ad-hoc search results that haven't been saved to a topic
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { success: false, error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    // Parse request body
    const body: DirectImportRequest = await request.json();

    // Validate required fields
    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.url.trim());
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format" },
        { status: 400 }
      );
    }

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 }
      );
    }

    if (!body.snippet || typeof body.snippet !== "string") {
      return NextResponse.json(
        { success: false, error: "Snippet is required" },
        { status: 400 }
      );
    }

    // Check if article already exists with same URL in this organization
    const existingArticle = await ctx.db.article.findUnique({
      where: {
        sourceUrl_organizationId: {
          sourceUrl: body.url,
          organizationId: ctx.organization.id,
        },
      },
    });

    if (existingArticle) {
      return NextResponse.json({
        success: true,
        data: existingArticle,
        message: "Article already exists",
        alreadyExisted: true,
      });
    }

    // Create new article directly from the provided data
    // Note: TenantClient auto-adds organizationId
    const article = await (ctx.db.article.create as Function)({
      data: {
        sourceUrl: body.url.trim(),
        title: body.title.trim(),
        content: body.content || body.snippet,
        author: body.author || null,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
        relevanceScore: body.aiScore ?? null,
        summary: body.aiSummary || null,
        category: body.aiTopics || [],
        status: "PENDING_REVIEW",
        embedding: [],
      },
    });

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article imported successfully",
      alreadyExisted: false,
    });
  } catch (error) {
    console.error("Error importing search result directly:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to import search result" },
      { status: 500 }
    );
  }
}

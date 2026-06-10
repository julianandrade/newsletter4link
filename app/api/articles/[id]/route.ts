import { NextResponse } from "next/server";
import { getArticleById } from "@/lib/queries";
import { requireOrgContext, requireRole } from "@/lib/auth/context";

/**
 * GET /api/articles/:id
 * Get single article by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();

    const article = await getArticleById(db, id);

    if (!article) {
      return NextResponse.json(
        {
          success: false,
          error: "Article not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: article,
    });
  } catch (error) {
    console.error("Error fetching article:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/articles/:id
 * Update article summary and/or categories
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const body = await request.json();

    const { summary, category } = body;

    // Build update data
    const updateData: { summary?: string; category?: string[] } = {};

    if (typeof summary === "string") {
      updateData.summary = summary;
    }

    if (Array.isArray(category)) {
      updateData.category = category;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid fields to update. Provide summary (string) or category (array).",
        },
        { status: 400 }
      );
    }

    // updateMany is org-scoped, so articles from other orgs are not matched
    const { count } = await ctx.db.article.updateMany({
      where: { id },
      data: updateData,
    });

    if (count === 0) {
      return NextResponse.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      );
    }

    const article = await ctx.db.article.findUnique({ where: { id } });

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article updated successfully",
    });
  } catch (error) {
    console.error("Error updating article:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
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

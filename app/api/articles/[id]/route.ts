import { NextResponse } from "next/server";
import { getArticleById } from "@/lib/queries";
import { prisma } from "@/lib/db";

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

    const article = await getArticleById(id);

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

    const article = await prisma.article.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article updated successfully",
    });
  } catch (error) {
    console.error("Error updating article:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

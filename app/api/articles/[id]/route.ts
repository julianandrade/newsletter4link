import { NextResponse } from "next/server";
import { z } from "zod";
import { getArticleById } from "@/lib/queries";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseJsonBody, errorResponse } from "@/lib/validation";

const updateArticleSchema = z
  .object({
    summary: z.string().trim().max(10000),
    category: z.array(z.string().trim().min(1).max(100)).max(50),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide summary (string) or category (array) to update",
  });

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
    return errorResponse(error);
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

    const updateData = await parseJsonBody(request, updateArticleSchema);

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
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseJsonBody, errorResponse } from "@/lib/validation";

const updateSummarySchema = z.object({
  summary: z.string().trim().min(1, "Summary is required").max(10000),
});

/**
 * PATCH /api/articles/:id/summary
 * Update article summary
 * Requires EDITOR role; article must belong to the current organization
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const { summary } = await parseJsonBody(request, updateSummarySchema);

    // updateMany is org-scoped, so articles from other orgs are not matched
    const { count } = await ctx.db.article.updateMany({
      where: { id },
      data: { summary },
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
      message: "Summary updated successfully",
    });
  } catch (error) {
    console.error("Error updating summary:", error);
    return errorResponse(error);
  }
}

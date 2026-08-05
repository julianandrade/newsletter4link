import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";

/**
 * PATCH /api/articles/:id/summary
 * Update article summary
 *
 * Guarded and tenant-scoped. It had neither, so any authenticated member of any
 * organization could rewrite the summary of any article by id, and a summary is what goes
 * out in the newsletter.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const { id } = await params;
    const body = await request.json();
    const { summary } = body ?? {};

    if (!summary || typeof summary !== "string" || summary.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Summary is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const updated = await ctx.db.article.updateMany({
      where: { id },
      data: { summary: summary.trim() },
    });

    if (updated.count === 0) {
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

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to update the summary" },
      { status: 500 }
    );
  }
}

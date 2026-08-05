import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";

/**
 * POST /api/articles/:id/reject
 * Reject an article from newsletter inclusion
 *
 * Guarded for the same reason as approve, and more urgently: this one removes work. It
 * had no authentication and no organization filter, so any authenticated member of any
 * organization could reject any article by id, whatever their role. Twenty-three curated
 * stories were already lost once in this project to an unconfirmed bulk rejection.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const { id } = await params;

    const updated = await ctx.db.article.updateMany({
      where: { id },
      data: { status: "REJECTED" },
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
      message: "Article rejected successfully",
    });
  } catch (error) {
    console.error("Error rejecting article:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to reject the article" },
      { status: 500 }
    );
  }
}

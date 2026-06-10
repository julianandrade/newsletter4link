import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";

/**
 * POST /api/articles/:id/approve
 * Approve an article for inclusion in newsletter
 * Requires EDITOR role; article must belong to the current organization
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    // updateMany is org-scoped, so articles from other orgs are not matched
    const { count } = await ctx.db.article.updateMany({
      where: { id },
      data: { status: "APPROVED" },
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
      message: "Article approved successfully",
    });
  } catch (error) {
    console.error("Error approving article:", error);

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

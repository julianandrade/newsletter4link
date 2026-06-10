import { NextResponse } from "next/server";
import { updateArticleSummary } from "@/lib/queries";
import { requireOrgContext } from "@/lib/auth/context";
import { logger } from "@/lib/logger";

/**
 * PATCH /api/articles/:id/summary
 * Update article summary (tenant-scoped)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await requireOrgContext();
    const body = await request.json();
    const { summary } = body;

    if (!summary || typeof summary !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Summary is required and must be a string",
        },
        { status: 400 }
      );
    }

    // Ownership check: findUnique returns null if the article isn't in this org.
    const owned = await db.article.findUnique({ where: { id } });
    if (!owned) {
      return NextResponse.json(
        { success: false, error: "Article not found" },
        { status: 404 }
      );
    }

    const article = await updateArticleSummary(id, summary);

    return NextResponse.json({
      success: true,
      data: article,
      message: "Summary updated successfully",
    });
  } catch (error) {
    logger.error("Error updating summary", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

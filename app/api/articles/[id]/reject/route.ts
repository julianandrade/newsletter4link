import { NextResponse } from "next/server";
import { updateArticleStatus } from "@/lib/queries";

/**
 * POST /api/articles/:id/reject
 * Reject an article from newsletter inclusion
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const article = await updateArticleStatus(id, "REJECTED");

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article rejected successfully",
    });
  } catch (error) {
    console.error("Error rejecting article:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

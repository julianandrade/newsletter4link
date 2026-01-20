import { NextResponse } from "next/server";
import { updateArticleStatus } from "@/lib/queries";

/**
 * POST /api/articles/:id/approve
 * Approve an article for inclusion in newsletter
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const article = await updateArticleStatus(id, "APPROVED");

    return NextResponse.json({
      success: true,
      data: article,
      message: "Article approved successfully",
    });
  } catch (error) {
    console.error("Error approving article:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { updateArticleSummary } from "@/lib/queries";

/**
 * PATCH /api/articles/:id/summary
 * Update article summary
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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

    const article = await updateArticleSummary(id, summary);

    return NextResponse.json({
      success: true,
      data: article,
      message: "Summary updated successfully",
    });
  } catch (error) {
    console.error("Error updating summary:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getPendingArticles } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles/pending
 * Get all articles pending review
 */
export async function GET() {
  try {
    const articles = await getPendingArticles();

    return NextResponse.json({
      success: true,
      data: articles,
      count: articles.length,
    });
  } catch (error) {
    console.error("Error fetching pending articles:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Search History Individual Item API
 *
 * GET /api/search/history/[id] - Get single search with full results
 * DELETE /api/search/history/[id] - Delete a saved search
 */

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * GET /api/search/history/[id]
 * Get a single search history entry with full results
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await params;

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    const searchHistory = await ctx.db.searchHistory.findUnique({
      where: { id },
      include: {
        convertedTopic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!searchHistory) {
      return NextResponse.json(
        { error: "Search history not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(searchHistory);
  } catch (error) {
    console.error("Error fetching search history:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch search history" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/search/history/[id]
 * Delete a saved search (ownership verified by org context)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await params;

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    // Verify the record exists and belongs to this org (tenant client handles org scoping)
    const searchHistory = await ctx.db.searchHistory.findUnique({
      where: { id },
    });

    if (!searchHistory) {
      return NextResponse.json(
        { error: "Search history not found" },
        { status: 404 }
      );
    }

    await ctx.db.searchHistory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting search history:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to delete search history" },
      { status: 500 }
    );
  }
}

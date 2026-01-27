import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/search/results/[id]
 * Update a search result status
 */
export async function PATCH(
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

    // Get the search result
    const searchResult = await prisma.searchResult.findUnique({
      where: { id },
      include: {
        searchTopic: true,
      },
    });

    if (!searchResult) {
      return NextResponse.json(
        { error: "Search result not found" },
        { status: 404 }
      );
    }

    // Verify the result belongs to the organization
    if (searchResult.searchTopic.organizationId !== ctx.organization.id) {
      return NextResponse.json(
        { error: "Search result not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ["NEW", "REVIEWED", "IMPORTED", "DISMISSED"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const updated = await prisma.searchResult.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating search result:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to update search result" },
      { status: 500 }
    );
  }
}

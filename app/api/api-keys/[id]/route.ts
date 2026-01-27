/**
 * API Key Management - Individual Key
 *
 * DELETE /api/api-keys/[id] - Delete an API key
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { hasFeature } from "@/lib/plans/features";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/api-keys/[id] - Delete an API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireOrgContext();
    const { db, organization, membership } = ctx;

    // Check feature access
    if (!hasFeature(organization.plan, "apiAccess")) {
      return NextResponse.json(
        {
          success: false,
          error: "API access requires Professional or Enterprise plan",
        },
        { status: 403 }
      );
    }

    // Only ADMIN+ can delete API keys
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only admins can delete API keys" },
        { status: 403 }
      );
    }

    // Find the key to ensure it belongs to this org
    const apiKey = await db.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key not found" },
        { status: 404 }
      );
    }

    // Delete the key
    await db.apiKey.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "API key deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting API key:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to delete API key" },
      { status: 500 }
    );
  }
}

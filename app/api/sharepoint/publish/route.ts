import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { publishToSharePoint, getSharePointStatus, isSharePointConfigured } from "@/lib/sharepoint";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/sharepoint/publish
 * Publish or retry publishing an edition to SharePoint
 *
 * Body: { editionId: string }
 */
export async function POST(request: Request) {
  try {
    const { db } = await requireOrgContext();
    const body = await request.json();
    const { editionId } = body;

    if (!editionId) {
      return NextResponse.json(
        { success: false, error: "editionId is required" },
        { status: 400 }
      );
    }

    // Check if SharePoint is configured
    if (!isSharePointConfigured()) {
      return NextResponse.json(
        { success: false, error: "SharePoint integration is not configured" },
        { status: 400 }
      );
    }

    // Verify edition exists and belongs to organization
    const edition = await db.edition.findUnique({
      where: { id: editionId },
    });

    if (!edition) {
      return NextResponse.json(
        { success: false, error: "Edition not found" },
        { status: 404 }
      );
    }

    // Publish to SharePoint
    const result = await publishToSharePoint(editionId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Newsletter published to SharePoint",
        data: {
          sharePointUrl: result.sharePointUrl,
          sharePointPageId: result.sharePointPageId,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to publish to SharePoint",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error("SharePoint publish API error", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sharepoint/publish?editionId=xxx
 * Get SharePoint publishing status for an edition
 */
export async function GET(request: Request) {
  try {
    const { db } = await requireOrgContext();
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");

    if (!editionId) {
      return NextResponse.json(
        { success: false, error: "editionId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify edition exists and belongs to organization
    const edition = await db.edition.findUnique({
      where: { id: editionId },
    });

    if (!edition) {
      return NextResponse.json(
        { success: false, error: "Edition not found" },
        { status: 404 }
      );
    }

    const status = await getSharePointStatus(editionId);

    return NextResponse.json({
      success: true,
      data: {
        configured: isSharePointConfigured(),
        ...status,
      },
    });
  } catch (error) {
    logger.error("SharePoint status API error", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

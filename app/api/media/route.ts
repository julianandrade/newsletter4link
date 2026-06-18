import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/storage/gcs";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/media
 * List all media assets, ordered by creation date (newest first)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
    const offsetParam = parseInt(searchParams.get("offset") ?? "0", 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), 100);
    const offset = Math.max(isNaN(offsetParam) ? 0 : offsetParam, 0);

    const where = type ? { type: { startsWith: type } } : {};

    const [mediaAssets, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.mediaAsset.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: mediaAssets,
      count: mediaAssets.length,
      total,
      pagination: {
        limit,
        offset,
        hasMore: offset + mediaAssets.length < total,
      },
    });
  } catch (error) {
    logger.error("Error fetching media assets", error);

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
 * DELETE /api/media
 * Delete a media asset by ID (removes from both database and storage)
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Media asset ID is required. Use ?id=<asset_id>",
        },
        { status: 400 }
      );
    }

    // Find the media asset first
    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id },
    });

    if (!mediaAsset) {
      return NextResponse.json(
        {
          success: false,
          error: "Media asset not found",
        },
        { status: 404 }
      );
    }

    // Delete the GCS object using the stored object path. Legacy rows have a
    // null storagePath (Supabase URL); skip storage deletion for those.
    if (mediaAsset.storagePath) {
      try {
        await deleteFile(mediaAsset.storagePath);
      } catch (storageError) {
        logger.error("Error deleting from storage", storageError);
        // Continue with database deletion even if storage deletion fails.
        // The object might already have been removed.
      }
    } else {
      logger.warn(
        "Media asset has no storagePath (legacy Supabase row); skipping GCS deletion, possible orphan requiring manual cleanup",
        { mediaAssetId: id, url: mediaAsset.url }
      );
    }

    // Delete from database
    await prisma.mediaAsset.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Media asset deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting media asset", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

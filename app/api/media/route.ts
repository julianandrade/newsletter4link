import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/supabase/storage";

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
    console.error("Error fetching media assets:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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

    // Extract the storage path from the URL
    // URL format: https://<project>.supabase.co/storage/v1/object/public/newsletter-media/<path>
    const urlParts = mediaAsset.url.split("/newsletter-media/");
    const storagePath = urlParts[1];

    if (storagePath) {
      // Delete from Supabase storage
      try {
        await deleteFile(storagePath);
      } catch (storageError) {
        console.error("Error deleting from storage:", storageError);
        // Continue with database deletion even if storage deletion fails
        // The file might have been manually deleted
      }
    } else {
      console.warn(
        `Media asset ${id} has no extractable storage path from URL: ${mediaAsset.url}. ` +
          "This may indicate an orphaned storage file that requires manual cleanup."
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
    console.error("Error deleting media asset:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

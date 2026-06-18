import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { downloadFile } from "@/lib/storage/gcs";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/media/[id]
 *
 * PUBLIC, unauthenticated. Streams a media object's bytes from the PRIVATE GCS
 * bucket so the stable URL `${NEXT_PUBLIC_APP_URL}/api/media/<id>` works in
 * emailed newsletters without exposing the bucket. Uses the global (non
 * tenant-scoped) prisma client because public requests carry no org context.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id } });

    // Legacy rows (Supabase URL, null storagePath) cannot be served from GCS.
    if (!asset || !asset.storagePath) {
      return NextResponse.json(
        { success: false, error: "Media asset not found" },
        { status: 404 }
      );
    }

    const { buffer, contentType } = await downloadFile(asset.storagePath);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    // A missing object (or any download failure) is a 404, not a 500 with a
    // stack trace — the row exists but the object is gone/unreadable.
    logger.error("Error serving media asset", error);
    return NextResponse.json(
      { success: false, error: "Media asset not found" },
      { status: 404 }
    );
  }
}

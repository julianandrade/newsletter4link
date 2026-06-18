import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage/gcs";
import { requireOrgContext } from "@/lib/auth/context";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types for images
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

/**
 * POST /api/media/upload
 * Upload a file to GCS and create a MediaAsset record with a stable serve URL.
 */
export async function POST(request: Request) {
  try {
    const { db } = await requireOrgContext();
    const formData = await request.formData();
    const file = formData.get("file");

    // Validate file exists
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No file provided. Please include a 'file' field in the form data.",
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Upload bytes to the private GCS media bucket.
    const { path } = await uploadFile(file, file.name, file.type);

    // Create the record first to mint the DB-generated id, then set the stable
    // serve URL `${appUrl}/api/media/<id>` (two writes because we need the id).
    const created = await db.mediaAsset.create({
      data: {
        filename: file.name,
        url: "",
        storagePath: path,
        type: file.type,
        size: file.size,
      } as any,
    });

    const url = `${config.app.url}/api/media/${created.id}`;
    const mediaAsset = await db.mediaAsset.update({
      where: { id: created.id },
      data: { url },
    });

    return NextResponse.json(
      {
        success: true,
        data: mediaAsset,
        message: "File uploaded successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Error uploading file", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

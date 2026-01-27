import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/supabase/storage";
import { requireOrgContext } from "@/lib/auth/context";

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
 * Upload a file to Supabase storage and create a MediaAsset record
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

    // Upload to Supabase storage
    const { url } = await uploadFile(file, file.name, file.type);

    // Create MediaAsset record in database
    const mediaAsset = await db.mediaAsset.create({
      data: {
        filename: file.name,
        url,
        type: file.type,
        size: file.size,
      } as any,
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
    console.error("Error uploading file:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

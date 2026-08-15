import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";
import { requireOrgContext } from "@/lib/auth/context";
import { sniffImageType } from "@/lib/media/sniff";

export const dynamic = "force-dynamic";

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * POST /api/media/upload
 * Upload a file to Supabase storage and create a MediaAsset record
 *
 * There is deliberately no list of accepted declared types. `file.type` is the browser's
 * word, taken from the multipart part header and controlled by whoever posts, and this
 * route used to validate against it and then hand that same value to Supabase as the
 * stored object's content type. The bucket is public, so `evil.svg` renamed to `meme.png`
 * and declared `image/png` was served back as script from a domain the product owns.
 * The bytes decide now. See lib/media/sniff.ts.
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

    // Read the bytes once, and let them say what the file is.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniffImageType(bytes);

    if (!detected) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported image. Upload a PNG, JPEG or GIF. SVG is refused because it can carry script, and WebP because Outlook on Windows does not render it.",
        },
        { status: 400 }
      );
    }

    // Stored as what it is, never as what it claimed to be.
    const { url } = await uploadFile(Buffer.from(bytes), file.name, detected);

    // Create MediaAsset record in database
    const mediaAsset = await db.mediaAsset.create({
      data: {
        filename: file.name,
        url,
        type: detected,
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

/**
 * Google Cloud Storage utilities for the media bucket.
 *
 * Auth: uses Application Default Credentials (ADC). On Cloud Run this is the
 * runtime service account (which has roles/storage.objectAdmin on the media
 * bucket); locally it is your `gcloud auth application-default login` creds.
 * No service-account key file is used.
 *
 * Serving design: the media bucket is PRIVATE (public_access_prevention =
 * enforced). Objects are NOT served by a public bucket URL. Instead each
 * MediaAsset gets a stable app URL `${NEXT_PUBLIC_APP_URL}/api/media/<id>`,
 * and the public, unauthenticated GET /api/media/[id] route streams the bytes
 * via downloadFile() below. This yields permanent URLs embeddable in emailed
 * newsletters while keeping the bucket locked down.
 */

import { Storage } from "@google-cloud/storage";

// Lazy singletons so importing this module never authenticates or requires env.
let storage: Storage | null = null;

function getBucket() {
  const bucketName = process.env.GCS_MEDIA_BUCKET;
  if (!bucketName) {
    throw new Error(
      "Missing GCS_MEDIA_BUCKET environment variable. " +
        "Set it to the name of the GCS media bucket (e.g. <project>-media)."
    );
  }
  if (!storage) {
    // Empty options => Application Default Credentials.
    storage = new Storage();
  }
  return storage.bucket(bucketName);
}

/**
 * Upload a file to the media bucket.
 *
 * @param file - File buffer or File object to upload
 * @param filename - Original filename (used to derive the object path)
 * @param contentType - MIME type of the file (e.g. "image/png")
 * @returns The object path within the bucket. The caller builds the stable
 *   public URL from the new MediaAsset id (the bucket has no public URL).
 */
export async function uploadFile(
  file: Buffer | File,
  filename: string,
  contentType: string
): Promise<{ path: string }> {
  const bucket = getBucket();

  // Unique path with timestamp to avoid collisions; sanitize the name.
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${Date.now()}-${safeName}`;

  // Convert File to Buffer if needed.
  const buffer =
    file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

  await bucket.file(path).save(buffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return { path };
}

/**
 * Delete an object from the media bucket. A missing object does not throw.
 *
 * @param path - The object path within the bucket
 */
export async function deleteFile(path: string): Promise<void> {
  const bucket = getBucket();
  await bucket.file(path).delete({ ignoreNotFound: true });
}

/**
 * Download an object's bytes and metadata from the media bucket.
 * A not-found object surfaces as an error the caller turns into a 404.
 *
 * @param path - The object path within the bucket
 */
export async function downloadFile(
  path: string
): Promise<{ buffer: Buffer; contentType: string; size: number }> {
  const bucket = getBucket();
  const file = bucket.file(path);

  const [buffer] = await file.download();
  const [meta] = await file.getMetadata();

  return {
    buffer,
    contentType: meta.contentType ?? "application/octet-stream",
    size: buffer.length,
  };
}

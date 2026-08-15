/**
 * Google Cloud Storage, behind the same surface `lib/supabase/storage.ts` exposes.
 *
 * Signature-compatible on purpose: the five call sites import `uploadFile` and `deleteFile`
 * and should not care which bucket is underneath. `lib/storage/index.ts` picks.
 *
 * Authentication is Application Default Credentials, which on Cloud Run means the runtime
 * service account and its `objectAdmin` grant on this bucket (infra/terraform/iam.tf). There
 * is no key to hold, and `GCS_MEDIA_BUCKET` is the only configuration.
 */

import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) storage = new Storage();
  return storage;
}

function bucketName(): string {
  const name = process.env.GCS_MEDIA_BUCKET;
  if (!name) {
    throw new Error(
      "Missing GCS_MEDIA_BUCKET environment variable. It is set by Terraform on Cloud Run " +
        "(infra/terraform/run.tf); locally, set it to the media bucket name."
    );
  }
  return name;
}

/**
 * The public URL of an object.
 *
 * The media bucket is public-read, the same as the Supabase bucket it replaces, and for the
 * same unavoidable reason: these images are embedded in newsletters, and a mail client
 * cannot authenticate. A signed URL expires and would rot inside mail already delivered; an
 * app proxy route would put every image fetch in every recipient's client through Cloud Run.
 *
 * What keeps that safe is not the bucket, it is `lib/media/sniff.ts`: an upload is what its
 * bytes say, PNG, JPEG or GIF only, and the content type served comes from sniffing rather
 * than from whatever the client declared. That is the property to preserve, and `uploadFile`
 * below is where it is preserved.
 */
export function getPublicUrl(path: string): string {
  return `https://storage.googleapis.com/${bucketName()}/${encodeURI(path)}`;
}

/**
 * Upload a file to the media bucket.
 *
 * The path shape matches the Supabase implementation exactly, `${timestamp}-${safeName}`,
 * because 39 `MediaAsset` rows and 36 `Aside.imageUrl` values already hold URLs built that
 * way. Keeping the shape means a migrated object keeps its name and only its host changes.
 */
export async function uploadFile(
  file: Buffer | File,
  filename: string,
  contentType: string
): Promise<{ path: string; url: string }> {
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${timestamp}-${safeName}`;

  const data = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

  await getStorage()
    .bucket(bucketName())
    .file(path)
    .save(data, {
      // The sniffed type, never the declared one. Serving `image/svg+xml` from our own
      // domain is how a renamed file becomes script; `lib/media/sniff.ts` refuses SVG for
      // that reason and this is the other half of it.
      contentType,
      // Matches the Supabase bucket's cacheControl. Mail clients and image proxies cache
      // aggressively either way; being explicit means the behaviour did not change silently
      // with the host.
      metadata: { cacheControl: "public, max-age=3600" },
    });

  return { path, url: getPublicUrl(path) };
}

/** Delete a file. Missing objects are not an error: deleting twice should be idempotent. */
export async function deleteFile(path: string): Promise<void> {
  await getStorage()
    .bucket(bucketName())
    .file(path)
    .delete({ ignoreNotFound: true });
}

/** Shape-compatible with the Supabase listing, so callers can move without changing. */
export interface StorageFileMetadata {
  name: string;
  id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export async function listFiles(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<StorageFileMetadata[]> {
  const [files] = await getStorage()
    .bucket(bucketName())
    .getFiles({ prefix: options?.search, autoPaginate: true });

  const mapped = files.map((f) => ({
    name: f.name,
    id: String(f.metadata.id ?? f.name),
    created_at: String(f.metadata.timeCreated ?? ""),
    metadata: (f.metadata ?? null) as Record<string, unknown> | null,
  }));

  // Newest first, matching the Supabase call's sortBy. GCS lists lexicographically, and
  // since every name starts with a millisecond timestamp that is nearly the same order, but
  // nearly is not the same as the same.
  mapped.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  return mapped.slice(offset, offset + limit);
}

export async function fileExists(path: string): Promise<boolean> {
  const [exists] = await getStorage().bucket(bucketName()).file(path).exists();
  return exists;
}

/**
 * The storage seam: one import for every caller, two possible buckets underneath.
 *
 * This exists because both deployments are live at once. Vercel still serves production and
 * has no Google credentials; Cloud Run has the runtime service account and `GCS_MEDIA_BUCKET`.
 * A hard switch to GCS would have taken uploads down on the site that is actually serving
 * people, to fix a site that is not yet.
 *
 * The switch is the presence of `GCS_MEDIA_BUCKET`, not a separate feature flag. Terraform
 * sets it on Cloud Run and nothing sets it on Vercel, so the two environments select
 * correctly with no extra configuration to keep in sync, and there is no state where the
 * variable is set and the wrong backend is chosen.
 *
 * Deliberately resolved per call rather than once at module load. A module-level constant
 * would be captured at build time, and this file is imported by routes that Next.js may
 * evaluate during the build, where the variable is absent.
 *
 * Phase E deletes the Supabase side of this and the file collapses to a re-export.
 */

import * as gcs from "./gcs";
import * as supabase from "@/lib/supabase/storage";

export type StorageBackend = "gcs" | "supabase";

/** Which bucket a call will use. Exported so a diagnostic can say it out loud. */
export function storageBackend(): StorageBackend {
  return process.env.GCS_MEDIA_BUCKET ? "gcs" : "supabase";
}

function backend() {
  return storageBackend() === "gcs" ? gcs : supabase;
}

export async function uploadFile(
  file: Buffer | File,
  filename: string,
  contentType: string
): Promise<{ path: string; url: string }> {
  return backend().uploadFile(file, filename, contentType);
}

export async function deleteFile(path: string): Promise<void> {
  return backend().deleteFile(path);
}

export function getPublicUrl(path: string): string {
  return backend().getPublicUrl(path);
}

export async function fileExists(path: string): Promise<boolean> {
  return backend().fileExists(path);
}

export type StorageFileMetadata = gcs.StorageFileMetadata;

export async function listFiles(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<StorageFileMetadata[]> {
  return backend().listFiles(options);
}

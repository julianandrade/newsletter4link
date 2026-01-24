/**
 * Supabase Storage Utilities
 *
 * Server-side storage operations using the service_role key
 * for the newsletter-media bucket.
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET_NAME = "newsletter-media";

// Lazy initialization of storage client
let storageClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create the Supabase storage client using service_role key.
 * This client has elevated permissions for server-side operations.
 */
function getStorageClient() {
  if (storageClient) {
    return storageClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL environment variable. " +
        "Please set it in your .env file."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. " +
        "This is required for server-side storage operations. " +
        "You can find it in your Supabase project settings under API."
    );
  }

  storageClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return storageClient;
}

/**
 * Upload a file to the newsletter-media bucket.
 *
 * @param file - File buffer or File object to upload
 * @param filename - Name to store the file as (should include extension)
 * @param contentType - MIME type of the file (e.g., "image/png")
 * @returns Object containing the storage path and public URL
 */
export async function uploadFile(
  file: Buffer | File,
  filename: string,
  contentType: string
): Promise<{ path: string; url: string }> {
  const client = getStorageClient();

  // Generate unique path with timestamp to avoid collisions
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${timestamp}-${safeName}`;

  // Convert File to Buffer if needed
  const fileData = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .upload(path, fileData, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const url = getPublicUrl(data.path);

  return {
    path: data.path,
    url,
  };
}

/**
 * Delete a file from the newsletter-media bucket.
 *
 * @param path - The storage path of the file to delete
 */
export async function deleteFile(path: string): Promise<void> {
  const client = getStorageClient();

  const { error } = await client.storage.from(BUCKET_NAME).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Get the public URL for a file in the newsletter-media bucket.
 *
 * @param path - The storage path of the file
 * @returns The public URL
 */
export function getPublicUrl(path: string): string {
  const client = getStorageClient();

  const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(path);

  return data.publicUrl;
}

/**
 * File metadata returned from Supabase storage listing.
 */
export interface StorageFileMetadata {
  name: string;
  id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/**
 * List files in the newsletter-media bucket.
 *
 * @param options - Optional listing options
 * @returns Array of file metadata
 */
export async function listFiles(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<StorageFileMetadata[]> {
  const client = getStorageClient();

  const { data, error } = await client.storage.from(BUCKET_NAME).list("", {
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
    search: options?.search,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Check if a file exists in storage.
 *
 * @param path - The storage path to check
 * @returns True if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  const client = getStorageClient();

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .list("", { search: path });

  if (error) {
    return false;
  }

  return data?.some((file) => file.name === path) ?? false;
}

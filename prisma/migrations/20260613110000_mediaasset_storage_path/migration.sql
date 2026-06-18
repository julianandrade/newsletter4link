-- Add nullable storage-path column for the GCS media swap (Phase 3).
-- Nullable so existing rows (Supabase URLs, no GCS object) survive.
ALTER TABLE "MediaAsset" ADD COLUMN "storagePath" TEXT;

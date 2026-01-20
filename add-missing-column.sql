-- Add missing lastError column to RSSSource table
ALTER TABLE "RSSSource" ADD COLUMN "lastError" TEXT;

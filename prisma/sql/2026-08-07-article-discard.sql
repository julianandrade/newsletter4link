-- The soft discard. See lib/articles/bulk-action.ts and prisma/schema.prisma.
--
-- Nullable with no default: every existing article was not discarded, and null says so.
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "discardedAt" TIMESTAMP(3);

-- Every list read filters on this, so it earns an index.
CREATE INDEX IF NOT EXISTS "Article_discardedAt_idx" ON "Article" ("discardedAt");

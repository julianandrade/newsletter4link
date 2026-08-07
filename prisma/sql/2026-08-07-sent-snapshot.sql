-- The frozen copy of a sent edition. See lib/editions/sent-snapshot.ts.
--
-- Nullable with no default and no backfill: the editions already sent have no record of
-- what they contained, and inventing one from today's article rows would be a lie in the
-- exact column meant to stop lies. They keep rendering from the live rows.
ALTER TABLE "Edition" ADD COLUMN IF NOT EXISTS "sentSnapshot" JSONB;

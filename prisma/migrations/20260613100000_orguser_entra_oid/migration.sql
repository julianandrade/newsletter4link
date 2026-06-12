-- Auth migration (docs/MIGRATION-GCP.md Phase 2): Supabase Auth -> Auth.js + Microsoft Entra ID.
--
-- Adds the Entra ID `oid` linkage column and relaxes the legacy Supabase
-- linkage column to nullable so new (Entra-only) users and the transition
-- period are supported. `supabaseUserId` is intentionally KEPT (not dropped)
-- so the pre-Auth.js image still works on rollback; it is dropped in a later
-- migration once all active users have an `entraOid`.

-- New stable identity from Entra (the `oid` claim). Nullable.
ALTER TABLE "OrgUser" ADD COLUMN "entraOid" TEXT;

-- Relax the legacy Supabase user id to nullable (data preserved). The existing
-- composite UNIQUE ("supabaseUserId","organizationId") and the single-column
-- index are retained; Postgres treats multiple NULLs as distinct, so several
-- Entra-only rows with NULL supabaseUserId do not collide.
ALTER TABLE "OrgUser" ALTER COLUMN "supabaseUserId" DROP NOT NULL;

-- OrgUser is one row per (user, organization) membership, so uniqueness is
-- per-org (mirroring the supabaseUserId composite unique), not global — a
-- global unique would forbid multi-org membership.
CREATE UNIQUE INDEX "OrgUser_entraOid_organizationId_key" ON "OrgUser"("entraOid", "organizationId");

-- Lookup index for membership resolution by identity.
CREATE INDEX "OrgUser_entraOid_idx" ON "OrgUser"("entraOid");

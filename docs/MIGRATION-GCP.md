# Newsletter4Link — Vercel/Supabase → GCP Migration Runbook

Migrates Newsletter4Link from **Vercel (hosting) + Supabase (Postgres+pgvector,
Auth, Storage)** to **Google Cloud** (project `newsletter-link-ai-radar`):

- Hosting: Vercel → **Cloud Run v2**
- Database: Supabase Postgres → **Cloud SQL Postgres 17** (+pgvector)
- Media: Supabase Storage → **GCS** (Phase 3)
- Auth: Supabase Auth → **Auth.js + Microsoft Entra ID** (Phase 2, NOT yet built)
- Cron: Vercel Cron → **Cloud Scheduler**
- Secrets: Vercel env → **Secret Manager**
- Images: → **Artifact Registry**

Infrastructure is provisioned by `infra/terraform/` (see its README). The
Dockerfile and GitHub Actions deploy workflow are owned separately.

> **Validation note:** commands here were written against the documented schema
> and Cloud SQL/Supabase behavior but were **not executed** in an authoring
> sandbox. Run each step deliberately and verify before proceeding. Anything
> unverified is flagged inline with ⚠.

Region default: `europe-southwest1` (Madrid, closest to the Lisbon-based company).

---

## Phase 0 — Provision infrastructure + load secrets

### 0.1 Apply Terraform

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project newsletter-link-ai-radar

cd infra/terraform
cp terraform.tfvars.example terraform.tfvars        # edit values
export TF_VAR_cron_secret="$(openssl rand -hex 32)"  # SAVE THIS

terraform init
terraform plan
terraform apply
```

Capture outputs:

```bash
terraform output                       # all
terraform output -raw cloud_run_url
terraform output -raw sql_instance_connection_name
terraform output -raw wif_provider
terraform output -raw deployer_sa
```

Then set `app_url` in `terraform.tfvars` to the `cloud_run_url` (or a custom
domain) and `terraform apply` again so Scheduler targets and
`NEXT_PUBLIC_APP_URL` resolve correctly.

### 0.2 Load out-of-band secret values

`database-url` / `direct-url` already have TF-managed versions. Add the rest
(`PROJECT=newsletter-link-ai-radar`). **`cron-secret` must equal
`TF_VAR_cron_secret`.**

```bash
printf '%s' "$TF_VAR_cron_secret"        | gcloud secrets versions add cron-secret           --project=$PROJECT --data-file=-
printf '%s' "sk-ant-..."                 | gcloud secrets versions add anthropic-api-key      --project=$PROJECT --data-file=-
printf '%s' "sk-..."                     | gcloud secrets versions add openai-api-key         --project=$PROJECT --data-file=-
printf '%s' "re_..."                     | gcloud secrets versions add resend-api-key         --project=$PROJECT --data-file=-
printf '%s' "whsec_..."                  | gcloud secrets versions add resend-webhook-secret  --project=$PROJECT --data-file=-
printf '%s' "$(openssl rand -hex 32)"    | gcloud secrets versions add unsubscribe-secret     --project=$PROJECT --data-file=-
printf '%s' "tvly-..."                   | gcloud secrets versions add tavily-api-key          --project=$PROJECT --data-file=-
printf '%s' "https://<ref>.supabase.co"  | gcloud secrets versions add supabase-url           --project=$PROJECT --data-file=-
printf '%s' "<supabase-anon-key>"        | gcloud secrets versions add supabase-anon-key       --project=$PROJECT --data-file=-
```

> ⚠ `SUPABASE_SERVICE_ROLE_KEY` (used by `lib/supabase/storage.ts` for
> server-side storage during Phase 1) is NOT in the Terraform secret list. If
> media stays on Supabase Storage through Phase 1, add a `supabase-service-role-key`
> secret + Cloud Run env the same way, or defer until Phase 3 storage swap.
> Flagged so it isn't silently dropped.

### 0.3 Set GitHub repo variables (for the deploy workflow, other agent)

```bash
gh variable set GCP_WIF_PROVIDER  --repo julianandrade/newsletter4link --body "$(terraform output -raw wif_provider)"
gh variable set GCP_DEPLOYER_SA   --repo julianandrade/newsletter4link --body "$(terraform output -raw deployer_sa)"
```

### Phase 0 rollback

Nothing in production has changed yet — Vercel/Supabase still serve traffic.
To unwind: `terraform destroy` (Cloud SQL has `deletion_protection = true`, so
either set it false and re-apply first, or delete the instance manually). Remove
the GitHub repo variables.

---

## Phase 1 — Database cutover

Goal: get all data into Cloud SQL and point the app at it. Two paths — pick one.

### 1.A Start the Cloud SQL Auth Proxy (needed for both paths)

```bash
CONN="$(cd infra/terraform && terraform output -raw sql_instance_connection_name)"
cloud-sql-proxy "$CONN" --port 5432 &     # listens on 127.0.0.1:5432
```

Get the app DB password (TF-generated, in Secret Manager via the DSN):

```bash
# The full DSN is in the database-url secret; extract the password from it,
# or read it from terraform state:
gcloud secrets versions access latest --secret=database-url --project=$PROJECT
# -> postgresql://app:<PASSWORD>@localhost/newsletter?host=/cloudsql/...
```

Workstation connection string (note: Auth Proxy form, NOT the unix-socket form):

```
postgresql://app:<PASSWORD>@127.0.0.1:5432/newsletter?sslmode=disable
```

> The proxy terminates TLS to Cloud SQL itself, so `sslmode=disable` on the
> loopback side is correct and expected.

### Path 1 — Logical dump/restore from Supabase (preserves all data)

Use Supabase's **DIRECT_URL** (not the pooler) as the source.

```bash
# 1. Dump the public schema from Supabase (data + DDL, no ownership/grants).
pg_dump "$SUPABASE_DIRECT_URL" \
  --no-owner --no-privileges \
  --schema=public \
  --format=plain \
  --file=supabase_public.sql

# 2. (optional) keep a copy in the backups bucket.
gsutil cp supabase_public.sql gs://newsletter-link-ai-radar-backups/cutover/

# 3. Ensure pgvector exists on the target BEFORE restore (the dump references
#    vector(1536) and the HNSW index). Easiest: let Prisma migrations create it
#    (see Path 2 step 1), OR create it manually:
psql "postgresql://app:<PASSWORD>@127.0.0.1:5432/newsletter?sslmode=disable" \
  -c 'CREATE EXTENSION IF NOT EXISTS vector;'

# 4. Restore into Cloud SQL via the proxy.
psql "postgresql://app:<PASSWORD>@127.0.0.1:5432/newsletter?sslmode=disable" \
  -v ON_ERROR_STOP=1 \
  -f supabase_public.sql
```

> ⚠ Supabase databases often have a `vector` extension installed into a
> non-`public` schema (e.g. `extensions`). `pg_dump --schema=public` will NOT
> carry the extension, hence the explicit `CREATE EXTENSION` in step 3. If the
> dump still references `extensions.vector`, edit the dump's type references to
> bare `vector` or pre-create the extension in `public`. Verify the `\dx vector`
> location on the source first.
>
> ⚠ Supabase auth/storage objects live in `auth.*` / `storage.*` schemas, which
> are intentionally excluded by `--schema=public`. The app's auth tables are
> `OrgUser` etc. in `public` (Supabase user linkage is via
> `OrgUser.supabaseUserId`), so app data is preserved; the Supabase-managed auth
> backend is handled in Phase 2.

### Path 2 — Clean start (no historical data; rebuild from migrations + seeds)

Use this if the prod dataset is disposable (e.g. only seed/demo content).

```bash
# 1. Apply Prisma migrations to Cloud SQL. Migrations CREATE EXTENSION vector
#    and create the Article_embedding_hnsw_idx index for you.
export DIRECT_URL="postgresql://app:<PASSWORD>@127.0.0.1:5432/newsletter?sslmode=disable"
export DATABASE_URL="$DIRECT_URL"
npm run db:migrate:deploy        # prisma migrate deploy

# 2. Re-run seeds (whatever the project uses, e.g. tests/e2e/seed.ts or a
#    package.json seed script) against the same DIRECT_URL.
```

### 1.B Verify (run for both paths)

```bash
PSQL="psql postgresql://app:<PASSWORD>@127.0.0.1:5432/newsletter?sslmode=disable -t -A"

# Row counts on the core tables (compare against Supabase numbers for Path 1):
$PSQL -c 'SELECT count(*) FROM "Organization";'
$PSQL -c 'SELECT count(*) FROM "OrgUser";'
$PSQL -c 'SELECT count(*) FROM "Article";'
$PSQL -c 'SELECT count(*) FROM "Subscriber";'
$PSQL -c 'SELECT count(*) FROM "Edition";'

# pgvector extension present:
$PSQL -c '\dx vector'

# HNSW index present (created by the pgvector migration):
$PSQL -c '\di "Article_embedding_hnsw_idx"'

# pgvector smoke test (operator resolves):
$PSQL -c "SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector AS cosine_distance;"
```

> The `<=>` cosine operator and `Article_embedding_hnsw_idx` are what
> `lib/curation/deduplicator.ts` relies on — both must be present.

### 1.C Point the app at Cloud SQL

The Cloud Run service already reads `DATABASE_URL`/`DIRECT_URL` from Secret
Manager (unix-socket form). Once CI deploys the real image (other agent's
workflow), Cloud Run is live on Cloud SQL. Cut DNS / custom domain to Cloud Run.

**Interim option — keep hosting on Vercel, point at Cloud SQL:** possible but
requires reaching Cloud SQL from Vercel's network. Cloud SQL here has public IP
with **no authorized networks**, so Vercel cannot connect as-is. To do it you'd
have to either (a) add Vercel egress IPs to `authorized_networks` in `sql.tf`
(widens exposure — discouraged) or (b) run the Cloud SQL connector, which Vercel
doesn't natively support. **Recommendation: skip the interim split and move
hosting to Cloud Run the same day as the DB cutover.**

### Phase 1 rollback

- App still has the original Supabase `DATABASE_URL` in Vercel env. Revert by
  leaving/repointing Vercel at Supabase; do not cut DNS to Cloud Run until 1.B
  passes.
- Cloud SQL changes are additive (new instance); no destructive action on
  Supabase occurs during Path 1/2. Keep Supabase running until Phase 2
  completes.
- If a restore is corrupt: drop and recreate the `newsletter` database on Cloud
  SQL and re-run Path 1/2. The `supabase_public.sql` dump in the backups bucket
  is the recovery artifact.

---

## Phase 2 — Auth migration: Auth.js + Microsoft Entra ID (IMPLEMENTED)

> Implemented in code (this repo). Supabase Auth (GoTrue) has been replaced by
> **Auth.js (NextAuth v5)** with a **Microsoft Entra ID** provider. Supabase
> **Storage** is untouched (Phase 3). Supabase can be **decommissioned only after
> this phase** is verified against real Entra sign-in in production.

### What was built

- **`auth.config.ts`** — edge-safe config (no Prisma): the Entra provider
  (`microsoft-entra-id`, scopes `openid profile email`) reading
  `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER`, JWT session strategy, `trustHost`,
  and the edge `authorized` callback. Imported by the middleware.
- **`auth.ts`** — full Node-runtime config: spreads `auth.config.ts`, adds the
  E2E-only Credentials provider, and the `jwt`/`session` callbacks. The `jwt`
  callback performs the §2.2 lazy remap (entraOid → email fallback → backfill)
  using Prisma. Exports `handlers/auth/signIn/signOut`.
- **`app/api/auth/[...nextauth]/route.ts`** — Auth.js GET/POST handlers. The
  Entra callback URL is `…/api/auth/callback/microsoft-entra-id`.
- **`proxy.ts`** — middleware now checks the Auth.js session (edge config, no
  DB). Same public-route list; unauthenticated → `/login?redirect=…`,
  authenticated on `/login` → `/dashboard`.
- **`lib/auth/context.ts`** — `requireOrgContext()` / `getAuthContext()` resolve
  the user from `auth()`; membership lookup is by `entraOid` first, then email
  (case-insensitive) with `entraOid` backfill. The `OrgContext`/`ctx.*` shape is
  unchanged so the ~70 API routes need no edits. Rate-limit keys that used
  `membership.supabaseUserId` now use the stable `membership.id`.
- **`lib/auth/hooks.ts`** + **`app/providers.tsx`** — `useAuth()` wraps
  `next-auth/react`; `<SessionProvider>` is mounted in the root layout.
- **`app/login/page.tsx`** — primary "Sign in with Microsoft"
  (`signIn("microsoft-entra-id")`); the password form (selectors `#login-email`,
  `#login-password`, button "Sign In") renders **only** when
  `NEXT_PUBLIC_E2E_TEST_MODE === "true"`. Sign-up flow removed.
- **Prisma migration** `20260613100000_orguser_entra_oid`: adds
  `OrgUser.entraOid TEXT UNIQUE` (nullable) and makes `supabaseUserId` nullable
  (retained for rollback — not dropped).
- **`lib/supabase/server.ts` / `client.ts`** and the `@supabase/ssr` dependency
  were removed (auth-only). `lib/supabase/storage.ts` stays.

### E2E / CI (test-only sign-in)

A **Credentials** provider is registered **only** when `E2E_TEST_MODE === "true"`
and validates `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` by exact match, returning a
user with id `e2e:<email>`. The e2e seed (`tests/e2e/seed.ts`) creates the
`OrgUser` with `entraOid = "e2e:<email>"` — **no Supabase admin calls**.

> ⚠ **`E2E_TEST_MODE` (and `NEXT_PUBLIC_E2E_TEST_MODE`) must NEVER be set in
> production.** With the flag unset there is no password sign-in path at all; the
> only way in is Microsoft Entra ID.

### 2.1 Entra ID (Azure AD) app registration

In the Entra admin center → App registrations → New registration:

1. **Name:** `Newsletter4Link`.
2. **Supported account types:** single tenant (Link Consulting tenant).
3. **Redirect URI** (type *Web*):
   `https://<app-url>/api/auth/callback/microsoft-entra-id`
   (use the Cloud Run URL or custom domain; add the localhost variant
   `http://localhost:3000/api/auth/callback/microsoft-entra-id` for dev).
4. After creation, copy: **Directory (tenant) ID**, **Application (client) ID**.
5. Certificates & secrets → New client secret → copy the **secret value** (shown
   once).
6. (Optional) Token configuration / API permissions: `openid`, `profile`,
   `email`, `User.Read` — enough for sign-in + email claim.

Store these as new Secret Manager secrets + Cloud Run env (already wired in
`infra/terraform/` — see the README's secret-loading commands):
`entra-client-id` → `AUTH_MICROSOFT_ENTRA_ID_ID`, `entra-client-secret` →
`AUTH_MICROSOFT_ENTRA_ID_SECRET`, `entra-issuer` →
`AUTH_MICROSOFT_ENTRA_ID_ISSUER` (`https://login.microsoftonline.com/<tenant-id>/v2.0`),
and `auth-secret` → `AUTH_SECRET` (`openssl rand -base64 33`). Cloud Run also
sets `AUTH_TRUST_HOST=true`.

### 2.2 User remap (supabaseUserId → Entra OID), by email

`OrgUser` currently links to Supabase via `OrgUser.supabaseUserId`. Entra issues
a stable **OID** (`oid` claim) per user. Plan:

1. ✅ `entraOid` column added to `OrgUser` (migration
   `20260613100000_orguser_entra_oid`). `supabaseUserId` kept (now nullable).
2. ✅ **Lazy remap-by-email implemented** in the `jwt` callback (`auth.ts`) and
   in `getUserOrganizations` (`lib/auth/context.ts`): on Entra sign-in we match
   the token's `email`/`preferred_username` (case-insensitive) to an existing
   `OrgUser.email`; if found with a null `entraOid`, we set `entraOid` to the
   token's `oid`. Sessions are keyed on `entraOid`. For users who never sign in,
   optionally pre-seed `entraOid` from a directory export joined on email.
3. Once all active users have `entraOid`, drop `supabaseUserId` in a later
   migration (rollback safety until then — see Phase 2 rollback).

> ⚠ Email collisions / users with changed emails must be reconciled manually.
> Verify Entra returns `email` for all org users (some accounts only expose
> `upn`; the provider falls back to `preferred_username`).

### 2.3 Cutover

Deploy the Auth.js build, flip the sign-in entry point to Entra, verify a real
user can sign in and lands on their org. Keep Supabase Auth reachable as fallback
until confidence is high.

### Phase 2 rollback

- Revert the Cloud Run revision to the pre-Auth.js image (Cloud Run keeps
  revisions; `gcloud run services update-traffic <svc> --to-revisions=<prev>=100`).
- `supabaseUserId` is retained, so the Supabase-auth build still works on
  rollback. Do **not** drop `supabaseUserId` or decommission Supabase until this
  phase is fully accepted.

---

## Phase 3 — Media storage swap to GCS — **IMPLEMENTED**

Supabase Storage is replaced by GCS. The `${project_id}-media` bucket and the
runtime SA's `objectAdmin` binding already exist (Terraform, untouched here).

What was implemented:

- **GCS client via ADC, no key file.** `lib/storage/gcs.ts` (`@google-cloud/storage`)
  replaces `lib/supabase/storage.ts` (deleted). It uses Application Default
  Credentials — the runtime service account on Cloud Run, or `gcloud auth
  application-default login` locally. The bucket name comes from
  `GCS_MEDIA_BUCKET` and is validated lazily on first use (so builds/CI stay
  green without a real bucket).
- **Private bucket + public proxy with stable URLs.** The bucket stays private
  (`public_access_prevention = enforced`); we do **not** use signed URLs or a
  public bucket. Each `MediaAsset` gets a stable app URL
  `${NEXT_PUBLIC_APP_URL}/api/media/<id>`. The new **public, unauthenticated**
  route `GET /api/media/[id]` streams the object bytes from GCS. This gives
  permanent URLs embeddable in emailed newsletters while keeping the bucket
  locked down. `proxy.ts` whitelists `"/api/media/"` (trailing slash) so the
  per-asset route is public while list/DELETE at `/api/media` stay protected.
- **Schema.** `MediaAsset.storagePath String?` added (migration
  `20260613110000_mediaasset_storage_path`) to hold the GCS object path.
- **Upload/delete.** `POST /api/media/upload` uploads to GCS, creates the row,
  then sets `url` from the new id. `DELETE /api/media` deletes the GCS object
  via `storagePath`.
- **Supabase removed from the app.** `@supabase/supabase-js` is dropped from
  `package.json`; nothing in `app/`/`lib/`/`components/` imports any `@supabase`
  package. The `supabase-url` / `supabase-anon-key` Secret Manager entries and
  the corresponding Cloud Run secret env were removed; `GCS_MEDIA_BUCKET` is a
  plain Cloud Run env. The only remaining Supabase reference is the CI **e2e**
  job, which boots Postgres via the Supabase CLI (`supabase start`); Phase 1 ops
  swaps that local stack to a plain Postgres container — it is not app storage.

> **Data-migration follow-up (not done in code).** Existing `MediaAsset` rows
> have Supabase Storage URLs and a `null` `storagePath`; they will **not** serve
> from GCS (the proxy returns 404 for null `storagePath`) until they are
> re-uploaded or migrated. To migrate, copy objects into
> `gs://${project_id}-media` (`gcloud storage cp`) and backfill `storagePath` +
> the new `/api/media/<id>` `url` for each row. Do **not** decommission Supabase
> Storage until this is complete.

### Phase 3 rollback

Revert the Cloud Run revision. The previous (Supabase-storage) image keeps
working as long as the Supabase project is alive — so do **not** decommission
Supabase Storage until media is fully re-uploaded/migrated to GCS. Any objects
copied to GCS are additive; Supabase originals remain until explicitly deleted.

---

## Decommissioning Supabase (final)

Only after Phases 1–3 are accepted in production:

1. Confirm Cloud SQL is the system of record (Phase 1 ✓) and no app env still
   references Supabase DB.
2. Confirm Entra auth is the only sign-in path and all active users have
   `entraOid` (Phase 2 ✓).
3. Confirm media is served from GCS (Phase 3 ✓).
4. Take a final Supabase logical backup → `gs://${project_id}-backups/final/`.
5. Pause, then delete the Supabase project.

Never delete the Supabase backup artifact in the backups bucket until well past
the verification window.

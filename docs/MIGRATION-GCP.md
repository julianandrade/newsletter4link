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

## Phase 2 — Auth migration: Auth.js + Microsoft Entra ID (NOT YET IMPLEMENTED)

> Preview only. No code for this exists yet. Supabase Auth stays live through
> Phase 1; Supabase can be **decommissioned only after this phase** is complete
> and verified.

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

Store these as new Secret Manager secrets + Cloud Run env (mirror the Phase 0
pattern): `entra-tenant-id`, `entra-client-id`, `entra-client-secret`, plus
`AUTH_SECRET` (`openssl rand -base64 33`).

### 2.2 User remap (supabaseUserId → Entra OID), by email

`OrgUser` currently links to Supabase via `OrgUser.supabaseUserId`. Entra issues
a stable **OID** (`oid` claim) per user. Plan:

1. Add an `entraOid` column to `OrgUser` (new Prisma migration). Keep
   `supabaseUserId` during transition.
2. **Remap-by-email script concept:** on first Entra sign-in, match the incoming
   token's `email`/`preferred_username` (case-insensitive) to an existing
   `OrgUser.email`; if found and `entraOid` is null, set `entraOid` to the
   token's `oid`. This migrates accounts lazily and safely (no bulk guess).
   For users who never sign in, optionally pre-seed `entraOid` from a directory
   export joined on email.
3. Once all active users have `entraOid`, make Auth.js key sessions on `entraOid`
   and drop `supabaseUserId` in a later migration.

> ⚠ Conceptual — no script is written. Email collisions / users with changed
> emails must be reconciled manually. Verify Entra returns `email` for all org
> users (some accounts only expose `upn`).

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

## Phase 3 — Media storage swap to GCS (note only)

Not in scope to implement here. The `${project_id}-media` bucket and the runtime
SA's `objectAdmin` binding already exist (Terraform). When implemented:

- Swap `lib/supabase/storage.ts` for a GCS client (`@google-cloud/storage`),
  using the runtime SA (no key file — ADC on Cloud Run).
- Serve private objects via **V4 signed URLs** (bucket is `public_access_prevention
  = enforced`).
- Migrate existing objects: `gsutil -m cp` / `gcloud storage cp` from a Supabase
  Storage export into `gs://${project_id}-media`, preserving key paths.
- Then `supabase-url` / `supabase-anon-key` / `supabase-service-role-key` secrets
  and Cloud Run env can be removed.

### Phase 3 rollback

Keep the Supabase storage code path behind the `EMAIL_PROVIDER`-style toggle or a
feature flag; revert the Cloud Run revision. Objects copied to GCS are additive —
Supabase originals remain until explicitly deleted.

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

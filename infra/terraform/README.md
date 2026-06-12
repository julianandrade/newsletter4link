# Newsletter4Link - GCP Infrastructure (Terraform)

Infrastructure-as-code for migrating Newsletter4Link from Vercel + Supabase to
Google Cloud (project `newsletter-link-ai-radar`).

Provisions: Cloud SQL Postgres 17 (+pgvector via Prisma migrations), Cloud Run v2,
GCS (media + backups), Cloud Scheduler (3 cron jobs), Secret Manager, Artifact
Registry, and Workload Identity Federation for GitHub Actions.

> Scope: this Terraform owns infrastructure only. The container image and the
> GitHub Actions deploy workflow are owned separately (Dockerfile + `.github/`).
> Cloud Run runs a placeholder image until CI deploys the real one; TF
> deliberately ignores image changes (`run.tf` `lifecycle.ignore_changes`).

## Prerequisites

- `gcloud` CLI authenticated as a project owner/editor:
  ```bash
  gcloud auth login
  gcloud auth application-default login
  gcloud config set project newsletter-link-ai-radar
  ```
- Terraform >= 1.7
- The `cloudsql-proxy` component for DB work (Phase 1):
  `gcloud components install cloud-sql-proxy` (or download the standalone binary).

## State

Local state by default (`terraform.tfstate` on disk). State contains the
generated DB password — **do not commit it**. For team use, create a GCS bucket
and uncomment the `backend "gcs"` block in `versions.tf`, then
`terraform init -migrate-state`.

## Files

| File | Contents |
|------|----------|
| `versions.tf` | Providers, required versions, (commented) GCS backend |
| `variables.tf` | Inputs incl. `cron_secret` (sensitive) |
| `apis.tf` | `google_project_service` for all required APIs |
| `sql.tf` | Cloud SQL PG17 instance, DB, app user, generated password |
| `storage.tf` | media + backups buckets (private) |
| `registry.tf` | Artifact Registry Docker repo `app` |
| `secrets.tf` | Secret Manager secrets (+ TF-set DB url versions) |
| `iam.tf` | runtime + deployer service accounts and least-privilege bindings |
| `run.tf` | Cloud Run v2 service (placeholder image, secret env, Cloud SQL volume) |
| `scheduler.tf` | 3 Cloud Scheduler GET jobs with bearer header |
| `wif.tf` | Workload Identity pool/provider + deployer impersonation |
| `outputs.tf` | connection name, run URL, buckets, WIF provider, deployer SA |

## Apply order

Terraform resolves dependencies automatically; a single `apply` is enough.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit values
export TF_VAR_cron_secret="$(openssl rand -hex 32)"   # keep this value!

terraform init
terraform plan
terraform apply
```

After apply, capture the generated app URL and re-apply so scheduler targets and
`NEXT_PUBLIC_APP_URL` are correct:

```bash
terraform output cloud_run_url
# put that value (or a custom domain) into terraform.tfvars: app_url = "https://..."
terraform apply
```

## Setting the out-of-band secret values

TF creates the secret *containers* but most VALUES are added manually so secrets
never live in TF state. `database-url` and `direct-url` are the exception — TF
sets them from the generated DB password.

The `cron-secret` value **must equal** `TF_VAR_cron_secret` (Scheduler sends it
as the bearer header; the app validates it as `CRON_SECRET`).

```bash
PROJECT=newsletter-link-ai-radar

# cron-secret MUST match TF_VAR_cron_secret used above:
printf '%s' "$TF_VAR_cron_secret" | gcloud secrets versions add cron-secret --project=$PROJECT --data-file=-

printf '%s' "sk-ant-..."  | gcloud secrets versions add anthropic-api-key      --project=$PROJECT --data-file=-
printf '%s' "sk-..."      | gcloud secrets versions add openai-api-key         --project=$PROJECT --data-file=-
printf '%s' "re_..."      | gcloud secrets versions add resend-api-key         --project=$PROJECT --data-file=-
printf '%s' "whsec_..."   | gcloud secrets versions add resend-webhook-secret  --project=$PROJECT --data-file=-
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets versions add unsubscribe-secret --project=$PROJECT --data-file=-
printf '%s' "tvly-..."    | gcloud secrets versions add tavily-api-key         --project=$PROJECT --data-file=-
printf '%s' "https://<ref>.supabase.co" | gcloud secrets versions add supabase-url --project=$PROJECT --data-file=-
printf '%s' "<anon-key>"  | gcloud secrets versions add supabase-anon-key      --project=$PROJECT --data-file=-
```

> Use `printf '%s'` (no trailing newline) so the secret has no stray `\n`.
> `database-url` / `direct-url` already have a TF-managed version; do not add
> versions manually unless rotating the DB password.

## Cost ballpark (monthly, EUR, europe-southwest1, low traffic)

| Resource | Assumption | ~Cost |
|----------|-----------|-------|
| Cloud SQL (db-g1-small, zonal, 10GB SSD) | always-on | 30-45 |
| Cloud SQL (db-f1-micro budget alt.) | always-on | 9-12 |
| Cloud Run | scale-to-zero, light traffic | 0-5 |
| GCS (media + backups) | a few GB | <1 |
| Artifact Registry | a few image versions | <1 |
| Cloud Scheduler | 3 jobs (first 3 free) | 0 |
| Secret Manager | ~13 secrets, few accesses | <1 |
| Egress / misc | low | 1-3 |
| **Total (db-g1-small)** | | **~35-55** |
| **Total (db-f1-micro)** | | **~12-22** |

Cloud SQL dominates. The biggest lever is the DB tier (`var.db_tier`) and
zonal-vs-regional (`availability_type` in `sql.tf`).

## Validation note

The Terraform CLI was **not available** in the authoring sandbox, so
`terraform validate` / `plan` were not run. HCL was self-reviewed. Run
`terraform validate` and `terraform plan` before the first `apply`.

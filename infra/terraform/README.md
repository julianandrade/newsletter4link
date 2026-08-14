# Newsletter4Link, GCP infrastructure (Terraform)

Infrastructure as code for migrating Newsletter4Link from Vercel and Supabase to Google
Cloud (project `newsletter-link-ai-radar`).

Provisions: a VPC with Cloud NAT behind a reserved static egress IP, Cloud SQL Postgres 17
(pgvector arrives with the Prisma baseline), Cloud Run v2, GCS for media and backups, four
Cloud Scheduler jobs, Secret Manager, Artifact Registry, and Workload Identity Federation
for GitHub Actions.

**Auth stays on Supabase.** That is a decision, not an omission. The Auth.js and Microsoft
Entra ID work exists on the tag `archive/claude-production-readiness-review` and is out of
scope here; the four `auth-*` and `entra-*` secrets it created are deliberately gone, and
`supabase-service-role-key` is in their place. `OrgUser.supabaseUserId` is a plain string
with no foreign key into `auth.users` and the schema has no RLS, which is what makes moving
the 30 app tables to Cloud SQL while Supabase keeps serving identity a safe thing to do.

> Scope: this Terraform owns infrastructure only. The image and the deploy workflow live in
> `Dockerfile` and `.github/workflows/deploy.yml`. Cloud Run runs a placeholder image until
> CI deploys a real one, and TF deliberately ignores image changes
> (`run.tf`, `lifecycle.ignore_changes`).

## Prerequisites

- `gcloud` authenticated as a project owner or editor:
  ```bash
  gcloud auth login
  gcloud auth application-default login
  gcloud config set project newsletter-link-ai-radar
  ```
- Terraform >= 1.7
- `cloud-sql-proxy` for database work in Phase C:
  `gcloud components install cloud-sql-proxy`

## State

Local state by default (`terraform.tfstate` on disk). State contains the generated database
password, so **do not commit it**. For team use, create a GCS bucket and uncomment the
`backend "gcs"` block in `versions.tf`, then `terraform init -migrate-state`.

## Files

| File | Contents |
|------|----------|
| `versions.tf` | Providers, required versions, commented GCS backend |
| `variables.tf` | Inputs, including `cron_secret` (sensitive) and the Supabase values |
| `apis.tf` | `google_project_service` for every API the stack needs |
| `network.tf` | VPC, subnet, Cloud Router, Cloud NAT, reserved static egress IP |
| `sql.tf` | Cloud SQL PG17 instance, database, app user, generated password |
| `storage.tf` | media and backups buckets, both private |
| `registry.tf` | Artifact Registry Docker repo `app` |
| `secrets.tf` | Secret Manager containers, plus TF-owned database URL versions |
| `iam.tf` | runtime and deployer service accounts, least-privilege bindings |
| `run.tf` | Cloud Run v2 service: placeholder image, env model, VPC egress, SQL volume |
| `scheduler.tf` | Four Cloud Scheduler GET jobs, **created paused** |
| `wif.tf` | Workload Identity pool and provider, deployer impersonation |
| `outputs.tf` | connection name, run URL, egress IP, buckets, WIF provider, deployer SA |

## The static egress IP, and why it is here

`network.tf` is the one part of this stack that is not a like-for-like replacement of
something Vercel was doing. beehiiv refuses requests from Vercel's egress ranges, and
Cloud Run's default egress is an equally unallowlistable pool of Google addresses, so
moving hosts on its own would change nothing. What fixes it is `google_compute_address`:
one reserved IP that can be named on somebody else's allowlist and stays true across a
NAT being destroyed and recreated.

Two things to get right, both easy to miss:

- `egress = "ALL_TRAFFIC"` in `run.tf`. With `PRIVATE_RANGES_ONLY` the address exists, is
  billed, and is the source of nothing.
- Verify it from **inside** a Cloud Run request against an IP echo service, and compare to
  `terraform output egress_ip`. A matching pair is the proof. Anything else is a guess.

## Apply order

Terraform resolves dependencies, so one `apply` is enough.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit values
export TF_VAR_cron_secret="$(openssl rand -hex 32)"   # keep this value

terraform init
terraform plan
terraform apply
```

Then capture the generated URL and apply once more, so the scheduler targets and
`NEXT_PUBLIC_APP_URL` are right. Two applies is not clumsiness: a service cannot reference
its own generated URI from inside its own definition without a dependency cycle.

```bash
terraform output cloud_run_url
# put that value, or a custom domain, into terraform.tfvars as app_url
terraform apply
```

## Setting the out-of-band secret values

TF creates the secret *containers*; most values are added by hand so that secrets never
enter TF state. `database-url` and `direct-url` are the exception: TF sets them from the
password it generated.

**A revision referencing a secret with no version does not start.** So every secret in the
required list below needs a version before the first Cloud Run apply. The optional ones do
not, and that is what `var.mounted_optional_secrets` is for: it decides which optional
secrets the revision references at all, so an unconfigured integration means "SharePoint
import is off" rather than "the service will not boot".

```bash
PROJECT=newsletter-link-ai-radar

# Required. cron-secret MUST equal TF_VAR_cron_secret used above.
printf '%s' "$TF_VAR_cron_secret" | gcloud secrets versions add cron-secret --project=$PROJECT --data-file=-

printf '%s' "sk-ant-..." | gcloud secrets versions add anthropic-api-key         --project=$PROJECT --data-file=-
printf '%s' "sk-..."     | gcloud secrets versions add openai-api-key            --project=$PROJECT --data-file=-
printf '%s' "re_..."     | gcloud secrets versions add resend-api-key            --project=$PROJECT --data-file=-
printf '%s' "eyJ..."     | gcloud secrets versions add supabase-service-role-key --project=$PROJECT --data-file=-

# UNSUBSCRIBE_SECRET is NOT a fresh random value. It is the HMAC key over every
# unsubscribe and archive link in mail already delivered, so it must be copied from the
# current environment. A new one turns every link in every sent newsletter into a 404,
# which CLAUDE.md notes is indistinguishable from a missing edition.
printf '%s' "<the existing UNSUBSCRIBE_SECRET>" | gcloud secrets versions add unsubscribe-secret --project=$PROJECT --data-file=-

# Optional. Add the value, then add the secret id to var.mounted_optional_secrets.
printf '%s' "whsec_..." | gcloud secrets versions add resend-webhook-secret         --project=$PROJECT --data-file=-
printf '%s' "whsec_..." | gcloud secrets versions add resend-inbound-webhook-secret --project=$PROJECT --data-file=-
printf '%s' "tvly-..."  | gcloud secrets versions add tavily-api-key                --project=$PROJECT --data-file=-
```

> Use `printf '%s'`, with no trailing newline. This is not hygiene advice, it is this
> project's own history: `RESEND_API_KEY`, `DATABASE_URL` and `DIRECT_URL` in `.env` all
> end in a literal `\n` inside their quotes, which cost an hour of misdiagnosis on
> 6 August 2026 because Resend answers a trailing newline with "API key is invalid".
> `lib/config.ts` strips the escape now, so the app survives it, but a secret is read by
> more than the app.
>
> `database-url` and `direct-url` already have a TF-managed version. Do not add versions by
> hand unless rotating the password.

Two plain values are **not** secrets and must be set as Terraform variables *and* as
GitHub repo variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Next.js inlines every `NEXT_PUBLIC_*` value into the client bundle at **build** time, so a
Cloud Run environment variable alone reaches the server and not the browser. Set them in
`terraform.tfvars` for the server and as repo variables for `docker build`, or sign-in
fails in a browser against a service whose logs look perfectly healthy.

## Cost ballpark (monthly, EUR, europe-southwest1, low traffic)

| Resource | Assumption | ~Cost |
|----------|-----------|-------|
| Cloud SQL (db-g1-small, zonal, 10GB SSD) | always on | 30-45 |
| Cloud SQL (db-f1-micro budget alternative) | always on | 9-12 |
| Cloud Run | scale to zero, light traffic | 0-5 |
| Reserved static IP | held continuously | ~3 |
| Cloud NAT | gateway plus low data volume | 2-5 |
| GCS (media and backups) | a few GB | <1 |
| Artifact Registry | a few image versions | <1 |
| Cloud Scheduler | 4 jobs, first 3 free | <1 |
| Secret Manager | ~11 secrets, few accesses | <1 |
| Egress and misc | low | 1-3 |
| **Total (db-g1-small)** | | **~40-65** |
| **Total (db-f1-micro)** | | **~17-30** |

Cloud SQL dominates. The levers are `var.db_tier` and `availability_type` in `sql.tf`. The
NAT and the address add roughly 5 to 8 a month, which is the price of an allowlistable
egress source; nothing else in this stack buys that.

## Validation

`terraform fmt`, `terraform init -backend=false` and `terraform validate` all pass, run
14 August 2026 against Terraform v1.15.2.

`terraform plan` has **not** been run, because it needs credentials for the project. Run
`plan` and read it before the first `apply`. The original version of this README noted that
the CLI was unavailable in the authoring sandbox and that the HCL was only self-reviewed;
that is no longer the case for syntax, and is still the case for anything only the API can
answer, such as whether a quota or an org policy refuses a resource.

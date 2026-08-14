variable "project_id" {
  description = "GCP project ID hosting all Newsletter4Link resources."
  type        = string
  default     = "newsletter-link-ai-radar"
}

variable "region" {
  description = "Default GCP region. europe-southwest1 = Madrid, the closest region to the Lisbon-based company."
  type        = string
  default     = "europe-southwest1"
}

variable "app_name" {
  description = "Logical application name; used as a prefix/label for resources."
  type        = string
  default     = "newsletter4link"
}

variable "db_tier" {
  description = <<-EOT
    Cloud SQL machine tier. Default db-g1-small (shared-core, ~1.7GB) is a sane
    floor for Prisma + pgvector. db-f1-micro is the budget option but is
    memory-starved and discouraged for pgvector HNSW workloads. For real
    production load move to a dedicated tier, e.g. db-custom-1-3840.
  EOT
  type        = string
  default     = "db-g1-small"
}

variable "github_repo" {
  description = "GitHub repo (owner/name) allowed to authenticate via Workload Identity Federation."
  type        = string
  default     = "julianandrade/newsletter4link"
}

variable "app_url" {
  description = <<-EOT
    Public base URL of the app, used for NEXT_PUBLIC_APP_URL and unsubscribe
    links. Leave empty to fall back to the generated Cloud Run *.run.app URL
    (see outputs.cloud_run_url). Set this to the custom domain once mapped.
  EOT
  type        = string
  default     = ""
}

variable "subnet_cidr" {
  description = <<-EOT
    Range for the Cloud Run egress subnet. Direct VPC egress takes an address per
    instance, so a /26 is the documented floor; a /24 leaves room to raise
    max_instance_count later. Growing a subnet in place is possible, shrinking it is not.
  EOT
  type        = string
  default     = "10.20.0.0/24"
}

variable "supabase_url" {
  description = <<-EOT
    NEXT_PUBLIC_SUPABASE_URL. Auth stays on Supabase after the migration, so this points
    at the same project it does today.

    NOTE: this is a NEXT_PUBLIC_ variable, which Next.js inlines into the client bundle at
    BUILD time. Setting it here covers server-side reads only. The Docker build must
    receive it as a build argument as well, or the browser bundle ships with it undefined
    and sign-in fails on a service whose logs look healthy.
  EOT
  type        = string
  default     = ""
}

variable "supabase_anon_key" {
  description = <<-EOT
    NEXT_PUBLIC_SUPABASE_ANON_KEY. Deliberately a plain variable and not a Secret Manager
    entry: it is compiled into the JavaScript every visitor downloads, so treating it as a
    secret would be theatre. The service role key is the one that matters, and that is a
    secret.

    Same build-time caveat as supabase_url.
  EOT
  type        = string
  default     = ""
}

variable "from_email" {
  description = "FROM_EMAIL for outbound newsletters. Empty falls back to the default in lib/config.ts."
  type        = string
  default     = ""
}

variable "from_name" {
  description = "FROM_NAME for outbound newsletters. Empty falls back to the default in lib/config.ts."
  type        = string
  default     = ""
}

variable "mounted_optional_secrets" {
  description = <<-EOT
    Secret ids from the optional half of secrets.tf to expose to Cloud Run as environment
    variables. Terraform creates every container regardless; this list decides which ones
    the revision references.

    It exists because Cloud Run refuses to start a revision whose secret has no version.
    An optional integration nobody has configured has to be absent from the revision, not
    present and empty, so the failure mode is "SharePoint import is off" rather than "the
    service will not boot".

    The default is what `.env` actually holds today. Add an id here after adding its first
    version, not before.
  EOT
  type        = list(string)
  default     = ["resend-webhook-secret", "tavily-api-key"]
}

variable "cron_secret" {
  description = <<-EOT
    Shared secret for the /api/cron/* endpoints. Cloud Scheduler sends it as the
    `Authorization: Bearer <cron_secret>` header. This MUST be byte-for-byte
    identical to the value stored in the `cron-secret` Secret Manager secret
    (which the app reads as CRON_SECRET). Scheduler cannot read Secret Manager
    directly, so the value is duplicated here as a sensitive variable. Supply it
    via TF_VAR_cron_secret or a gitignored *.auto.tfvars file - never commit it.
  EOT
  type        = string
  sensitive   = true
}

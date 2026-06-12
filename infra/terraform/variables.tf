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

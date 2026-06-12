# Cloud Scheduler - replaces Vercel Cron (vercel.json). Three GET jobs hitting
# the public Cloud Run URL with the same Authorization: Bearer <cron-secret>
# header the app expects (see app/api/cron/*/route.ts).
#
# Why the bearer token comes from a TF variable and not Secret Manager:
# Cloud Scheduler HTTP targets cannot reference Secret Manager for header values.
# The supported "secret" mechanism for Scheduler is OIDC/OAuth tokens for
# Google-audience targets, which does NOT match this app's shared-secret scheme.
# So the cron_secret variable is sent in the header and MUST equal the value
# stored in the `cron-secret` Secret Manager secret (which the app reads as
# CRON_SECRET). Keep them in sync - documented in README + variables.tf.
#
# Schedules mirror the previous vercel.json, time zone UTC:
#   daily-collection  0 9 * * *   (daily 09:00)
#   weekly-finalize   0 18 * * 1  (Mondays 18:00)
#   weekly-send       0 9 * * 2   (Tuesdays 09:00)

locals {
  cron_jobs = {
    daily-collection = "0 9 * * *"
    weekly-finalize  = "0 18 * * 1"
    weekly-send      = "0 9 * * 2"
  }
}

resource "google_cloud_scheduler_job" "cron" {
  for_each = local.cron_jobs

  name      = "${var.app_name}-${each.key}"
  project   = var.project_id
  region    = var.region
  schedule  = each.value
  time_zone = "Etc/UTC"

  attempt_deadline = "320s" # routes set maxDuration 300s; give headroom

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "GET"
    uri         = "${local.effective_app_url}/api/cron/${each.key}"

    headers = {
      "Authorization" = "Bearer ${var.cron_secret}"
    }
  }

  depends_on = [google_project_service.apis]
}

# GCS buckets.
#
# media:   replaces Supabase Storage (Phase 3 swap). Uniform bucket-level access,
#          NOT public. Objects are served via the app's public proxy route
#          GET /api/media/<id>, which streams bytes using the runtime SA's
#          objectAdmin grant (ADC; see iam.tf). Public read is intentionally
#          disabled — there is no public bucket URL or allUsers binding.
# backups: holds pg_dump artifacts produced during the DB cutover and any future
#          out-of-band logical backups. Versioned + lifecycle-aged.

resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-media"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # No website / no public IAM binding => private by design. Access via the app
  # proxy route using the runtime SA (iam.tf), never a public bucket URL.

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-backups"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 90 # delete pg_dump artifacts after 90 days
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

# GCS buckets.
#
# GCS buckets.
#
# media:   replaces Supabase Storage. PUBLIC READ, see the reasoning on the resource.
# backups: holds pg_dump artifacts produced during the DB cutover and any future
#          out-of-band logical backups. Versioned, lifecycle-aged, and private.

resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-media"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  # PUBLIC READ, reversing what the ported stack chose. That version enforced public access
  # prevention and assumed the app would proxy every object through `GET /api/media/<id>`.
  # No such route exists on master, and adding one would be the wrong answer anyway:
  #
  # These images are embedded in newsletters. A mail client cannot authenticate, so an
  # object has to be readable by an anonymous fetch or it is a broken box in somebody's
  # inbox. A signed URL expires and would rot inside mail already delivered. A proxy route
  # would put every image fetch, by every recipient, through Cloud Run.
  #
  # This is not a change in posture either: the Supabase bucket it replaces is public, and
  # CLAUDE.md records that as deliberate. What makes it safe is not the bucket, it is
  # `lib/media/sniff.ts`: an upload is what its bytes say, PNG, JPEG and GIF only, and the
  # served content type comes from sniffing rather than from what the client declared. SVG
  # is refused precisely because a public bucket serving `image/svg+xml` from our own
  # domain is how a renamed file becomes script.
  public_access_prevention = "inherited"

  depends_on = [google_project_service.apis]
}

# The binding that makes the above true. Read only, and objects only: `objectViewer` grants
# no listing of the bucket, no write, and no read of its configuration.
resource "google_storage_bucket_iam_member" "media_public_read" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
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

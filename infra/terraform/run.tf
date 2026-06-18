# Cloud Run v2 service.
#
# The image is a PLACEHOLDER. CI (GitHub Actions, owned by the other agent) owns
# real deploys, so lifecycle.ignore_changes on the container image prevents TF
# from reverting CI's deployed revision on the next apply.
#
# Cloud SQL is attached via the v2 volume + volume_mount mechanism (the modern
# equivalent of the run.googleapis.com/cloudsql-instances annotation). The
# instance socket appears at /cloudsql/<connection_name> inside the container,
# which matches the DATABASE_URL/DIRECT_URL host=/cloudsql/... DSN in secrets.tf.

locals {
  # Effective public URL: explicit var if set, else the generated run.app URL.
  effective_app_url = var.app_url != "" ? var.app_url : google_cloud_run_v2_service.app.uri

  # Maps ENV VAR name -> Secret Manager secret_id. Mirrors lib/config.ts.
  secret_env = {
    DATABASE_URL                  = google_secret_manager_secret.database_url.secret_id
    DIRECT_URL                    = google_secret_manager_secret.direct_url.secret_id
    ANTHROPIC_API_KEY             = "anthropic-api-key"
    OPENAI_API_KEY                = "openai-api-key"
    RESEND_API_KEY                = "resend-api-key"
    RESEND_WEBHOOK_SECRET         = "resend-webhook-secret"
    CRON_SECRET                   = "cron-secret"
    UNSUBSCRIBE_SECRET            = "unsubscribe-secret"
    TAVILY_API_KEY                = "tavily-api-key"
    # Auth.js + Microsoft Entra ID (Phase 2).
    AUTH_SECRET                    = "auth-secret"
    AUTH_MICROSOFT_ENTRA_ID_ID     = "entra-client-id"
    AUTH_MICROSOFT_ENTRA_ID_SECRET = "entra-client-secret"
    AUTH_MICROSOFT_ENTRA_ID_ISSUER = "entra-issuer"
  }
}

resource "google_cloud_run_v2_service" "app" {
  name     = var.app_name
  project  = var.project_id
  location = var.region

  # Allow public (unauthenticated) ingress: unsubscribe pages and the newsletter
  # itself must be reachable without IAM auth; the app enforces its own auth on
  # the dashboard/API. (Public invoker binding is in the IAM resource below.)
  ingress = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    # Cloud SQL attachment.
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # Plain env.
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = var.app_url # may be empty at first apply; set after URL is known
      }
      env {
        name  = "EMAIL_PROVIDER"
        value = "resend"
      }
      # GCS media bucket name (Phase 3). Auth is via the runtime SA's ADC +
      # objectAdmin grant (iam.tf), so no key/secret is needed — just the name.
      env {
        name  = "GCS_MEDIA_BUCKET"
        value = google_storage_bucket.media.name
      }
      # Auth.js must trust the X-Forwarded-* headers behind the Cloud Run proxy
      # so it derives the correct callback origin.
      env {
        name  = "AUTH_TRUST_HOST"
        value = "true"
      }

      # Secret-backed env (latest version of each secret).
      dynamic "env" {
        for_each = local.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    # CI owns the deployed image and traffic; do not let TF revert it.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.runtime_accessor,
    google_project_iam_member.runtime_cloudsql,
  ]
}

# Public invocation (unauthenticated). Required for unsubscribe/newsletter pages.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

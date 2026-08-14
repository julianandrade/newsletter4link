# Cloud Run v2 service.
#
# The image is a PLACEHOLDER. CI owns real deploys, so lifecycle.ignore_changes on the
# container image prevents TF from reverting CI's deployed revision on the next apply.
#
# Cloud SQL is attached via the v2 volume + volume_mount mechanism (the modern equivalent
# of the run.googleapis.com/cloudsql-instances annotation). The instance socket appears at
# /cloudsql/<connection_name> inside the container, which matches the DATABASE_URL /
# DIRECT_URL host=/cloudsql/... DSN in secrets.tf.
#
# The environment below is rebuilt rather than ported. The ported version listed thirteen
# variables, four of them for the Auth.js + Entra ID work this migration explicitly does
# not do, and it predated media, memes, the radar and email ingestion. Master reads
# **thirty**. The list here comes from enumerating `process.env` across app/, lib/ and
# scripts/, then reading `lib/config.ts` to see which of them are load-bearing:
# `validateConfig` names four as required, and every Graph and SharePoint value is
# optional with no `!`.

locals {
  # Effective public URL: explicit var if set, else the generated run.app URL.
  effective_app_url = var.app_url != "" ? var.app_url : google_cloud_run_v2_service.app.uri

  # --- Secret-backed env: ENV VAR name -> Secret Manager secret_id -------------
  #
  # Required. The service cannot serve a request without these, so a missing version
  # should fail the apply rather than surface as a 500 later.
  required_secret_env = {
    DATABASE_URL = google_secret_manager_secret.database_url.secret_id
    DIRECT_URL   = google_secret_manager_secret.direct_url.secret_id

    # The four `validateConfig` throws on, minus DATABASE_URL above.
    ANTHROPIC_API_KEY = "anthropic-api-key"
    OPENAI_API_KEY    = "openai-api-key"
    RESEND_API_KEY    = "resend-api-key"

    # Not in validateConfig, and just as load-bearing. CRON_SECRET fails closed in
    # lib/auth/cron.ts, so without it every scheduled job answers 503 and does no work.
    CRON_SECRET = "cron-secret"

    # UNSUBSCRIBE_SECRET signs the unsubscribe link and the archive token. Absent, every
    # delivered newsletter's links stop verifying, and CLAUDE.md records that a token
    # signed with a different secret is indistinguishable from a missing edition: the
    # refusal is a 404 by design.
    UNSUBSCRIBE_SECRET = "unsubscribe-secret"

    # Auth stays on Supabase by decision, so the service-role key is required. This is
    # the one that would have been quietly dropped by porting the Entra branch: it
    # replaced Supabase auth wholesale and had no equivalent.
    SUPABASE_SERVICE_ROLE_KEY = "supabase-service-role-key"
  }

  # Optional, and mounted only when named in var.mounted_optional_secrets. Cloud Run
  # refuses to start a revision whose secret has no version, so an optional integration
  # that nobody has configured must be absent from the revision, not present and empty.
  optional_secret_env = {
    RESEND_WEBHOOK_SECRET              = "resend-webhook-secret"
    RESEND_INBOUND_WEBHOOK_SECRET      = "resend-inbound-webhook-secret"
    TAVILY_API_KEY                     = "tavily-api-key"
    AZURE_CLIENT_SECRET                = "azure-client-secret"
    SHAREPOINT_CERTIFICATE_PRIVATE_KEY = "sharepoint-certificate-private-key"
  }

  secret_env = merge(
    local.required_secret_env,
    {
      for env_name, secret_id in local.optional_secret_env :
      env_name => secret_id
      if contains(var.mounted_optional_secrets, secret_id)
    },
  )

  # --- Plain env ---------------------------------------------------------------
  #
  # Empty values are dropped rather than set to "": lib/config.ts treats an empty string
  # and an unset variable identically through `envValue`, but an env var present and
  # empty is harder to read in the console than one that is absent.
  #
  # NEXT_PUBLIC_APP_URL uses var.app_url, not local.effective_app_url. Referring to the
  # service's own generated URI from inside its own definition is a dependency cycle,
  # which is why the variable is empty on the first apply and set afterwards.
  plain_env_raw = {
    NEXT_PUBLIC_APP_URL           = var.app_url
    NEXT_PUBLIC_SUPABASE_URL      = var.supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY = var.supabase_anon_key

    EMAIL_PROVIDER = "resend"
    FROM_EMAIL     = var.from_email
    FROM_NAME      = var.from_name

    # GCS media bucket name (Phase D). Auth is the runtime SA's ADC plus the objectAdmin
    # grant in iam.tf, so no key is needed, just the name.
    GCS_MEDIA_BUCKET = google_storage_bucket.media.name
  }

  plain_env = { for k, v in local.plain_env_raw : k => v if v != "" }
}

resource "google_cloud_run_v2_service" "app" {
  name     = var.app_name
  project  = var.project_id
  location = var.region

  # Allow public (unauthenticated) ingress: unsubscribe pages and the archived edition
  # must be reachable without IAM auth; the app enforces its own auth on the dashboard
  # and API. (Public invoker binding is in the IAM resource below.)
  ingress = "INGRESS_TRAFFIC_ALL"

  deletion_protection = false

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    # Direct VPC egress, so every outbound request leaves through Cloud NAT and the
    # reserved address in network.tf. See that file for why ALL_TRAFFIC is the load-
    # bearing half: PRIVATE_RANGES_ONLY would leave the static IP allocated, billed, and
    # not the source of anything.
    vpc_access {
      network_interfaces {
        network    = google_compute_network.main.id
        subnetwork = google_compute_subnetwork.run.id
      }
      egress = "ALL_TRAFFIC"
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

      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
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

# Public invocation (unauthenticated). Required for unsubscribe and archive pages.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

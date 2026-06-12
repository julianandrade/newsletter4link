# Secret Manager.
#
# Most secret VALUES are supplied out-of-band (gcloud secrets versions add ...)
# because they are third-party credentials TF should never hold - see README.
# The two exceptions are database-url and direct-url: those are derived from the
# TF-generated DB password, so TF creates their first version directly.
#
# Per-secret IAM (grant the runtime SA access to each) lives in iam.tf.

locals {
  # Secrets whose values are injected out-of-band (TF only owns the container).
  external_secrets = [
    "anthropic-api-key",
    "openai-api-key",
    "resend-api-key",
    "resend-webhook-secret",
    "cron-secret",
    "unsubscribe-secret",
    "tavily-api-key",
    "supabase-url",       # NEXT_PUBLIC_SUPABASE_URL (Supabase STORAGE only post-Phase-2)
    "supabase-anon-key",  # NEXT_PUBLIC_SUPABASE_ANON_KEY (storage)
    # Auth.js + Microsoft Entra ID (docs/MIGRATION-GCP.md Phase 2).
    "auth-secret",          # AUTH_SECRET (openssl rand -base64 33)
    "entra-client-id",      # AUTH_MICROSOFT_ENTRA_ID_ID
    "entra-client-secret",  # AUTH_MICROSOFT_ENTRA_ID_SECRET
    "entra-issuer",         # AUTH_MICROSOFT_ENTRA_ID_ISSUER
  ]

  # Cloud SQL unix-socket DSN used by Cloud Run (Prisma reads DATABASE_URL/DIRECT_URL).
  # On Cloud Run the instance is mounted at /cloudsql/<connection_name>, so host
  # is the socket directory. This is the runtime form for BOTH urls.
  #
  # NOTE: DIRECT_URL for running migrations from a workstation does NOT use this
  # socket form - it uses the Cloud SQL Auth Proxy at 127.0.0.1:5432, i.e.
  #   postgresql://app:<password>@127.0.0.1:5432/newsletter?sslmode=disable
  # (the proxy terminates TLS). See README + docs/MIGRATION-GCP.md.
  db_socket_dsn = format(
    "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s",
    google_sql_user.app.name,
    random_password.db_app.result,
    google_sql_database.newsletter.name,
    google_sql_database_instance.main.connection_name,
  )
}

# --- Externally-supplied secrets: container only, no version from TF ---------

resource "google_secret_manager_secret" "external" {
  for_each = toset(local.external_secrets)

  secret_id = each.value
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# --- DB connection strings: TF owns the value (derived from generated password) -

resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.db_socket_dsn
}

resource "google_secret_manager_secret" "direct_url" {
  secret_id = "direct-url"
  project   = var.project_id
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# Cloud Run itself can use the socket DSN for DIRECT_URL too (no pgbouncer in
# this stack - Cloud SQL connector handles pooling). Workstation migrations
# override DIRECT_URL locally to the Auth Proxy address (see README).
resource "google_secret_manager_secret_version" "direct_url" {
  secret      = google_secret_manager_secret.direct_url.id
  secret_data = local.db_socket_dsn
}

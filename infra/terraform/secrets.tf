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
  #
  # The four Auth.js and Entra ID entries the ported version created are gone. Auth stays
  # on Supabase by decision, so `auth-secret`, `entra-client-id`, `entra-client-secret`
  # and `entra-issuer` would have been four empty containers advertising a plan that is
  # not this one. The archive tag still holds that work for when it returns.
  #
  # `supabase-service-role-key` is the entry that replaces them, and the one the port
  # would have silently dropped: the Entra branch removed Supabase auth wholesale, so it
  # had no reason to carry the key that master cannot run without.
  external_secrets = [
    # Required. Every one of these must have a version before the first Cloud Run apply,
    # because a revision referencing a versionless secret does not start.
    "anthropic-api-key",
    "openai-api-key",
    "resend-api-key",
    "cron-secret",
    "unsubscribe-secret",
    "supabase-service-role-key",

    # Optional integrations. The container is created either way, so the value can be
    # added later without a Terraform change, but the env var only reaches Cloud Run when
    # the secret id appears in var.mounted_optional_secrets.
    "resend-webhook-secret",
    "resend-inbound-webhook-secret", # RQ-007: separate webhook, separate signing secret
    "tavily-api-key",
    "azure-client-secret",                # EMAIL_PROVIDER=graph path only
    "sharepoint-certificate-private-key", # SharePoint project import only
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

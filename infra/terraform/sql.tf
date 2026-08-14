# Cloud SQL for PostgreSQL 17 with pgvector.
#
# Access model:
#   - Public IP is ENABLED but NO authorized networks are granted. This means
#     nothing on the open internet can reach it directly. Admin/workstation
#     access goes exclusively through the Cloud SQL Auth Proxy (IAM-gated,
#     encrypted), and Cloud Run reaches it over the dedicated Cloud SQL unix
#     socket connector (configured in run.tf), not over the public IP.
#   - require_ssl/ssl_mode forces TLS for any IP-based connection that is ever
#     authorized.
#
# pgvector: the `vector` extension is created by Prisma migrations
# (prisma/migrations/.../migration.sql runs CREATE EXTENSION IF NOT EXISTS
# "vector"), so no extension management is needed here. Postgres 17 on Cloud SQL
# ships pgvector as an available extension.

resource "random_password" "db_app" {
  length  = 32
  special = false # avoid URL-encoding headaches in the postgresql:// connection string
}

resource "google_sql_database_instance" "main" {
  name             = "${var.app_name}-pg"
  project          = var.project_id
  region           = var.region
  database_version = "POSTGRES_17"

  deletion_protection = true

  settings {
    tier = var.db_tier

    # Pinned, not inherited. The ported stack left this unset, and the first apply failed:
    #
    #   Invalid Tier (db-g1-small) for (ENTERPRISE_PLUS) Edition.
    #   Use a predefined Tier like db-perf-optimized-N-* instead.
    #
    # This project defaults new instances to ENTERPRISE_PLUS, which does not offer
    # shared-core machines at all. Its smallest tier is db-perf-optimized-N-2, at 2 vCPU
    # and 16 GB, which is roughly ten times the monthly cost this stack is sized for and
    # far beyond what one newsletter's worth of articles and embeddings needs.
    #
    # ENTERPRISE is the edition that offers db-g1-small and db-f1-micro. Naming it here
    # means the tier and the edition can never disagree again, whatever a project or
    # organization default happens to be on the day someone runs this.
    edition = "ENTERPRISE"

    availability_type = "ZONAL" # bump to REGIONAL for HA in real prod
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # UTC; off-peak for Europe
      point_in_time_recovery_enabled = true    # PITR (requires WAL archiving)
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled = true # public IP on, but...
      ssl_mode     = "ENCRYPTED_ONLY"
      # ...no authorized_networks blocks => no internet source is allowed in.
      # All real connectivity is via the Auth Proxy / Cloud SQL connector.
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # UTC
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled = true
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "newsletter" {
  name     = "newsletter"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "app"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.db_app.result
}

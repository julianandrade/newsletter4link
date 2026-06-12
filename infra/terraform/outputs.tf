output "sql_instance_connection_name" {
  description = "Cloud SQL connection name (PROJECT:REGION:INSTANCE). Used by the Auth Proxy and Cloud Run connector."
  value       = google_sql_database_instance.main.connection_name
}

output "cloud_run_url" {
  description = "Generated Cloud Run service URL (*.run.app). Set NEXT_PUBLIC_APP_URL / var.app_url to this (or a custom domain)."
  value       = google_cloud_run_v2_service.app.uri
}

output "media_bucket" {
  description = "GCS bucket for media (private; signed-URL access)."
  value       = google_storage_bucket.media.name
}

output "backups_bucket" {
  description = "GCS bucket for pg_dump / logical backups."
  value       = google_storage_bucket.backups.name
}

output "artifact_registry_repo" {
  description = "Artifact Registry Docker repo path (region-docker.pkg.dev/PROJECT/app)."
  value       = "${google_artifact_registry_repository.app.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "runtime_service_account" {
  description = "Email of the Cloud Run runtime service account."
  value       = google_service_account.runtime.email
}

output "wif_provider" {
  description = "Full WIF provider resource name. Set as GitHub repo variable GCP_WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_sa" {
  description = "Deployer service account email. Set as GitHub repo variable GCP_DEPLOYER_SA."
  value       = google_service_account.deployer.email
}

output "db_connection_example_proxy" {
  description = "Workstation DIRECT_URL example (via Cloud SQL Auth Proxy on 127.0.0.1:5432). Password fetched from Secret Manager, not shown here."
  value       = "postgresql://app:<DB_PASSWORD>@127.0.0.1:5432/newsletter?sslmode=disable"
}

output "db_connection_example_socket" {
  description = "Cloud Run DATABASE_URL form (unix socket). Stored in the database-url secret."
  value       = "postgresql://app:<DB_PASSWORD>@localhost/newsletter?host=/cloudsql/${google_sql_database_instance.main.connection_name}"
}

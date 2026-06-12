# Artifact Registry Docker repo. The GitHub Actions workflow (owned by the other
# agent) pushes the app image here; Cloud Run pulls from it.

resource "google_artifact_registry_repository" "app" {
  repository_id = "app"
  project       = var.project_id
  location      = var.region
  format        = "DOCKER"
  description   = "Container images for ${var.app_name}"

  depends_on = [google_project_service.apis]
}

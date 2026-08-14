# Workload Identity Federation for GitHub Actions.
#
# GitHub Actions presents an OIDC token (issuer token.actions.githubusercontent.com).
# The provider's attribute_condition restricts which repo's tokens are accepted,
# and the SA IAM binding maps tokens from var.github_repo to impersonation of the
# deployer SA. Together these mean ONLY workflows in julianandrade/newsletter4link
# can deploy - no other repo (or fork) can mint credentials.
#
# The other agent's workflow consumes the outputs (wif_provider, deployer_sa) as
# the repo variables GCP_WIF_PROVIDER / GCP_DEPLOYER_SA.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.app_name}-gh-pool"
  project                   = var.project_id
  display_name              = "GitHub Actions pool"
  description               = "WIF pool for ${var.github_repo}"

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  project                            = var.project_id
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Hard gate: only tokens whose repository claim equals our repo are accepted.
  attribute_condition = "assertion.repository == '${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow GitHub workflows from var.github_repo to impersonate the deployer SA.
resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

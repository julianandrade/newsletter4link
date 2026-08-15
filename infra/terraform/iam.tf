# Service accounts and least-privilege IAM.
#
# Two service accounts:
#   runtime  - identity Cloud Run runs as. Needs Cloud SQL client, per-secret
#              accessor, and objectAdmin on the media bucket only.
#   deployer - identity GitHub Actions impersonates via WIF (see wif.tf). Needs
#              to push images and deploy revisions, and to act-as the runtime SA.

# --- Runtime service account -------------------------------------------------

resource "google_service_account" "runtime" {
  account_id   = "${var.app_name}-run"
  display_name = "${var.app_name} Cloud Run runtime"
  project      = var.project_id
}

# Connect to Cloud SQL via the connector.
resource "google_project_iam_member" "runtime_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Per-secret accessor bindings (scoped, not project-wide secretAccessor).
locals {
  all_secret_ids = concat(
    [for s in google_secret_manager_secret.external : s.secret_id],
    [google_secret_manager_secret.database_url.secret_id,
    google_secret_manager_secret.direct_url.secret_id],
  )
}

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each = toset(local.all_secret_ids)

  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"

  depends_on = [
    google_secret_manager_secret.external,
    google_secret_manager_secret.database_url,
    google_secret_manager_secret.direct_url,
  ]
}

# Sign its own JWTs, which is what minting a session cookie is.
#
# Identity Platform session cookies are signed tokens, and `createSessionCookie` has to sign
# one. With a downloaded service account key the SDK signs locally with the private key; on
# Cloud Run there is no key, deliberately, so it calls the IAM `signBlob` API and asks Google
# to sign on the service account's behalf. That requires the account to be a token creator FOR
# ITSELF, which running as it does not imply.
#
# Without this, sign-in fails AFTER the token has been verified successfully, with:
#
#   Credential implementation provided to initializeApp() via the "credential" property has
#   insufficient permission to access the requested resource.
#
# which names the credential rather than the missing role, and reads like the wrong service
# account instead of a missing grant on the right one.
#
# Scoped to this one service account, not project-wide: `serviceAccountTokenCreator` at the
# project level would let this identity mint tokens as every service account in the project,
# the deployer included.
resource "google_service_account_iam_member" "runtime_token_creator" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

# Create session cookies, which is an authenticated Identity Toolkit ADMIN call.
#
# This is the role that was actually missing, and the distinction is worth recording because
# the first guess above looked right and changed nothing:
#
#   verifyIdToken       needs no permission at all. It fetches Google's public signing keys
#                       and checks a signature, which is why sign-in got as far as a verified
#                       token with no Identity Toolkit role granted.
#   createSessionCookie is a call to the Identity Toolkit API on behalf of the project, so the
#                       caller has to be an administrator of it.
#
# The error says "insufficient permission to access the requested resource" for both cases and
# names the credential rather than the resource, so it does not distinguish a missing signing
# right from a missing API right. Granting token creator and retrying produced exactly the same
# message, which is how the wrong theory survived one round.
#
# `firebaseauth.admin` also covers `getUserByEmail`, which scripts/relink-identities.ts needs.
resource "google_project_iam_member" "runtime_firebase_auth" {
  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# objectAdmin on the MEDIA bucket only (read/write/sign). No access to backups.
resource "google_storage_bucket_iam_member" "runtime_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# --- Deployer service account (GitHub Actions via WIF) -----------------------

resource "google_service_account" "deployer" {
  account_id   = "${var.app_name}-deployer"
  display_name = "${var.app_name} GitHub Actions deployer"
  project      = var.project_id
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  project    = var.project_id
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer must be able to act-as the runtime SA to deploy a revision that runs
# as that SA. Scoped to the runtime SA, not project-wide serviceAccountUser.
resource "google_service_account_iam_member" "deployer_actas_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

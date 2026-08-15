terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State note: this stack defaults to LOCAL state (terraform.tfstate on disk).
  # That is fine for a single operator bootstrapping the project, but the state
  # contains the generated DB password and secret-version metadata, so do NOT
  # commit terraform.tfstate. For team use, uncomment the GCS backend below and
  # run `terraform init -migrate-state` after creating the bucket manually:
  #
  #   gcloud storage buckets create gs://newsletter-link-ai-radar-tfstate \
  #     --project=newsletter-link-ai-radar --location=europe-southwest1 \
  #     --uniform-bucket-level-access
  #
  # backend "gcs" {
  #   bucket = "newsletter-link-ai-radar-tfstate"
  #   prefix = "newsletter4link"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Identity Platform needs these two, and nothing else in the stack does.
  #
  # `identitytoolkit.googleapis.com` refuses a request authenticated with user Application
  # Default Credentials unless a quota project is named, and answers with a 403 whose reason
  # is `SERVICE_DISABLED` even though the service is enabled. That message sends you looking
  # for a disabled API rather than a missing attribution header.
  #
  # Setting it here rather than with `gcloud auth application-default set-quota-project` means
  # the fix travels with the configuration instead of living in one operator's local state.
  user_project_override = true
  billing_project       = var.project_id
}

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
}

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

  # State lives in GCS, not on disk.
  #
  # It was local through the migration, which was correct while one operator was
  # bootstrapping the project and wrong the moment the stack became the thing the
  # product runs on: the file holds the generated DB password and secret-version
  # metadata, it is gitignored, and it existed in exactly one copy on one laptop.
  # Losing that machine meant importing every resource by hand to change anything.
  #
  # The bucket is created by hand rather than by this stack, because Terraform
  # cannot create the bucket its own state lives in. It needs versioning, which is
  # the actual recovery mechanism if a bad apply corrupts state, and public access
  # prevention, because of the password:
  #
  #   gcloud storage buckets create gs://newsletter-link-ai-radar-tfstate \
  #     --project=newsletter-link-ai-radar --location=europe-southwest1 \
  #     --uniform-bucket-level-access --public-access-prevention
  #   gcloud storage buckets update gs://newsletter-link-ai-radar-tfstate --versioning
  #
  # Then, once per machine holding local state:  terraform init -migrate-state
  #
  # Until that bucket exists `terraform init` fails loudly, which is the intended
  # behaviour: a missing bucket is better than a second divergent local state.
  backend "gcs" {
    bucket = "newsletter-link-ai-radar-tfstate"
    prefix = "newsletter4link"
  }
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

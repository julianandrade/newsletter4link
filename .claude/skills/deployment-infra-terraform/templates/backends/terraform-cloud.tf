# HCP Terraform (formerly Terraform Cloud)
# Requires a valid HCP Terraform account and organisation.
# Authentication: set TF_TOKEN_app_terraform_io in the environment, or run: terraform login
terraform {
  cloud {
    organization = "<TFC_ORGANIZATION>"
    workspaces {
      name = "<PROJECT_NAME>-<ENVIRONMENT>"
    }
  }
}

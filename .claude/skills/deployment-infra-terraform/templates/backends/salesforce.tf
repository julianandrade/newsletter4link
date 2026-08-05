# Salesforce does not provide a native Terraform state backend.
# HCP Terraform (Terraform Cloud) is the recommended state store for Salesforce projects.
# Authentication: set TF_TOKEN_app_terraform_io in the environment, or run: terraform login
terraform {
  cloud {
    organization = "<TFC_ORGANIZATION>"
    workspaces {
      name = "<PROJECT_NAME>-<ENVIRONMENT>"
    }
  }
}

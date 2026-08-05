# IBM Cloud Object Storage — S3-compatible backend
# Requires HMAC credentials (not IAM API keys). Create them under:
#   IBM Cloud Console → Resource List → Cloud Object Storage → Service Credentials → New credential (HMAC: true)
terraform {
  backend "s3" {
    bucket                      = "<PROJECT_NAME>-tfstate"
    key                         = "<PROJECT_NAME>/<ENVIRONMENT>/terraform.tfstate"
    region                      = "<IBM_COS_REGION>"
    endpoint                    = "https://s3.<IBM_COS_REGION>.cloud-object-storage.appdomain.cloud"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_metadata_api_check     = true
    access_key                  = "<IBM_COS_HMAC_ACCESS_KEY>"
    secret_key                  = "<IBM_COS_HMAC_SECRET_KEY>"
  }
}

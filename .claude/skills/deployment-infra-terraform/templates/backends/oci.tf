# OCI Object Storage — S3-compatibility API
# Requires Customer Secret Keys (not API keys). Create them under:
#   OCI Console → Profile → Customer Secret Keys → Generate Secret Key
# The namespace is the tenancy Object Storage namespace, visible in:
#   OCI Console → Administration → Tenancy Details → Object Storage Namespace
terraform {
  backend "s3" {
    bucket   = "<PROJECT_NAME>-tfstate"
    key      = "<PROJECT_NAME>/<ENVIRONMENT>/terraform.tfstate"
    region   = "<OCI_REGION>"
    endpoint = "https://<OCI_NAMESPACE>.compat.objectstorage.<OCI_REGION>.oraclecloud.com"

    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    force_path_style            = true

    access_key = "<OCI_CUSTOMER_SECRET_KEY_ACCESS>"
    secret_key = "<OCI_CUSTOMER_SECRET_KEY_SECRET>"
  }
}

# Generic HTTP backend — suitable for GitLab-managed Terraform state,
# custom state servers, or any provider without a native Terraform backend.
terraform {
  backend "http" {
    address        = "<STATE_ADDRESS_URL>"
    lock_address   = "<LOCK_ADDRESS_URL>"
    unlock_address = "<UNLOCK_ADDRESS_URL>"
    username       = "<HTTP_USERNAME>"
    password       = "<HTTP_PASSWORD>"
    lock_method    = "POST"
    unlock_method  = "DELETE"
    retry_wait_min = 5
  }
}

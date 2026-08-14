# Enable every Google API the stack depends on. disable_on_destroy=false keeps
# APIs enabled if the stack is torn down (avoids breaking other resources that
# might share the project and avoids slow re-enable churn).

locals {
  required_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com",

    # Added with network.tf. The VPC, subnet, router, NAT and the reserved address are
    # all Compute Engine resources, so without this the first apply fails on the network
    # rather than on anything to do with the app.
    "compute.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# VPC, Cloud NAT and a reserved static egress IP.
#
# None of this existed in the ported stack, and it is the one addition worth doing for
# its own sake rather than because the migration needs it.
#
# The driver: beehiiv refuses requests from Vercel's egress ranges, which is a network
# fact recorded in CLAUDE.md and a settled decision rather than a bug. Cloud Run's
# default egress is equally unpredictable, a pool of Google addresses that changes, so
# moving hosts without this would trade one unallowlistable source for another. What
# makes the difference is a *reserved* address: one IP, ours, that can be named on
# somebody else's allowlist and stays true.
#
# Shape:
#
#   Cloud Run --(direct VPC egress, ALL_TRAFFIC)--> subnet --> Router --> NAT --> static IP
#
# Direct VPC egress rather than a Serverless VPC Access connector: the connector is a
# managed instance group that costs money per hour whether or not a request is in
# flight, and direct egress has been GA since 2024 with no such standing charge. The
# subnet only has to be big enough for the instances that exist at once.
#
# `egress = "ALL_TRAFFIC"` in run.tf is the half of this that is easy to get wrong.
# With PRIVATE_RANGES_ONLY, internal traffic takes the VPC and everything aimed at the
# internet keeps the default path, so the static IP would exist, be billed, and never
# appear as the source of the one request it was created for.

resource "google_compute_network" "main" {
  name    = "${var.app_name}-vpc"
  project = var.project_id

  # Custom mode: one subnet, in one region, created deliberately below. Auto mode
  # would create a subnet in every region on earth, which is 40-odd ranges to reason
  # about for a stack that runs in exactly one.
  auto_create_subnetworks = false

  depends_on = [google_project_service.apis]
}

resource "google_compute_subnetwork" "run" {
  name          = "${var.app_name}-run"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.subnet_cidr

  # Cloud Run's direct egress takes an address per instance, and `max_instance_count`
  # is 2. A /26 is the documented floor and this is a /24, which leaves room to raise
  # the ceiling without re-cutting the range: growing a subnet in place is possible,
  # shrinking it is not.

  # Flow logs are off. They are the kind of thing that looks free and is billed by the
  # gigabyte, and nothing here reads them.
  private_ip_google_access = true
}

# The whole point of the file. Reserved, regional, external.
#
# It survives the NAT being destroyed and recreated, which matters: an allowlist entry
# on a third party's side is a request to a human, and asking twice because Terraform
# renumbered us is not a thing to spend goodwill on.
resource "google_compute_address" "egress" {
  name         = "${var.app_name}-egress"
  project      = var.project_id
  region       = var.region
  address_type = "EXTERNAL"

  # An address held and not attached is billed at a slightly higher rate than one in
  # use. That is a few cents a month and it is the price of the address not moving.
}

resource "google_compute_router" "main" {
  name    = "${var.app_name}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name    = "${var.app_name}-nat"
  project = var.project_id
  region  = var.region
  router  = google_compute_router.main.name

  # MANUAL_ONLY plus an explicit list is what pins the source address. AUTO_ONLY lets
  # Google allocate and rotate, which is the behaviour this file exists to replace.
  nat_ip_allocate_option = "MANUAL_ONLY"
  nat_ips                = [google_compute_address.egress.self_link]

  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.run.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    # Errors only. "ALL" logs a line per connection, and this stack opens one per feed
    # fetch across 434 feeds: useful for a day of debugging, expensive as a default.
    filter = "ERRORS_ONLY"
  }
}

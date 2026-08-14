# Stage 1 of the Phase B apply: everything except the Cloud Run service and the four
# Cloud Scheduler jobs.
#
# Why it is staged at all: run.tf references eight secrets at `version = "latest"`, and
# Terraform creates the secret *containers* in the same pass. A Cloud Run revision naming a
# secret that has no version does not start, so a single apply fails on the service. Stage 1
# builds everything else, the values are loaded out of band, and stage 3 is a plain
# `terraform apply` with no targets.
#
# `-target` pulls dependencies in automatically, so this list is the leaves rather than all
# 60 resources: the NAT pulls the network, subnet, address and router; the secret versions
# pull Cloud SQL and the generated password; the IAM members pull their secrets, buckets,
# registry and service accounts.
#
# Terraform prints a warning that a targeted apply is not a convergent operation. That is
# expected and correct here, and stage 3 is what makes it converge.

$targets = @(
  'google_project_service.apis',
  'google_compute_router_nat.main',
  'google_secret_manager_secret_version.database_url',
  'google_secret_manager_secret_version.direct_url',
  'google_secret_manager_secret_iam_member.runtime_accessor',
  'google_storage_bucket_iam_member.runtime_media',
  'google_storage_bucket.backups',
  'google_artifact_registry_repository_iam_member.deployer_push',
  'google_project_iam_member.deployer_run',
  'google_project_iam_member.runtime_cloudsql',
  'google_service_account_iam_member.deployer_actas_runtime',
  'google_service_account_iam_member.deployer_wif',
  'google_iam_workload_identity_pool_provider.github'
)

$targetArgs = $targets | ForEach-Object { "-target=$_" }
$action = $args[0]   # 'plan' or 'apply'

if ($action -eq 'plan') {
  & terraform plan -input=false @targetArgs
} else {
  & terraform apply -input=false -auto-approve @targetArgs
}

Generate complete Azure DevOps CI/CD pipeline YAML files for the following configuration.

**Organisation**: {org_url}
**Project**: {project_name}

**Repositories** (one self-contained pipeline YAML per repo):
{repo_list — one per line}

**CI trigger branches**: {branch_strategy}
**PR validation pipeline**: {yes — implement as conditional stage in the same YAML | no}

**Container registry**: {registry_type} — {registry_url}

**Ansible deploy playbook**: {playbook_path}
**Inventory**: always `inventory/dynamic_inventory.sh` — never `hosts.ini` or any static file.

**Terraform CLI + init requirement**: The dynamic inventory script calls `terraform output -json` at
runtime. Microsoft-hosted agents do not have Terraform pre-installed. Include two steps before `ansible-playbook`:

Step 1 — Install Terraform CLI (bash, with guard for self-hosted agents that already have it):
Use the HashiCorp apt repository on Debian/Ubuntu agents. Check `command -v terraform` first and skip
installation if already present. Run `terraform version` to confirm.

Step 2 — Terraform init:
- Read `{{PATH_INFRA}}/deployment/terraform/versions.tf` to detect the backend type.
- Add a bash step: `terraform -chdir=<infra-path>/deployment/terraform init -input=false -reconfigure`
- Set the appropriate credential env vars for that backend (GOOGLE_CREDENTIALS for gcs, AWS_* for s3, ARM_* for azurerm, etc.).
- Source credentials from a variable in `{project_name}-{env}` — document the required variable name(s) in `variable-groups.md`.
- If no remote backend is detected (local state), skip the init step.

**Environments**: {env_list}
**Approval-gated environments**: {approval_gated_list — or "none"}
**Jump server**: {jump_server_address}

**Agent pool**: {agent_pool_name}
**Ansible on agent**: {pre-installed | install via pip at runtime}

**Lint step**: {yes | no}

**Variable groups to define** (write as `variable-groups.md` alongside the YAML files):
  - `{project_name}-shared`: registry URL, jump server address, Ansible playbook path, any values shared across all environments and pipelines
  - `{project_name}-{env}` per environment: SSH Secure File name, app-specific secrets, `last_good_{env}_tag` (starts empty), backend credential variable(s) for `terraform init`

**Service connections to define** (write as `service-connections.md` alongside the YAML files):
  - One container registry service connection (type: {registry_type})
  - One SSH service connection to the jump server

## Infrastructure Pipelines (only if Terraform is used — omit this section entirely if not)

If Terraform is used, generate two additional pipeline YAML files at `{{PATH_INFRA}}/setup/azure/pipelines/`:

**`terraform-pipeline.yaml`**: same design as the modular pattern (plan + apply, see above).

**`provision-pipeline.yaml`**: same design as the modular pattern (targetEnv parameter, one stage per env, site.yml with --skip-tags).

Document `{terraform-secrets-group}` in `variable-groups.md` alongside the existing groups.

Write all pipeline YAML files to `{{PATH_INFRA}}/setup/azure/pipelines/`.
Write `{{PATH_INFRA}}/setup/azure/pipelines/variable-groups.md` with variable group definitions.
Write `{{PATH_INFRA}}/setup/azure/pipelines/service-connections.md` with service connection instructions.

{If any provider guidelines were loaded in Phase 0.3, append the following block — omit entirely if none were loaded:}
---
## Provider Guidelines
The following provider-specific guidelines must be followed during generation:

{For each provider with guidelines, include:}
### {PROVIDER} Guidelines
{PROVIDER_GUIDELINES}

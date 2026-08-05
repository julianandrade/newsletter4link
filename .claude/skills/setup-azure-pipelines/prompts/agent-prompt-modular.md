Generate a modular Azure DevOps CI/CD pipeline setup using the `extends:` template pattern for the following configuration.

**Organisation**: {org_url}
**Project**: {project_name}
**Template repository**: {template_repo_name} (branch: {template_branch})

## Template Files — write to `{{PATH_INFRA}}/setup/azure/pipelines/templates/`

Generate the following shared template files in the infra repository:

**`templates/main-pipeline.yaml`** — the master pipeline template. It must:
- Accept parameters: `ExecutionType` (default: `""`) and `environments` (object list, one entry per environment).
- Iterate over the `environments` parameter to generate one stage per environment.
- Each stage condition: run if `Build.SourceBranch` contains the environment's branch name AND `ExecutionType` is not `Validation`, OR if `ExecutionType` equals the environment's own executionType.
- Load variables via templates at each stage: `templates/variables/global.yaml`, `templates/variables/global-{env}.yaml`, and the per-repo `Pipelines/Variables/variables.yaml@self` and `Pipelines/Variables/variables-{env}.yaml@self`.
- Inside each stage, use `${{ if eq(variables['App.Tech'], '...') }}` conditions to conditionally include the correct sub-pipeline template from `templates/sub/`.
- Include a `Verify` job that runs after `Build` and conditionally includes the correct verify sub-pipeline.

**`templates/variables/global.yaml`** — global variables shared across all repos and environments:
- Docker image version pins for the registry base image.
- Registry URL: `{registry_url}`.
- Global defaults (health check path, API port defaults, etc.).

**`templates/variables/global-{env}.yaml`** — one file per environment (`{env}` = `dev`, `prod`, etc.):
- `Environment.ID` — the short env ID.
- `Environment.Name` — constructed from org + env ID.
- DB host, port.
- Registry namespace and full path.
- Any env-specific infrastructure addresses.

**`templates/variables/pools/global-{pool}.yaml`** — one file per agent pool:
- `Pool.Name` — the agent pool name.
- `Pool.Image` — the vmImage (empty string for self-hosted).
- `Agent.SelfHosted` — true/false.
- Build tool paths (e.g. Maven cache folder, Java home, npm cache).

**Sub-pipeline templates** — one file per tech+group combination. Write only the sub-pipelines relevant to the repositories in this project:

For each of the following relevant tech stacks, write `templates/sub/sub-pipeline-{tech}-{group}.yaml`:
{List each tech stack from the repo list. Examples:}
- `sub-pipeline-maven-ms.yaml` — for Java Spring Boot microservices (maven + ms): Maven build, unit tests, SonarQube analysis if configured, Docker build+push, Docker deploy via Ansible, Solace/Kong setup if relevant.
- `sub-pipeline-angular-web.yaml` — for Angular web apps: npm ci, lint, build --configuration production, Docker build+push, deploy via Ansible.
- `sub-pipeline-docker-infra.yaml` — for infra components: Docker pull, token replace for config, Docker run via Ansible.
Each sub-pipeline file must contain only `steps:` — no `stages:`, `jobs:`, or `trigger:`. It is included via `template:` inside the job in `main-pipeline.yaml`.

## Per-Repo Minimal Pipeline Files

For each repository, generate the minimal pipeline entry-point files. Place them in `{{PATH_INFRA}}/setup/azure/pipelines/repos/{repo-name}/` with a header comment explaining they must also be committed to the root `Pipelines/` folder of each respective app repository.

**`Pipelines/build-pipeline.yaml`** (per repo):
```yaml
trigger:
  - develop
  - release/*
  - main

name: $(Build.DefinitionName)+$(SourceBranchName)$(Rev:.r)

resources:
  repositories:
    - repository: {template_repo_name}
      type: git
      name: {project_name}/{template_repo_name}
      ref: 'refs/heads/{template_branch}'

extends:
  template: 'setup/azure/pipelines/templates/main-pipeline.yaml@{template_repo_name}'
```

**`Pipelines/build-pipeline-validation.yaml`** (per repo, only if PR pipeline was requested):
```yaml
trigger: none

name: $(Build.DefinitionName)_$(SourceBranchName)_Validation_$(Date:yyyyMMdd)$(Rev:.r)

resources:
  repositories:
    - repository: {template_repo_name}
      type: git
      name: {project_name}/{template_repo_name}
      ref: 'refs/heads/{template_branch}'

extends:
  template: 'setup/azure/pipelines/templates/main-pipeline.yaml@{template_repo_name}'
  parameters:
    ExecutionType: Validation
```

**`Pipelines/Variables/variables.yaml`** (per repo):
- `App.GroupName` — the application group (`ms`, `web`, `lib`, `infra`, etc.)
- `App.Tech` — the build technology (`maven`, `angular`, `dotnet`, `node`, `docker`)
- `App.Type` — application type (`manager`, `portal`, `screen`, `service`, etc.)
- `App.Module` — short module name (e.g. `device`, `identity`, `sales`)
- `App.Name` — constructed full name: `$(App.GroupName)-$(App.Module)-$(App.Type)`
- App-specific config (DB flags, API port, API path)

**`Pipelines/Variables/variables-{env}.yaml`** (per repo per environment):
- `Pool.Name` — which agent pool to use for this repo+env combination
- `Pool.Image` — vmImage (empty for self-hosted)
- Any per-repo per-env overrides (keycloak secret name, health endpoint path, etc.)

## Repositories

{repo_list — one per line with tech type}

## CI trigger branches: {branch_strategy}
## PR validation pipeline: {yes — separate build-pipeline-validation.yaml | no}

## Container registry: {registry_type} — {registry_url}

## Ansible deploy playbook: {playbook_path}
## Inventory: always `inventory/dynamic_inventory.sh` — never `hosts.ini` or any static file.

## Terraform CLI + init requirement:
The dynamic inventory script calls `terraform output -json` at runtime. Microsoft-hosted agents do not
have Terraform pre-installed. The generated pipeline MUST include two steps before `ansible-playbook`:

**Step 1 — Install Terraform CLI** (bash, with guard so self-hosted agents with Terraform skip it):
```bash
if ! command -v terraform &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y gnupg software-properties-common
  wget -O- https://apt.releases.hashicorp.com/gpg \
    | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
    https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
    | sudo tee /etc/apt/sources.list.d/hashicorp.list
  sudo apt-get update -qq && sudo apt-get install -y terraform
fi
terraform version
```

**Step 2 — Terraform init**:
- Read `{{PATH_INFRA}}/deployment/terraform/versions.tf` to detect the backend type (gcs, s3, azurerm, oci, cos, etc.).
- Add a bash step that runs `terraform -chdir=$(Pipeline.Workspace)/infra/deployment/terraform init -input=false -reconfigure`.
- Set the appropriate credential env vars for that backend type (e.g. GOOGLE_CREDENTIALS for gcs,
  AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY for s3, ARM_* vars for azurerm, etc.).
- Source those credentials from a variable in `Secrets-{env}` — document the required variable name(s)
  in `variable-groups.md` with a description of the permission needed (read access to the state bucket/container).
- If no backend block is found (local state), skip the init step.

**IMPORTANT — pass backend credentials to ansible-playbook too**: The dynamic inventory script calls
`terraform output -json` at runtime inside the ansible-playbook step. That step must carry the same
backend credential env vars, otherwise terraform output fails silently and the inventory is empty —
Ansible skips all hosts without error. Use the `env:` block on every ansible-playbook step (deploy
and rollback). If the step already has a conditional `env:` entry (e.g. PROD_KEY_OVERRIDE), move the
condition inside the `env:` mapping so both vars coexist:
```yaml
env:
  BACKEND_CREDENTIAL_VAR: $(BACKEND_CREDENTIAL_VAR)
  ${{ if eq(item.needsProdKey, true) }}:
    PROD_KEY_OVERRIDE: $(sshKeyProd.secureFilePath)
```

## Environments: {env_list}
## Approval-gated environments: {approval_gated_list — or "none"}
## Jump server: {jump_server_address}

## Agent pool: {agent_pool_name}
## Ansible on agent: {pre-installed | install via pip at runtime}

## Lint step: {yes | no}

## Variable groups to define (write as `variable-groups.md` alongside the template files):
  - `Common`: non-secret shared values loaded at pipeline level. In the modular pattern most non-secrets live in YAML template files (global.yaml, global-{env}.yaml), so this group may be empty or minimal — it must still exist and be authorised.
  - `Secrets-{env}` per environment: SSH Secure File name, registry credentials, and any other secrets that cannot be stored in YAML files

## Service connections to define (write as `service-connections.md` alongside the template files):
  - One container registry service connection (type: {registry_type})
  - One SSH service connection to the jump server

## Azure DevOps Pipeline Folder Organization

Register pipelines in these folders in Azure DevOps (not file paths — these are the Azure DevOps UI folders):
- `\{group}` for main CI/CD pipelines (e.g. `\ms`, `\web`, `\lib`)
- `\{group}\validation` for validation pipelines
- `\infra` for infrastructure pipelines (terraform, provision)

## Infrastructure Pipelines (only if Terraform is used — omit this section entirely if not)

If Terraform is used, generate two additional pipeline YAML files in `{{PATH_INFRA}}/setup/azure/pipelines/repos/infra/Pipelines/`. These pipelines live in the infra repository itself (`checkout: self`) and use `trigger: none` (manual only). Header comments must document the post-apply workflow: run terraform-pipeline first, then provision-pipeline, then the app pipelines.

**`terraform-pipeline.yaml`**:
- `trigger: none`, `pr: none`
- Variables: `- template: ../../templates/variables/global.yaml`, `- group: Common`, `- group: {terraform-secrets-group}`
- Stage 1 — `Plan` (regular `job:`, no environment gate, `workspace.clean: all`):
  - `checkout: self` with `path: infra`
  - Install Terraform CLI (with `command -v` guard — same bash block used in app deploy stages)
  - `terraform -chdir=$(Pipeline.Workspace)/infra/{tf_relative_dir} init -input=false -reconfigure` — use the backend credential env var appropriate for the detected backend type (same logic as the `terraform init` step in app deploy stages; source credentials from `{terraform-secrets-group}`)
  - `terraform -chdir=$(Pipeline.Workspace)/infra/{tf_relative_dir} plan -input=false -out=$(Pipeline.Workspace)/tfplan` — pass all required `TF_VAR_*` env vars from `{terraform-secrets-group}`
  - Publish `$(Pipeline.Workspace)/tfplan` as pipeline artifact named `tfplan`
- Stage 2 — `Apply` (`deployment:` job, environment: `{infra-environment}`, `dependsOn: Plan`, `condition: succeeded()`):
  - `checkout: self` with `path: infra`
  - Install Terraform CLI (same guard block)
  - `terraform init` (same as Plan stage — re-initialises on the new agent)
  - `DownloadPipelineArtifact@2` — download `tfplan` artifact to `$(Pipeline.Workspace)/tfplan-artifact`
  - `terraform -chdir=$(Pipeline.Workspace)/infra/{tf_relative_dir} apply -input=false $(Pipeline.Workspace)/tfplan-artifact/tfplan`
  - Print `terraform output` (bash, `condition: succeeded()`)

**`provision-pipeline.yaml`**:
- `trigger: none`, `pr: none`
- Parameter `targetEnv` (string, default: first env, values: `[{env_list}, all]`)
- Variables: `- template: ../../templates/variables/global.yaml`, `- group: Common`
- One stage per environment named `Provision_{Env}`, each with:
  - `dependsOn: []` — all stages are independent so they run in parallel when `targetEnv: all`
  - `condition: in('${{ parameters.targetEnv }}', '{env}', 'all')`
  - `variables:` block loading `- template: ../../templates/variables/global-{env}.yaml` and `- group: Secrets-{env}` (for backend credentials and SSH key names)
  - `deployment:` job using the `{env}` Azure DevOps environment (e.g. `AppMod-dev`)
  - Steps:
    - `checkout: self` with `path: infra`
    - Install Ansible via pip
    - Install Terraform CLI (same guard block)
    - `terraform init` with backend credentials (same as app deploy stages)
    - `DownloadSecureFile@1` for DEV SSH key (always)
    - `DownloadSecureFile@1` for PROD SSH key (only in prod stage, mirroring the `needsProdKey` pattern used in app deploy stages)
    - `chmod 600` for each downloaded key
    - `ansible-playbook {provisioning-playbook} -i inventory/dynamic_inventory.sh --limit "{ansible-groups-for-env}" --skip-tags {provisioning-skip-tags} --extra-vars "ssh_private_key_file_dev=... ssh_private_key_file_prod=..."` — for dev: prod key path defaults to dev key path; for prod: use actual prod key
  - The ansible-playbook step must carry the backend credential env var so `dynamic_inventory.sh` can call `terraform output -json`

**Ansible group limit per environment**: construct the limit string from the configured group prefix and env suffix, e.g. for environments `dev` and `prod` with prefix groups `jump`, `db`, `app`, `nginx`: `--limit "jump,db_{env},app_{env},nginx_{env}"`. `jump` has no env suffix (shared bastion).

**Document in `variable-groups.md`**:
- Add `{terraform-secrets-group}` group with columns: variable name, value description, secret flag, notes. Include:
  - Backend credential variable (name determined by backend type: `GOOGLE_CREDENTIALS` for GCS, `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` for S3, `ARM_CLIENT_ID` + `ARM_CLIENT_SECRET` + `ARM_SUBSCRIPTION_ID` + `ARM_TENANT_ID` for azurerm, etc.)
  - `TF_VAR_*` variables for each sensitive Terraform input variable (SSH public keys for VM metadata, service account identifiers, etc.) — derive these by reading `{tf_dir}/variables.tf` and identifying all `sensitive = true` variables
- Add `{infra-environment}` to the first-run checklist with a note that it requires a manual approval check

{If any provider guidelines were loaded in Phase 0.3, append the following block — omit entirely if none were loaded:}
---
## Provider Guidelines
The following provider-specific guidelines must be followed during generation:

{For each provider with guidelines, include:}
### {PROVIDER} Guidelines
{PROVIDER_GUIDELINES}

---
name: setup-azure-pipelines
description: "Use this skill when the user asks to generate, create, or set up Azure DevOps CI/CD pipelines, Azure Pipelines YAML files, or automate CI/CD for applications deployed via Azure DevOps. Triggers include: 'create azure pipelines', 'generate CI/CD pipeline', 'setup azure devops pipelines', 'create pipeline yaml', 'configure azure pipeline', 'create ci cd pipeline'. Uses a single agent: azure-pipelines-engineer (generates pipeline YAML files and produces variable group and service connection reference documents)."
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` and of `.claude/settings.local.json` to resolve all project variables before execution.

# Setup — Azure DevOps Pipelines

Use this skill when a user needs Azure DevOps CI/CD pipeline YAML files generated and optionally registered in Azure DevOps. You, the main Claude agent, gather configuration from the user and then delegate all file generation to a single specialised sub-agent:

- **`azure-pipelines-engineer`** — reads the gathered configuration and generates complete, production-grade Azure Pipeline YAML files at `{{PATH_INFRA}}/setup/azure/pipelines/`, along with variable group and service connection reference documents. Defined at `.claude/agents/setup/azure-pipelines-engineer.md`. Use `subagent_type: azure-pipelines-engineer` when invoking via the Agent tool.

---

## Phase 0 — Prerequisites

### 0.0 Check Azure CLI

Before doing anything else, verify the Azure CLI is available:

```
az version
```

- If the command succeeds → proceed.
- If it fails → inform the user: "Azure CLI not found. Installing now..." and install it:
  - **Linux (Debian/Ubuntu)**: `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`
  - **macOS**: `brew install azure-cli`
  - **Windows**: `winget install Microsoft.AzureCLI`
  - After installing, verify with `az version` before continuing.
  - If installation fails, stop and ask the user to install the Azure CLI manually before retrying.

### 0.1 Check Azure DevOps Extension

Check whether the `azure-devops` CLI extension is installed:

```
az extension show --name azure-devops
```

- If it succeeds → proceed.
- If it fails → install it automatically: `az extension add --name azure-devops --yes`
  - Verify with `az extension show --name azure-devops` after installing.

### 0.2 Ensure Shared Git Repository

Check whether `{{PATH_INFRA}}/` is a git repository (`{{PATH_INFRA}}/.git` exists):

- If it **already exists** → proceed.
- If it **does not exist** → initialise it: `git -C infra init`. Report: "Git repository initialised at `{{PATH_INFRA}}/`."

Do **not** create a separate `.git` inside `{{PATH_INFRA}}/setup/azure/pipelines/`. All commits happen at the `{{PATH_INFRA}}/` root.

### 0.3 Detect Providers and Load Rules

Identify all providers relevant to this pipeline setup:

1. **Infrastructure cloud provider** — infer from `{{PATH_DOCS}}/5-deployment/resource-manifest.json` (if it exists) or from Terraform files at `{{PATH_INFRA}}/deployment/terraform/`. Examples: `gcp`, `aws`, `azure`.
2. **Container registry provider** — infer from the registry type the user provides or has already mentioned. Examples: `gcp` for GCR, `aws` for ECR, `azure` for ACR. Skip if it is Docker Hub (no cloud provider equivalent).

For each provider detected, check if a rule file exists at:

```
.claude/rules/cloud-providers/{provider}.md
```

Where `{provider}` is the lowercase provider name (e.g. `gcp`, `aws`, `azure`, `oci`).

- If the file **exists and is non-empty** → read its full content and store it as `{PROVIDER}_RULES`. All loaded rules will be injected into the agent prompt.
- If the file **does not exist or is empty** → proceed without it. Do not warn the user.

If rules are loaded, confirm internally which providers have rules available before proceeding to Phase 1.

### 0.4 Check Azure DevOps Environment Variables

Read the environment variables `AZURE_DEVOPS_TOKEN` and `AZURE_DEVOPS_PROJECT` injected from `settings.local.json`.

Detect placeholder values using these rules:
- `{{AZURE_DEVOPS_TOKEN}}` is a placeholder if it is empty, unset, or equals `your-token-here`.
- `{{AZURE_DEVOPS_PROJECT}}` is a placeholder if it is empty, unset, or still contains the literal words `ORGANIZATION` or `PROJECT` in uppercase (e.g. `https://dev.azure.com/ORGANIZATION/PROJECT`).

If **either variable is a placeholder**, warn the user before continuing:

```
⚠  One or more required environment variables are not configured.

The following variables in .claude/settings.local.json still contain placeholder values:
  {list the offending variables}

To enable automatic CLI registration later, update settings.local.json with real values:
  {{AZURE_DEVOPS_TOKEN}}   — your Azure DevOps Personal Access Token
  {{AZURE_DEVOPS_PROJECT}} — the full project URL (e.g. https://dev.azure.com/my-org/MyProject)
```

Do **not** stop the skill — continue to Phase 1. Mark the variables internally as **unresolved** so Phase 3.3 can remind the user again before attempting CLI registration.

If **both variables are correctly populated**, parse them and store internally:
- Organisation URL: everything up to and including `/{org}` from `{{AZURE_DEVOPS_PROJECT}}` (e.g. `https://dev.azure.com/my-org`).
- Project name: the last path segment of `{{AZURE_DEVOPS_PROJECT}}` (e.g. `MyProject`).

These pre-filled values will be used in Phase 1.1 and Phase 3.3.

---

## Phase 1 — Gather Configuration

Ask the user for the following information. Group related questions — do not ask one by one unless the user prefers it. Skip questions whose answers the user has already provided. Collect all missing values before proceeding.

### 1.1 Azure DevOps Organisation and Project

If `AZURE_DEVOPS_PROJECT` was correctly resolved in Phase 0.4, use the parsed organisation URL and project name directly — do **not** ask the user to confirm. Display them as an informational note and move on:

```
Using pre-configured values from settings.local.json:
  Organisation URL : {org_url}
  Project          : {project_name}
```

If `AZURE_DEVOPS_PROJECT` is unresolved, ask the user for:
- **Organisation URL** — the root URL of the Azure DevOps organisation (e.g. `https://dev.azure.com/my-org`).
- **Project name** — the Azure DevOps project that hosts the repositories and will own the pipelines.

### 1.2 Pipeline Architecture

Ask whether to use the **modular template pattern** (recommended) or a **monolithic pattern**:

- **Modular template pattern** *(default — strongly recommended for 2+ repositories)*: Each app repository contains only a minimal `build-pipeline.yaml` (~15 lines) and `build-pipeline-validation.yaml` (~10 lines) that `extends:` a shared main template stored in the infra repository. All CI/CD logic lives in the infra repo under `{{PATH_INFRA}}/setup/azure/pipelines/templates/`. Variables are layered at four levels: global, per-environment, per-pool, and per-repo.
- **Monolithic pattern**: Each repository gets a self-contained pipeline YAML with all stages and logic inline. Simpler to understand initially but harder to maintain as the number of repos grows.

If the user chooses the modular pattern (or has 2+ repositories and does not express a preference), default to it.

If the user chooses the modular pattern, also ask:
- **Template repository name** — the Azure DevOps repository in the same project that will hold the shared templates (default: `infra`). This is the repo where `{{PATH_INFRA}}/setup/azure/pipelines/templates/` lives.
- **Template branch** — the branch of the template repository that app pipelines will reference (default: `main`).

### 1.3 Repositories and Branch Strategy

- **Repository list** — which Azure Repos repositories contain the applications to build. One minimal pipeline entry-point YAML will be created per repository (or one monolithic pipeline YAML if monolithic pattern was chosen).
- **App type per repository** — for each repo, what is the tech stack and application type? Examples:
  - `maven + ms` → Java Spring Boot microservice
  - `angular + web` → Angular web frontend
  - `dotnet + ms` → .NET microservice
  - `node + ms` → Node.js microservice
  - `docker + infra` → infrastructure component (no source build, just Docker pull+run)
  This determines which sub-pipeline template steps apply in modular mode.
- **CI trigger branches** — which branches trigger CI (e.g. push to `develop`, `release/*`, `main`).
- **PR validation pipeline** — whether a lighter PR validation pipeline is also wanted (build + test only, no Docker push and no deploy). In modular mode this is a separate `build-pipeline-validation.yaml`; in monolithic mode it is a conditional stage in the same YAML using `${{ if eq(variables['Build.Reason'], 'PullRequest') }}`.

### 1.4 Container Registry

- **Registry type** — Docker Hub, GCR, ACR, or other.
- **Registry URL or name** — the full URL or ACR name (e.g. `myregistry.azurecr.io`, `docker.io/myorg`).

### 1.5 Deployment Configuration

- **Ansible deploy playbook path** — path to the deploy playbook (e.g. `{{PATH_INFRA}}/deployment/ansible/deploy.yml`).
- **Environments** — which environments exist (e.g. `DEV`, `PROD`) and which require manual approval gates before deployment.
- **Jump server address** — the hostname or IP of the jump server used to reach private VMs.

### 1.6 Infrastructure Management Pipelines

Ask whether the project uses Terraform to manage infrastructure. If yes, collect:

- **Terraform directory** — path to the Terraform project base directory (default: `{{PATH_INFRA}}/deployment/terraform/`). With the multi-directory layout, this directory contains `shared/` plus one subdirectory per environment — one pipeline file will be generated per root module.
- **Terraform secrets group** — variable group name holding Terraform credentials and SSH public key values (default: `Secrets-infra`). This group is separate from `Secrets-{env}` because it contains different secrets (cloud provider credentials, SSH *public* keys for VM metadata injection, CI/CD service account identifiers).
- **Infra environment name prefix** — the Azure DevOps environment name prefix used to gate `terraform apply` (default: `{project_name}-infra`). A per-module approval environment will be created for each root module: `{infra-environment}-shared`, `{infra-environment}-{env}` (e.g. `AppMod-infra-shared`, `AppMod-infra-dev`). All must be created in Azure DevOps before the first run with approval checks configured.
- **Provisioning playbook** — path to the Ansible playbook that provisions VMs after `terraform apply` (e.g. `{{PATH_INFRA}}/deployment/ansible/site.yml`). This playbook installs Docker, databases, reverse proxies, and any other services — everything *except* application containers.
- **Provisioning skip tags** — Ansible tags to skip so that app containers are not deployed during provisioning (default: `app_deploy`). App deployment is left to the normal CI/CD pipelines.
- **Ansible group prefix** — the naming prefix used for Ansible inventory groups (e.g. `db`, `app`, `nginx`). Groups are assumed to follow the pattern `{prefix}_{env}` (e.g. `app_dev`, `db_prod`).

If the project does **not** use Terraform, skip this section entirely — no infra pipelines will be generated.

### 1.7 Agent Pool and Ansible

- **Agent pool name** — the Azure Pipelines agent pool to use (e.g. `Default`, `ubuntu-latest`, `self-hosted-linux`).
- **Ansible pre-installed** — whether Ansible is pre-installed on the agent or should be installed at pipeline runtime via `pip install ansible`.

### 1.8 Lint Step

Ask whether lint and code quality checks should be included in the CI stage (e.g. ESLint for JS/TS, Checkstyle for Java). Default is to include lint if a well-known config file is detectable (e.g. `.eslintrc`, `checkstyle.xml`).

### 1.9 Variable Groups and Service Connections

Ask whether variable groups and service connections should be created via CLI during this skill run, or managed manually by the user.

### 1.10 Personal Access Token

If `AZURE_DEVOPS_TOKEN` was correctly resolved in Phase 0.4, **skip this step entirely** — the PAT is ready and will be used automatically in Phase 3.3 without any further user input.

If `AZURE_DEVOPS_TOKEN` is unresolved, confirm the user has a Personal Access Token with the following scopes for registering pipelines and managing variable groups/service connections:

- Code (read)
- Build (read/write)
- Environment (read/write)
- Service Connections (read/manage)
- Variable Groups (read/write)

If not, instruct: **User Settings → Personal Access Tokens → New Token** and select these scopes.

The PAT is not stored by this skill — it is only used for CLI commands the user will run or approve.

### 1.11 Confirm Before Generation

Present a concise summary of all gathered values and ask the user to confirm before launching the agent:

```
Configuration summary:

  Organisation    : {org_url}
  Project         : {project_name}
  Pipeline pattern: {modular template | monolithic}
  Template repo   : {template_repo_name} @ {template_branch}   (modular only)
  Repositories    : {repo_list with tech type per repo}
  CI trigger      : {branch_strategy}
  PR pipeline     : {yes (separate validation file) / no}
  Registry        : {registry_type} — {registry_url}
  Environments    : {env_list} ({approval_gated} require approval)
  Jump server     : {jump_server_address}
  Terraform       : {yes — terraform dir, secrets group, infra environment | no}
  Provisioning    : {yes — playbook path, skip tags | no}
  Agent pool      : {agent_pool_name}
  Ansible         : {pre-installed / install at runtime via pip}
  Lint step       : {yes / no}
  Var groups      : {CLI / manual}
  Svc conns       : {CLI / manual}

Shall I proceed with generating the pipeline files?
```

Do not launch the agent until the user confirms.

---

## Phase 2 — Generate Pipelines (azure-pipelines-engineer)

### 2.1 Launch the Agent

Once the user confirms, launch `azure-pipelines-engineer` with the following prompt. Adapt based on whether monolithic or modular pattern was chosen.

---

**For the modular template pattern:**

Read `.claude/skills/setup-azure-pipelines/prompts/agent-prompt-modular.md`, replace all `{placeholder}` tokens with the values gathered in Phase 1, and use the result as the agent prompt.

---

**For the monolithic pattern:**

Read `.claude/skills/setup-azure-pipelines/prompts/agent-prompt-monolithic.md`, replace all `{placeholder}` tokens with the values gathered in Phase 1, and use the result as the agent prompt.

---

### 2.2 Review the Agent's Output

After the agent completes, check its output for:

- Any flagged assumptions or decisions requiring user awareness.
- Any values left as placeholders (e.g. `<REPLACE_ME>`) that the user must fill in before the first run.
- Any `# TODO:` or `# BREAKING CHANGE:` comments in the generated YAML.
- For modular pattern: confirm that the `templates/` directory structure is complete and that per-repo files are clearly labelled with where they must be copied.

Surface any issues clearly before proceeding to Phase 3.

---

## Phase 3 — Commit and Post-Generation Steps

### 3.1 Commit to Shared Git Repository

After the agent completes:

1. Verify `{{PATH_INFRA}}/.git` exists (Phase 0.2 ensures this).
2. Stage and commit:
   ```
   git -C infra add setup/azure/pipelines/
   git -C infra commit -m "chore: initial Azure Pipelines configuration — {project_name}"
   ```
3. Report the result to the user.

### 3.2 Modular Pattern — Per-Repo File Instructions

If modular pattern was used, remind the user:

```
Per-repo pipeline files were generated at:
  {{PATH_INFRA}}/setup/azure/pipelines/repos/{repo-name}/

Each app repository requires two files committed to its root Pipelines/ folder:
  - Pipelines/build-pipeline.yaml
  - Pipelines/build-pipeline-validation.yaml  (if PR validation was requested)
  - Pipelines/Variables/variables.yaml
  - Pipelines/Variables/variables-{env}.yaml   (one per environment)

These files are in {{PATH_INFRA}}/setup/azure/pipelines/repos/{repo-name}/.
Copy them to each respective repository before registering the pipelines.
```

### 3.3 Optional: Register Pipelines via CLI

Ask the user:

```
Would you like me to register the pipelines in Azure DevOps now?

This runs:
  az devops configure --defaults organization={org_url} project={project_name}

  For each repository:
  az pipelines create \
    --name {pipeline-name} \
    --yml-path Pipelines/build-pipeline.yaml \
    --repository {repo} \
    --branch {branch} \
    --folder-path \{group}
```

If yes:

Before running any CLI commands, re-read `AZURE_DEVOPS_TOKEN` and `AZURE_DEVOPS_PROJECT` from the environment (values may have been updated since Phase 0.4). Apply the same placeholder detection rules from Phase 0.4.

If either variable is still a placeholder, warn the user and skip CLI registration:

```
⚠  Pipeline registration requires valid environment variables.

{{AZURE_DEVOPS_TOKEN}} and/or {{AZURE_DEVOPS_PROJECT}} in .claude/settings.local.json
still contain placeholder values. Update them with real values, then re-run
this step by asking to register the pipelines again.
```

If both variables are correctly populated, proceed:

1. Authenticate: `echo ${{AZURE_DEVOPS_TOKEN}} | az devops login --organization {org_url}`
2. Run `az devops configure --defaults organization={org_url} project={project_name}`.
3. For each app repository, run `az pipelines create` with `--folder-path` set to the appropriate group folder (`\ms`, `\web`, `\lib`, etc.).
4. If a validation pipeline was generated, register it separately with `--folder-path \{group}\validation`.
5. If Terraform pipelines were generated, register one pipeline per root module plus the provision pipeline. Place terraform module pipelines in `\infra\terraform` and the provision pipeline in `\infra`:
   ```
   # One pipeline per root module — shared first, then each environment
   az pipelines create \
     --name "infra - terraform - shared" \
     --yml-path setup/azure/pipelines/repos/infra/Pipelines/terraform-shared-pipeline.yaml \
     --repository {infra_repo} \
     --branch {template_branch} \
     --folder-path \infra\terraform

   # Repeat for each environment (dev, staging, prod, …)
   az pipelines create \
     --name "infra - terraform - {env}" \
     --yml-path setup/azure/pipelines/repos/infra/Pipelines/terraform-{env}-pipeline.yaml \
     --repository {infra_repo} \
     --branch {template_branch} \
     --folder-path \infra\terraform

   az pipelines create \
     --name "infra - provision" \
     --yml-path setup/azure/pipelines/repos/infra/Pipelines/provision-pipeline.yaml \
     --repository {infra_repo} \
     --branch {template_branch} \
     --folder-path \infra
   ```
6. Report the pipeline ID and URL returned by each command.

If a command fails due to authentication, instruct the user to run `az login` and retry.

### 3.4 Optional: Create Variable Groups via CLI

Ask the user:

```
Would you like me to create the variable groups in Azure DevOps now?

Variable groups will be created with non-secret initial values only.
Secrets (SSH Secure File names, registry credentials, etc.) must be added manually
via the Azure DevOps UI after creation.
```

If yes, for each variable group run:

```
az pipelines variable-group create \
  --name {group-name} \
  --authorize true \
  --variables last_good_{env}_tag=""
```

If Terraform pipelines were generated, also create `{terraform-secrets-group}`:
```
az pipelines variable-group create \
  --name {terraform-secrets-group} \
  --authorize true
```
Secret values (`GCP_SA_KEY_JSON` / `AWS_*` / `ARM_*`, `TF_VAR_*`) must be added manually in the Azure DevOps UI after creation — the CLI cannot set secret variable values.

Report any errors clearly.

### 3.5 Optional: Create Service Connections via CLI

Ask the user:

```
Would you like me to create the service connections in Azure DevOps now?

I will generate the JSON configuration files for each connection and show you
the CLI command before running it. Service connection creation requires:
  PAT scope: Service Connections (read/manage)
```

If yes, generate the appropriate service endpoint JSON for each connection (container registry and SSH jump server) and run:

```
az devops service-endpoint create --service-endpoint-configuration {json-file}
```

If it fails, instruct the user to create them manually in **Project Settings → Service Connections**.

### 3.6 Optional: Trigger First Run

Ask the user:

```
Would you like me to trigger a first pipeline run now?
  az pipelines run --name {pipeline-name}
```

If yes, run the command for each registered pipeline and report the run URL.

### 3.7 Approval Gate Reminder

Always display this reminder, regardless of whether approval-gated environments were specified:

```
⚠  Approval gates cannot be configured via CLI.

For any environment that requires manual approval before deployment, configure
the approval check in the Azure DevOps UI:

  Pipelines → Environments → {environment-name} → Approvals and checks → Add → Approvals

Environments requiring approval gates:
  - App deployment environments: {approval_gated_list}
  - Infrastructure apply environment: {infra-environment}  ← terraform apply gate (if Terraform is used)

This step must be completed before the first run to any gated environment.
The YAML only declares the environment name — Azure DevOps handles the gate.
```

---

## Phase 4 — Completion Summary

```
Azure Pipelines configuration generated successfully.

  Pattern         : {modular template | monolithic}
  Template files  : {{PATH_INFRA}}/setup/azure/pipelines/templates/         (modular only)
  Per-repo files  : {{PATH_INFRA}}/setup/azure/pipelines/repos/             (modular only)
  Pipeline files  : {{PATH_INFRA}}/setup/azure/pipelines/                   (monolithic only)
  App pipelines   : {count} pipeline(s) — one per repository
  Infra pipelines : {terraform-shared-pipeline.yaml + terraform-{env}-pipeline.yaml (one per env) + provision-pipeline.yaml | none}
  Environments    : {env_list}
  Infra env       : {infra-environment}                               (terraform apply gate, if used)
  Approval gates  : {approval_gated_list — or "none"}
  Var groups ref  : {{PATH_INFRA}}/setup/azure/pipelines/variable-groups.md
  Svc conns ref   : {{PATH_INFRA}}/setup/azure/pipelines/service-connections.md

{If modular pattern — include this block:}
Per-repo files to commit to each app repository:
  {{PATH_INFRA}}/setup/azure/pipelines/repos/{repo-name}/Pipelines/

{If user action required — omit block if none:}
Before the first pipeline run, complete the following:
  - Copy per-repo Pipelines/ files to each app repository and commit them
  - Grant the template repository (infra) read access to all app pipelines:
      Project Settings → Repositories → infra → Security → {Project} Build Service → Read
  - Upload the SSH deploy key to Azure DevOps Library → Secure Files
  - Populate secrets in the Common and Secrets-{env} variable groups
  - Populate {terraform-secrets-group} with cloud provider credentials and TF_VAR_* values
  - Create the {infra-environment} environment and add a manual approval check
  - Verify the container registry and SSH service connections are active

Recommended next steps:
  1. Review the generated template files at {{PATH_INFRA}}/setup/azure/pipelines/templates/
  2. Copy per-repo files to each app repository
  3. Configure approval checks in the Azure DevOps UI (see reminder above)
  4. Upload SSH Secure Files in Azure DevOps Library → Secure Files
  5. Populate secret values in the variable groups
  {If Terraform is used:}
  6. Run infra - terraform pipeline (plan → approve → apply)
  7. Run infra - provision pipeline to configure the freshly created VMs
  8. Trigger the first app pipeline run
  {If Terraform is not used:}
  6. Trigger the first pipeline run
```

---

## Phase 5 — Change Requests (User-Triggered)

This phase applies when the user asks to modify an already-generated pipeline configuration. Examples: "add a new repo", "add a staging environment", "change the agent pool", "update the Docker registry URL".

### 5.1 Read Existing State

Before making any changes, read the existing pipeline files:
- Modular: `{{PATH_INFRA}}/setup/azure/pipelines/templates/` and `{{PATH_INFRA}}/setup/azure/pipelines/repos/`
- Monolithic: `{{PATH_INFRA}}/setup/azure/pipelines/`

### 5.2 Determine Scope

- **New repository (modular)** → generate new per-repo files in `repos/{new-repo}/`. The shared templates need no changes if the tech stack is already covered; add a new sub-pipeline template only if it's a new tech type.
- **New repository (monolithic)** → launch `azure-pipelines-engineer` to generate a new YAML for that repo.
- **New environment** → update `templates/variables/` with a new `global-{env}.yaml` file; all repos inherit it automatically. Update `main-pipeline.yaml` default environments parameter.
- **New tech stack** → add a new `templates/sub/sub-pipeline-{tech}-{group}.yaml` file; update `main-pipeline.yaml` to add the conditional include.
- **Shared value change** (agent pool, registry URL, Ansible path) → update the affected global or pool variable template file. All repos inherit the change automatically (modular advantage).

### 5.3 Apply the Change

Launch `azure-pipelines-engineer` with:

> Read the existing pipeline files at `{{PATH_INFRA}}/setup/azure/pipelines/`.
> Apply the following change(s) to the existing files:
>
> {DESCRIPTION OF CHANGES}
>
> Diff against the existing files. Only modify the templates and stages affected by the change.
> Preserve all other templates and configuration exactly as they are.
> Report all files modified.

### 5.4 Commit the Change

```
git -C infra add setup/azure/pipelines/
git -C infra commit -m "chore: {brief description of change} — {project_name}"
```

If the pipeline is registered in Azure DevOps, inform the user to update it:

```
az pipelines update --name {pipeline-name}
```

---

## File and Folder Conventions

### Modular Template Pattern

| Artefact | Path |
| --- | --- |
| Master pipeline template | `{{PATH_INFRA}}/setup/azure/pipelines/templates/main-pipeline.yaml` |
| Global variables template | `{{PATH_INFRA}}/setup/azure/pipelines/templates/variables/global.yaml` |
| Per-env variables template | `{{PATH_INFRA}}/setup/azure/pipelines/templates/variables/global-{env}.yaml` |
| Pool variables template | `{{PATH_INFRA}}/setup/azure/pipelines/templates/variables/pools/global-{pool}.yaml` |
| Sub-pipeline templates | `{{PATH_INFRA}}/setup/azure/pipelines/templates/sub/sub-pipeline-{tech}-{group}.yaml` |
| Per-repo entry-point files | `{{PATH_INFRA}}/setup/azure/pipelines/repos/{repo-name}/Pipelines/` |
| Infra pipeline files (optional) | `{{PATH_INFRA}}/setup/azure/pipelines/repos/infra/Pipelines/terraform-shared-pipeline.yaml`, `terraform-{env}-pipeline.yaml` (one per env), `provision-pipeline.yaml` |
| Variable group reference | `{{PATH_INFRA}}/setup/azure/pipelines/variable-groups.md` |
| Service connection reference | `{{PATH_INFRA}}/setup/azure/pipelines/service-connections.md` |
| Provider rules (optional) | `.claude/rules/cloud-providers/{provider}.md` |

### Monolithic Pattern

| Artefact | Path |
| --- | --- |
| Pipeline YAML files | `{{PATH_INFRA}}/setup/azure/pipelines/` |
| Variable group reference | `{{PATH_INFRA}}/setup/azure/pipelines/variable-groups.md` |
| Service connection reference | `{{PATH_INFRA}}/setup/azure/pipelines/service-connections.md` |
| Provider rules (optional) | `.claude/rules/cloud-providers/{provider}.md` |

---

## Guidelines

- **Never skip Phase 0** — always verify the Azure CLI and the `azure-devops` extension before proceeding.
- **Never skip Phase 1.10** — always present the configuration summary and wait for user confirmation before launching the agent.
- **Default to modular** — when 2+ repositories are involved and the user has no strong preference, recommend and default to the modular template pattern. Explain the maintenance advantage.
- **Deployment jobs** — all CD stages must use `- deployment:` not `- job:`. This applies to every environment, even those without approval gates, for consistency and audit history.
- **SSH keys as Secure Files** — SSH private keys must always be stored as Azure DevOps Library Secure Files. Never suggest storing them as pipeline variables or in the repository.
- **Approval gates** — approval checks cannot be configured via CLI. Always remind the user to configure them in the Azure DevOps UI before the first deployment to approval-gated environments.
- **No secrets in YAML** — generated YAML files must never contain hardcoded credentials, tokens, or passwords. All sensitive values must come from variable groups or Secure Files.
- **Provider rules** — detect all applicable providers (always `azure`, plus the infrastructure cloud provider and registry provider inferred from context). For each, check `.claude/rules/cloud-providers/{provider}.md`. If it exists and is non-empty, load and inject it into the agent prompt. Never block or warn the user if a rule file is absent or empty.
- **Shared `{{PATH_INFRA}}/` repository** — all pipeline files are committed under `{{PATH_INFRA}}/setup/azure/pipelines/` in the shared infra repository, not in a separate git repo.
- **ProxyJump scoped to Ansible** — the pipeline must pass `-o ProxyJump=<jump_server>` via `ansible_ssh_common_args` in the `ansible-playbook` invocation. Do not configure a global SSH config that could affect unrelated connections on the agent.
- **Template repository access** — when using the modular pattern, all app pipelines need read access to the template repository. Remind the user to grant this in: **Project Settings → Repositories → {template_repo} → Security → {Project} Build Service → Read**.
- **Azure DevOps pipeline folders** — register pipelines in logical folder groups (`\ms`, `\web`, `\lib`, `\infra`, etc.) with validation pipelines in `\{group}\validation` subfolders. This mirrors the folder structure in the HF reference project and makes the pipeline list navigable at scale.
- **Infrastructure pipelines are optional** — only generate `terraform-pipeline.yaml` and `provision-pipeline.yaml` when the project uses Terraform (detected from Phase 1.6 answers or inferred from `{{PATH_INFRA}}/deployment/terraform/`). Never generate them unconditionally.
- **Infra pipeline triggers are always manual** — `terraform-pipeline.yaml` and `provision-pipeline.yaml` must have `trigger: none` and `pr: none`. Infrastructure changes are intentional and destructive; they must never run automatically on a code push.
- **Separate concerns between provision and deploy** — `provision-pipeline.yaml` sets up the OS-level services (Docker, databases, reverse proxies) and must always `--skip-tags {provisioning-skip-tags}` to avoid deploying application containers. Application container deployment is exclusively the responsibility of the per-repo CI/CD pipelines.
- **Terraform plan artifact** — the plan file published in Stage 1 must be consumed by Stage 2 on a potentially different agent. Re-running `terraform init` in Stage 2 is required before applying the downloaded plan (the backend connection is not preserved between agents). Each module pipeline names its artifact `tfplan-{module}` (e.g. `tfplan-shared`, `tfplan-dev`) to avoid collisions if multiple module pipelines run concurrently.
- **One Terraform pipeline per root module** — generate a separate `terraform-{module}-pipeline.yaml` for `shared/` and each environment directory. Each pipeline targets only its own subdirectory (`-chdir=.../terraform/{module}`), has its own approval environment (`{infra-environment}-{module}`), and runs independently. Never combine multiple modules into one pipeline run. The `shared` module must always be applied before environment modules.
- **TF_VAR_* variables from variables.tf** — derive the list of `TF_VAR_*` entries in `{terraform-secrets-group}` by reading `variables.tf` and identifying all `sensitive = true` input variables. Do not hardcode a fixed list; adapt to whatever the project's Terraform configuration requires.

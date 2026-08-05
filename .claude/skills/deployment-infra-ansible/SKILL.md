---
name: deployment-infra-ansible
description: "Use this skill when the user asks to generate, create, or set up an Ansible project to configure and deploy applications to infrastructure provisioned by Terraform, or to automate configuration management for cloud VMs. Triggers include: 'create ansible project', 'generate ansible', 'ansible deploy', 'configure servers with ansible', 'ansible playbook', 'deploy app with ansible'. Orchestrates two agents in sequence: infra-ansible-extractor (reads Terraform state/plan/manifest, maps outputs to Ansible host groups, produces a structured config-manifest.json) and infra-ansible-coder (implements the Ansible project from the manifest)."
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Deployment — Infrastructure as Ansible

Use this skill when a user needs an Ansible project generated to configure and deploy applications to infrastructure provisioned by Terraform. You, the main Claude agent, orchestrate two specialised sub-agents in sequence:

- **`infra-ansible-extractor`** — reads Terraform state, plan output, or the resource manifest; maps infrastructure outputs to Ansible inventory groups; resolves ambiguities; and produces a structured intermediate file `./{{PATH_DOCS}}/5-deployment/config-manifest.json`. Defined at `.claude/agents/deployment/infra-ansible-extractor.md`. Use `subagent_type: infra-ansible-extractor` when invoking via the Agent tool.
- **`infra-ansible-coder`** — reads `./{{PATH_DOCS}}/5-deployment/config-manifest.json` and implements a complete, production-grade Ansible project at `{{PATH_INFRA}}/deployment/ansible/`, always including the dynamic inventory script. Defined at `.claude/agents/deployment/infra-ansible-coder.md`. Use `subagent_type: infra-ansible-coder` when invoking via the Agent tool.

---

## Phase 0 — Prerequisites

### 0.0 Check Ansible CLI

Before doing anything else, verify the Ansible CLI is available:

```
ansible --version
```

- If the command succeeds → proceed.
- If it fails → inform the user: "Ansible CLI not found. Attempting to install now..." and try to install it:
  - **Linux**: `pip install ansible` or use the system package manager (e.g. `apt install ansible`, `dnf install ansible`).
  - **macOS**: `pip install ansible` or `brew install ansible`.
  - **Windows**: Ansible cannot run on Windows. The Ansible CLI uses `os.get_blocking()`, a POSIX-only syscall that crashes on Windows regardless of Python version (manifests as `OSError: [WinError 1]`). Ansible installs via pip without errors but every command fails at startup. Inform the user:
    > Ansible cannot run on Windows (POSIX syscall dependency). Production execution is always handled by the Linux pipeline agent. For local debugging, you have two options:
    > 1. **Docker (recommended — no WSL required)**: Runs Ansible inside a Linux container via Docker Desktop. The coder will generate a `Dockerfile` and a `debug-local.sh` harness that mirrors the CI/CD agent environment exactly. Use this for fast local debugging without pipeline roundtrips.
    > 2. **WSL**: Install Windows Subsystem for Linux, then inside WSL: `pip install ansible`. Ansible commands work normally from the WSL shell. Use this for local debugging.
    >
    > Local validation steps (syntax check, inventory lint) will be skipped if neither option is available — the pipeline agent will catch errors on first run.
    >
    > Do you want a local debugging setup? If so, which option?
    - If the user chooses **Docker** → check Docker is available (`docker --version`). If not, ask the user to install Docker Desktop first. Proceed — the coder will generate `Dockerfile` + `debug-local.sh`. Validation steps (5.1, 5.3, 5.4) use the Docker wrapper instead of native `ansible` commands.
    - If the user chooses **WSL** → remind them to run debugging commands from inside the WSL shell, not from PowerShell/cmd.
    - If the user chooses **neither / pipeline only** → proceed. All validation steps that invoke the Ansible CLI (Phases 5.1, 5.3, 5.4) will be noted as skipped.
  - If installation fails because Python is not installed:
    - **Linux**: Try to install Python with the distro package manager (`apt install python3 python3-pip` / `dnf install python3 python3-pip`), then retry `pip install ansible`.
    - If Python installation fails, stop and ask the user to install Python manually before retrying.

### 0.1 Ensure shared git repository

Check whether `{{PATH_INFRA}}/` is a git repository (`{{PATH_INFRA}}/.git` exists):

- If it **already exists** → proceed.
- If it **does not exist** → initialise it: `git -C infra init`. Report: "Git repository initialised at `{{PATH_INFRA}}/`."

Do **not** create a separate `.git` inside `{{PATH_INFRA}}/deployment/ansible/`. All commits for this project happen at the `{{PATH_INFRA}}/` root. If `{{PATH_INFRA}}/deployment/ansible/` does not exist yet, create the directory — it will be tracked by the parent repo.

### 0.2 Detect cloud provider(s) and load rules

Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` (if it exists) to identify the cloud provider(s) used. If the manifest does not exist yet, infer the provider from available context (e.g. Terraform files at `{{PATH_INFRA}}/deployment/terraform/`).

For each provider detected, check if a rule file exists at:
```
.claude/rules/cloud-providers/{provider}.md
```

Where `{provider}` is the lowercase provider name (e.g. `gcp`, `aws`, `azure`, `oci`).

- If the file **exists and is non-empty** → read its full content and store it as `{PROVIDER}_RULES`. It will be appended to the prompts sent to both agents.
- If the file **does not exist or is empty** → proceed without it.

---

## Phase 1 — Gather Infrastructure Information

Determine the source of infrastructure information using the following fallback logic. Tell the user which path was taken after resolving it.

### 1.1 Fallback logic

**Step 1 — Detect Terraform layout and backend type**

First determine whether the Terraform project uses the multi-directory layout (recommended) or the legacy flat root:
- **Multi-directory layout** — `{{PATH_INFRA}}/deployment/terraform/shared/` exists and at least one env subdirectory exists (e.g. `dev/`, `prod/`). Each subdir is a root module with its own `backend.tf`.
- **Flat root** — no subdirectories; `main.tf`, `outputs.tf`, `backend.tf` are directly in `{{PATH_INFRA}}/deployment/terraform/`.

For **multi-directory layout**: scan `.tf` files in each **environment** module directory (e.g. `dev/`, `stg/`, `prod/`) for a `backend` block inside a `terraform {}` stanza. Backend config is the same across all env modules (same backend type, different state key). Skip `shared/` for state reading purposes — it has no VM outputs needed by Ansible.

For **flat root**: scan all `.tf` files in `{{PATH_INFRA}}/deployment/terraform/` for a `backend` block.

- If a `backend` block is found → `BACKEND_TYPE = <type>` (e.g. `gcs`, `s3`, `azurerm`, `oci`, `cos`, `remote`)
- If no `backend` block is found → `BACKEND_TYPE = local`

Supported remote backend types and their providers:

| Backend type | Provider |
|---|---|
| `gcs` | Google Cloud Storage (GCP) |
| `s3` | S3-compatible (AWS, MinIO, etc.) |
| `azurerm` | Azure Blob Storage |
| `oci` | Oracle Cloud Infrastructure Object Storage |
| `cos` | IBM Cloud Object Storage |
| `remote` | Terraform Cloud / HCP Terraform |
| `http` | Generic HTTP backend |

**Step 2 — Read state**

For **multi-directory layout**, use the first environment module directory as the canonical state source (e.g. `dev/`). All env modules share the same backend type and resource structure — reading one is sufficient for topology extraction.

Let `TF_CHDIR` = the target directory:
- Multi-directory: `{{PATH_INFRA}}/deployment/terraform/dev` (or the first env subdir found)
- Flat root: `{{PATH_INFRA}}/deployment/terraform`

```
if BACKEND_TYPE == local {

    if {TF_CHDIR}/terraform.tfstate exists
       AND the file is not empty
       AND the file contains real resource state (not just basic Terraform metadata) {

        SOURCE = tfstate
        Read {TF_CHDIR}/terraform.tfstate directly

    } else {
        STATE_AVAILABLE = false
    }

} else {
    // Remote backend: state lives in the cloud, not on disk.
    // terraform show -json fetches it from the configured backend regardless of provider.
    // Run terraform init first if .terraform/ does not exist or is stale.

    if {TF_CHDIR}/.terraform/ does not exist {
        Run: terraform -chdir={TF_CHDIR} init
    }

    Run: terraform -chdir={TF_CHDIR} show -json

    if command succeeds
       AND output is valid JSON
       AND output contains resources (values.root_module.resources is non-empty) {

        SOURCE = terraform-show
        STATE_AVAILABLE = true
        Use the JSON output from `terraform show -json` as the state data

    } else {
        STATE_AVAILABLE = false
    }
}
```

**Step 3 — Handle unavailable state**

If `STATE_AVAILABLE = false`:

    Explain to the user:
        "Terraform state is not available yet (infrastructure not applied), so the group structure and
        output mappings cannot be read from live state.

        Option A — Run terraform apply now:
          • Provisions the infrastructure, populates state with real outputs.
          • The extractor reads real group mappings from state.
          • After reading I can run terraform destroy to tear it back down.
          • Note: this will create real cloud resources and may incur costs.

        Option B — Skip terraform apply:
          • I will derive group mappings from the terraform plan output or the resource manifest.
          • No infrastructure is provisioned now, no cost incurred.

        Either way, the Ansible inventory will always be dynamic (dynamic_inventory.sh).
        The inventory resolves IPs at pipeline runtime via terraform output -json,
        so it will work correctly once the infrastructure is live.

        Would you like me to run terraform apply now (Option A), or skip it (Option B)?"

    if user chooses Option A {
        Run: terraform -chdir={TF_CHDIR} apply -auto-approve
        if BACKEND_TYPE == local {
            SOURCE = tfstate
            Read {TF_CHDIR}/terraform.tfstate
        } else {
            Run: terraform -chdir={TF_CHDIR} show -json
            SOURCE = terraform-show
        }
        Ask: "Would you like me to run terraform destroy now to tear down the infrastructure?"
        if user says yes {
            Run: terraform -chdir={TF_CHDIR} destroy -auto-approve
        }
    } else { // user chooses Option B
        Run: terraform -chdir={TF_CHDIR} plan -json
        if plan executes correctly (exit code 0 or 2) {
            SOURCE = terraform-plan
            Use the plan JSON output
        } else {
            SOURCE = resource-manifest
            Read ./{{PATH_DOCS}}/5-deployment/resource-manifest.json
        }
    }

### 1.2 Inventory is always dynamic

Inventory is **always** `dynamic_inventory.sh` — never a static file. This is true regardless of whether state is available and regardless of whether IPs are resolvable at manifest-generation time.

The dynamic inventory script calls `terraform output -json` at pipeline runtime to resolve IPs on the fly. It is always a **shell script** (`.sh`) — Ansible runs on Linux agents, `.bat` is never applicable.

The source read in Phase 1.1 (tfstate, terraform-show, terraform-plan, or resource-manifest) is used only to understand infrastructure topology (groups, output key names, VM roles) so the extractor can populate `dynamic_inventory.output_mappings` correctly. IPs from state are **not** baked into any inventory file.

Report to the user:
```
Infrastructure source: {SOURCE}
Inventory strategy: dynamic (dynamic_inventory.sh — IPs resolved at pipeline runtime via terraform output -json)
```

---

## Phase 2 — Extraction: Analysis Pass (infra-ansible-extractor — dry run)

### 2.1 Launch the extractor in analysis mode

Launch `infra-ansible-extractor` with the following instruction:

> **ANALYSIS PASS — do NOT save config-manifest.json yet.**
>
> Infrastructure source: `{SOURCE}` (one of: tfstate, terraform-show, terraform-plan, resource-manifest)
> IPs resolved: `{true|false}`
>
> {If SOURCE = tfstate}: The terraform.tfstate content is attached below. Read it and identify all provisioned resources, outputs, instance IPs, and host metadata.
> {If SOURCE = terraform-show}: The output of `terraform show -json` is attached below. This is equivalent to the full state but fetched from a remote backend (e.g. GCS, S3, AzureRM, OCI, IBM COS). Read it and identify all provisioned resources, outputs, instance IPs, and host metadata exactly as you would for tfstate.
> {If SOURCE = terraform-plan}: The terraform plan JSON output is attached below. Read it and identify all planned resources and outputs.
> {If SOURCE = resource-manifest}: Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`.
>
> Reference the example manifest at `.claude/skills/deployment-infra-ansible/examples/config-manifest.gcp-vms-dockerized.example.json` to understand the expected level of detail for group definitions, `output_mappings`, connection configuration, `tasks_summary`, vault variables, and `extractor_notes`.
>
> Also read the Terraform project at `{{PATH_INFRA}}/deployment/terraform/` to understand:
> - All `output` blocks defined in the Terraform code (these map to the dynamic inventory)
> - The networking topology (VPCs, subnets, jump servers, private VMs)
> - Which VMs belong to which logical roles (e.g. nginx, app, db, jump)
>
> Your task:
> 1. Identify all Terraform outputs that correspond to hostnames or IP addresses.
> 2. Map each output to the appropriate Ansible inventory group (e.g. `jump_server_ip` → group `jump`).
> 3. Identify the SSH user, SSH key reference, and jump server configuration.
> 4. Identify which application(s) will be deployed to which groups (infer from VM naming conventions or ask if unclear).
> 5. Compile a complete list of every ambiguity, gap, or missing value you found.
>
> Present your findings as:
> - **Extraction Summary**: provider, environments, VMs found, groups identified
> - **Proposed group mappings**: terraform output → ansible group
> - **Ambiguities Found**: grouped by category (Inventory, Connection, Deployment, Variables)
> - **Decisions Made**: minor choices you resolved yourself
>
> Do NOT write any files. Return your findings as output only.
>
> {If any provider rules were loaded in Phase 0.2, append:}
> ---
> ## Provider Rules
> {For each provider with rules:}
> ### {PROVIDER} Rules
> {PROVIDER_RULES}

### 2.2 Relay ambiguities to the user

Read the extractor's output. If it reports ambiguities:

- Present them to the user grouped exactly as the extractor returned them.
- Ask the user to resolve each one before proceeding.
- Collect all answers.

If the extractor reports **no ambiguities**, proceed directly to Phase 3 — Production Pass.

### 2.3 Iterate if needed

If the user's answers are incomplete or raise new questions, ask follow-up questions before continuing. Do not proceed with unresolved critical parameters (especially: SSH user, SSH key reference, jump server identity, application-to-group mapping).

---

## Phase 3 — Extraction: Production Pass (infra-ansible-extractor — save manifest)

### 3.1 Launch the extractor to produce the manifest

Once all ambiguities are resolved, launch `infra-ansible-extractor` again with:

> **PRODUCTION PASS — produce and save config-manifest.json.**
>
> Infrastructure source: `{SOURCE}` (one of: tfstate, terraform-show, terraform-plan, resource-manifest)
> IPs resolved: `{true|false}`
>
> {Same infrastructure data attachment as in Phase 2.1 — for terraform-show, attach the output of `terraform show -json`}
>
> Apply the following resolved ambiguities:
> {LIST_OF_RESOLVED_AMBIGUITIES}
>
> Use the manifest template at `.claude/skills/deployment-infra-ansible/templates/config-manifest.template.json` as the base structure for initial generation (skip this if a manifest already exists — use the existing manifest as the base instead).
> Reference the example manifest at `.claude/skills/deployment-infra-ansible/examples/config-manifest.gcp-vms-dockerized.example.json` to calibrate the expected level of detail for `output_mappings`, group vars, `tasks_summary`, vault variables, and `extractor_notes`. Your manifest should be at least as detailed and complete as this example.
>
> Produce the complete `config-manifest.json` at `./{{PATH_DOCS}}/5-deployment/config-manifest.json`.
>
> The manifest must include:
> - `inventory.strategy`: always `"dynamic"`
> - `inventory.dynamic_inventory` section (always include, even if IPs are resolved — describes the mapping for future use):
>   - `terraform_project_path`: relative path from ansible project root to terraform project
>   - `output_mappings`: list of `{ terraform_output_key, ansible_group, host_variable }` entries
> - `groups`: all Ansible inventory groups with their vars
> - `playbooks`: list of playbooks to generate
> - `roles`: list of roles to generate
> - `connection`: SSH user, key reference, jump server config
> - `variables`: global and group_vars
>
> Document all decisions and assumptions in `extractor_notes`.
>
> {If any provider rules were loaded in Phase 0.2, append the same Provider Rules block}

### 3.2 Validate the manifest

After the extractor confirms the file has been saved:

1. **Parse the JSON** — read `./{{PATH_DOCS}}/5-deployment/config-manifest.json` and verify it is syntactically valid JSON. If it fails to parse, report the error and re-launch the extractor to fix it.
2. **Check for inconsistencies**:
   - All groups referenced in playbooks must be defined in `groups`.
   - All roles referenced in playbooks must be listed in `roles`.
   - `dynamic_inventory.output_mappings` must reference group names that exist in `groups`.
   - `inventory.strategy` must be `"dynamic"`.
   - No `static_hosts`, `static_file`, or `host_vars` fields should be present.
3. **Fix or re-extract**: fix minor JSON formatting issues directly; re-launch the extractor for substantive issues.

Only proceed to Phase 4 when the manifest is clean and parses correctly.

---

## Phase 4 — Implementation (infra-ansible-coder)

### 4.1 Launch the coder

Launch `infra-ansible-coder` with:

> Read `./{{PATH_DOCS}}/5-deployment/config-manifest.json` and implement the complete Ansible project at `{{PATH_INFRA}}/deployment/ansible/`.
>
> Follow all best practices defined in your agent instructions.
>
> Inventory is **always dynamic**: always generate `{{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh`
> as described in the manifest. Never generate a static hosts file. Mark it executable (chmod +x in a note).
>
> After implementation, perform a quality assurance pass: check for syntax errors, undefined variables, missing role directories, and ansible.cfg consistency.
> Report all files created or modified, all roles implemented, all variables requiring values before first run, and any assumptions or limitations.
>
> {If any provider rules were loaded in Phase 0.2, append the same Provider Rules block}

### 4.2 Review the coder's output

Read the coder's completion report. Check for:
- Any flagged assumptions or limitations requiring user awareness.
- Any variables marked as requiring values before first run (especially SSH key paths, vault passwords, registry credentials).
- Any playbook tasks that require manual pre-requisites on the remote hosts.

If the coder reports issues it could not resolve, surface them clearly to the user.

### 4.3 Initial commit

After the coder completes, commit all files to the shared `{{PATH_INFRA}}/` repository:

```
git -C infra add deployment/ansible/
git -C infra commit -m "chore: initial Ansible project — {PROJECT_ID}"
```

After the commit, update `sync_state` in the manifest:
```
git -C infra rev-parse HEAD
```
Read `./{{PATH_DOCS}}/5-deployment/config-manifest.json`, set:
- `sync_state.last_synced_commit` → the commit hash returned above
- `sync_state.last_synced_at` → current ISO8601 timestamp
- `sync_state.ansible_path` → `"{{PATH_INFRA}}/deployment/ansible"` (if not already set)
Save the file. Do not stage or commit this manifest update — it lives in `./docs/`, not `{{PATH_INFRA}}/`.

---

## Phase 5 — Validation

### 5.1 Check ansible CLI availability

- **Linux/macOS/WSL**: Run `ansible --version`.
- **Windows with Docker**: Run `.\run.ps1 ansible --version` from the Ansible project root.
- **Windows, pipeline agent only**: Note that all CLI validation steps are skipped. Project generation is complete.

### 5.2 Validate ansible.cfg and project structure

Read `{{PATH_INFRA}}/deployment/ansible/ansible.cfg` directly and verify it is syntactically correct (valid INI format with `[defaults]` and `[ssh_connection]` sections). If Ansible is available locally (Linux/macOS/WSL), optionally run:
```
ANSIBLE_CONFIG={{PATH_INFRA}}/deployment/ansible/ansible.cfg ansible --version
```
which prints the config file path Ansible picked up, confirming the correct file is active. On Windows without WSL, skip this command and rely on the file read instead.

Verify the expected project structure exists:
- `ansible.cfg` with inventory source configured
- `inventory/` directory with `dynamic_inventory.sh` (always dynamic)
- `group_vars/` directory
- `roles/` directory with all roles listed in the manifest
- At least one playbook (e.g. `site.yml`, `deploy.yml`)

### 5.3 Validate dynamic inventory script (if generated)

If the dynamic inventory script was generated:

1. **Check the script is syntactically valid** (requires Linux/WSL — skip on Windows without WSL):
   ```
   bash -n {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh
   ```
   On Windows without WSL: read the file and verify it has the correct shebang, `set -euo pipefail`, the empty-inventory fallback, and syntactically valid Python.
2. **Check the script is executable** (requires Linux/WSL — skip on Windows without WSL):
   ```
   ls -la {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh
   ```
   On Windows without WSL: note in the report that `chmod +x` must be run on a Linux system or pipeline agent before first use.
3. **Run ansible-inventory --list** (if Ansible is available locally):
   - Linux/macOS/WSL: `ansible-inventory -i {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh --list`
   - Windows with Docker: `.\run.ps1 ansible-inventory -i inventory/dynamic_inventory.sh --list` (from the Ansible project root)
   - It is **acceptable** if this fails to resolve hosts at this stage (infrastructure may not be provisioned yet).
   - It is **not acceptable** if the script itself has a syntax error or if `ansible-inventory` reports an invalid inventory format.
   - Report the result to the user clearly.

### 5.4 Validate playbook syntax (if Ansible is available)

Run a syntax check on each playbook:
```
ansible-playbook --syntax-check -i {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh {{PATH_INFRA}}/deployment/ansible/site.yml
ansible-playbook --syntax-check -i {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh {{PATH_INFRA}}/deployment/ansible/deploy.yml
```

This works on any platform where Ansible is installed (Linux, macOS, or WSL). The inventory script path is passed to satisfy the parser but does not need to be executable for a syntax check. If Ansible is not available locally, skip this step — the pipeline agent will catch syntax errors on first run.

Report pass/fail for each playbook.

---

## Phase 6 — Completion

Once all agents have completed and validation has passed, confirm to the user:

```
Ansible project generated successfully.

- Config manifest  : ./{{PATH_DOCS}}/5-deployment/config-manifest.json
- Project          : {{PATH_INFRA}}/deployment/ansible/
- Inventory        : dynamic_inventory.sh (resolves IPs at runtime via terraform output -json)
- Groups           : {LIST OF GROUPS}
- Playbooks        : {LIST OF PLAYBOOKS}
- Roles            : {LIST OF ROLES}

{If variables require values before first run — omit if none}:
Before running ansible-playbook, set the following:
  - {VARIABLE_NAME}: {description}
  ...

{If dynamic inventory was generated}:
Note: The dynamic inventory script resolves host IPs at runtime by querying each environment's Terraform module:
  terraform -chdir={{PATH_INFRA}}/deployment/terraform/{env} output -json   # e.g. dev, stg, prod
  (shared/ is excluded — it contains no VMs and exports no host outputs)
Ensure Terraform has been applied for each target environment before running Ansible.

Recommended next steps:
  1. Review {{PATH_INFRA}}/deployment/ansible/ and inspect the generated roles and playbooks.
  2. Set required variables in group_vars/ or via pipeline variable groups.
  3. Trigger the pipeline to provision and deploy — Ansible execution is handled by the CI/CD agent.

{If a local debugging setup was generated}:
For local debugging only (not for production runs):
  Linux/macOS/WSL:
    ansible-playbook -i {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh {{PATH_INFRA}}/deployment/ansible/site.yml
  Windows (Docker — debug-local.sh):
    cd {{PATH_INFRA}}/deployment/ansible
    ./debug-local.sh
```

---

## Manifest Freshness Check (Shared Procedure — MF)

Run this procedure at the start of Phase 7 before making any changes to an existing project. It verifies that the config-manifest reflects the current state of the Ansible project code in the infra repo.

### MF.1 — Read sync state from manifest

Read `./{{PATH_DOCS}}/5-deployment/config-manifest.json` and extract the `sync_state` block:
- `last_synced_commit` — the infra repo commit hash the manifest was last written against
- `ansible_path` — the subdirectory within `{{PATH_INFRA}}/` tracked by this manifest (default: `{{PATH_INFRA}}/deployment/ansible`)

If `sync_state` is absent or `last_synced_commit` is `null`, treat as potentially stale and jump to MF.3.

### MF.2 — Detect Ansible-relevant commits since last sync

Run both commands:
```
git -C infra rev-parse --git-dir
git -C infra log {last_synced_commit}..HEAD -- {ansible_path}/ --oneline
```

Interpret the result:
- **Empty output** → no Ansible-relevant commits since last sync. Manifest is fresh. Return to the calling phase.
- **Non-empty output** → Ansible project has changed since the manifest was last synced. Continue to MF.3 with the commit list.
- **`git -C infra` fails** (no git repo at `{{PATH_INFRA}}/`) → skip the check. Note: "Freshness check skipped — no git repository found at `{{PATH_INFRA}}/`." Return to the calling phase.
- **`last_synced_commit` not found in history** (unknown revision error) → treat as stale. Continue to MF.3 with a note that the recorded commit no longer exists (likely a rebase or force-push).

### MF.3 — Handle stale manifest

Present to the user:

```
⚠ The config-manifest appears to be out of sync with the Ansible project.

The following commits touched {{PATH_INFRA}}/{ansible_path}/ after the manifest was last synced:
  {list of commits, one per line}

{If last_synced_commit was not found in history}:
  Note: the previously recorded commit ({last_synced_commit}) no longer exists in the infra
  repo history. This may indicate a force-push or rebase since the manifest was last written.

Options:
  [R] Reconcile — read the current Ansible project and update the manifest to reflect it (recommended)
  [S] Skip      — proceed with the stale manifest (the manifest and Ansible project may diverge further)
  [A] Abort     — stop here so you can review the changes manually
```

Wait for the user's choice:
- **R** → run MF.4, then return to the calling phase with the refreshed manifest.
- **S** → return to the calling phase.
- **A** → stop. Report the stale commits.

### MF.4 — RECONCILE PASS (extractor)

Launch `infra-ansible-extractor` with:

> **RECONCILE PASS — update config-manifest.json to match the current Ansible project.**
>
> The manifest at `./{{PATH_DOCS}}/5-deployment/config-manifest.json` is out of sync with the Ansible project at `{{PATH_INFRA}}/{ansible_path}/`.
>
> Commits that modified the Ansible project since the manifest was last synced:
> {LIST_OF_STALE_COMMITS}
>
> Your task:
> 1. Read the current manifest at `./{{PATH_DOCS}}/5-deployment/config-manifest.json` as your base — do not discard it.
> 2. Read only the Ansible files in `{{PATH_INFRA}}/{ansible_path}/` that were touched by the commits above. Focus on changed files; do not re-read the entire project unless a commit is too broad to scope.
> 3. For each commit, determine what changed (roles, playbooks, group_vars, inventory script, output_mappings) and update the corresponding fields in the manifest.
> 4. Also read `{{PATH_INFRA}}/deployment/terraform/outputs.tf` and compare its outputs against `inventory.dynamic_inventory.output_mappings` — if outputs have been added, removed, or renamed in Terraform since the manifest was generated, update the mappings accordingly.
> 5. Do not remove groups, roles, or playbooks from the manifest unless they have been deleted from the Ansible project.
> 6. Do not add entries not present in the Ansible project.
> 7. Run `git -C infra rev-parse HEAD` and set `sync_state.last_synced_commit` to the returned hash.
> 8. Set `sync_state.last_synced_at` to the current ISO8601 timestamp.
> 9. Update `generated_at` to the current ISO8601 timestamp.
> 10. Append one entry per manifest field changed to `extractor_notes`, prefixed with `[RECONCILE]`.
> 11. Save the updated manifest to `./{{PATH_DOCS}}/5-deployment/config-manifest.json`.
>
> Confirm in your output what was updated and that `sync_state` has been written.

---

## Phase 7 — Change Requests (user-triggered)

This phase applies whenever the user asks to modify an **already-generated** Ansible project.

**The config-manifest.json is always the source of truth. The Ansible project must never diverge from it.**

### 7.0 — Freshness Check

Run the **Manifest Freshness Check** procedure (MF.1–MF.3) before classifying or applying any change. Do not proceed with a stale manifest unless the user explicitly chooses Skip.

### 7.1 Identify and classify the change

- **Structural change** — adds, removes, or fundamentally alters a group, role, or playbook structure. → Requires manifest update via extractor.
- **Configuration change** — modifies a variable value, task parameter, or handler inside an existing role. → Update the manifest directly, then re-run the coder with targeted instructions.
- **Multiple changes** — treat as structural if any single change is structural.

### 7.2 Update the manifest

**For structural changes** — launch `infra-ansible-extractor` in a targeted PRODUCTION PASS:

> **PRODUCTION PASS — update config-manifest.json to reflect the following change(s).**
> Read the current manifest at `./{{PATH_DOCS}}/5-deployment/config-manifest.json`.
> Apply the following change(s): {DESCRIPTION OF CHANGES}
> Preserve all existing groups, roles, and fields unaffected by the change.
> Update `generated_at` to the current timestamp.
> Save the updated manifest to `./{{PATH_DOCS}}/5-deployment/config-manifest.json`.

**For configuration changes** — edit `./{{PATH_DOCS}}/5-deployment/config-manifest.json` directly. Update `generated_at` to the current timestamp.

After updating, validate the manifest parses correctly (Phase 3.2 rules apply).

### 7.3 Update the Ansible project

Launch `infra-ansible-coder` with the updated manifest:

> Read `./{{PATH_DOCS}}/5-deployment/config-manifest.json` and apply the following change(s) to the existing Ansible project at `{{PATH_INFRA}}/deployment/ansible/`:
>
> {DESCRIPTION OF CHANGES}
>
> Only modify the files affected by the change. Preserve all other files exactly as they are.
> Report all files modified and a summary of changes applied.

After the coder completes, re-run validation (Phase 5) and commit the changes:

```
git -C infra add deployment/ansible/
git -C infra commit -m "chore: {brief description of change}"
```

After the commit, update `sync_state` in the manifest:
```
git -C infra rev-parse HEAD
```
Read `./{{PATH_DOCS}}/5-deployment/config-manifest.json`, set `sync_state.last_synced_commit` to the hash returned above and `sync_state.last_synced_at` to the current ISO8601 timestamp. Save the file.

### 7.4 Post-apply reconciliation

If the user applies Terraform and the infrastructure is live, re-run the output query for each environment module (not shared/):
```
terraform -chdir={{PATH_INFRA}}/deployment/terraform/{env} output -json   # repeat per env: dev, stg, prod, ...
```

Verify the dynamic inventory script resolves correctly end-to-end by running:
```
ansible-inventory -i {{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh --list
```

If any output key mappings need adjusting (e.g. an output was renamed in Terraform), update `config-manifest.json` accordingly and re-run the coder for the dynamic inventory script.

---

## File and Folder Conventions

| Artefact | Path |
| --- | --- |
| Config manifest | `./{{PATH_DOCS}}/5-deployment/config-manifest.json` |
| Resource manifest (Terraform) | `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` |
| Ansible project | `{{PATH_INFRA}}/deployment/ansible/` |
| Dynamic inventory script | `{{PATH_INFRA}}/deployment/ansible/inventory/dynamic_inventory.sh` |
| Terraform base directory (parent of shared/ and env subdirs) | `{{PATH_INFRA}}/deployment/terraform/` |
| Manifest template | `.claude/skills/deployment-infra-ansible/templates/config-manifest.template.json` |
| Manifest example (GCP dockerized VMs) | `.claude/skills/deployment-infra-ansible/examples/config-manifest.gcp-vms-dockerized.example.json` |
| Ansible .gitignore template | `.claude/skills/deployment-infra-ansible/templates/gitignore.template` |
| Provider rules (optional) | `.claude/rules/cloud-providers/{provider}.md` |

---

## Guidelines

- **Never skip Phase 0** — always check prerequisites before launching any agent.
- **Always follow the tfstate fallback logic** — do not assume which source to use. Follow the logic in Phase 1.1 and always report which source was used.
- **Inventory is always dynamic** — never generate a static inventory file (`hosts.ini`, `hosts.yml`). Always generate `dynamic_inventory.sh`. Never put hardcoded IPs or placeholders in any inventory file.
- **Dynamic inventory is always a shell script** — Ansible runs on Linux agents. `.bat` files are never valid for dynamic inventory, even in Windows-native projects.
- **Validate the manifest before launching the coder** — a malformed manifest will cause the coder to produce broken Ansible code.
- **Provider rules** — rules are optional and additive. Never block or warn the user about missing or empty rule files. Rules loaded in Phase 0.2 must be injected into every agent invocation prompt.
- **Config-manifest.json is the source of truth** — any change to `{{PATH_INFRA}}/deployment/ansible/` — however small — must be applied to the manifest first. Never update the Ansible project without updating the manifest.
- **Manifest sync_state** — `sync_state` must be written to the manifest after every successful git commit to `{{PATH_INFRA}}/deployment/ansible/`. The `last_synced_commit` field records which infra commit the manifest was last written against, scoped to `ansible_path` only. Commits touching Terraform, pipelines, or other infra paths do not count as drift and must not trigger false-positive staleness warnings.
- **Windows note** — Ansible cannot run on Windows. It installs via pip without error but crashes on every command with `OSError: [WinError 1]` due to a POSIX-only syscall (`os.get_blocking()`) in its CLI initialization. Use WSL for local execution, or rely entirely on the Linux pipeline agent for remote deployments. All CLI-based validation steps (5.1, 5.3, 5.4) are skipped on Windows without WSL; project generation is unaffected.

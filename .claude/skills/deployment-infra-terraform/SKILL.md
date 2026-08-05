---
name: deployment-infra-terraform
description: "Use this skill when the user asks to generate, create, set up, modify or scale a Terraform project to deploy infrastructure to a cloud provider, or to convert an infrastructure design document into Terraform code. Triggers include: 'create terraform project', 'generate terraform', 'terraform deploy', 'deploy infra', 'infrastructure as code', 'convert design to terraform', 'implement infra terraform', 'upscale', 'downscale', 'scale up', 'scale down', 'scale dev', 'scale prod', 'scale staging', 'increase capacity', 'decrease capacity', 'reduce [resource]', 'add more [resource]', 'change instance type', 'resize', or any request to change sizing, counts, or instance types of existing infrastructure resources. Orchestrates two agents in sequence: infra-terraform-extractor (extracts a structured resource manifest from the design doc) and infra-terraform-coder (implements the Terraform project from the manifest)."
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Deployment — Infrastructure as Terraform

Use this skill when a user needs a Terraform project generated from an infrastructure design document. You, the main Claude agent, orchestrate two specialised sub-agents in sequence:

- **`infra-terraform-extractor`** — reads the infrastructure design markdown document, extracts all technical specifications, resolves ambiguities, and produces a structured intermediate file `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`. Defined at `.claude/agents/infra-terraform-extractor.md`. Use `subagent_type: infra-terraform-extractor` when invoking via the Agent tool.
- **`infra-terraform-coder`** — reads `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and implements a complete, production-grade Terraform project at `{{PATH_INFRA}}/deployment/terraform/`. Defined at `.claude/agents/infra-terraform-coder.md`. Use `subagent_type: infra-terraform-coder` when invoking via the Agent tool.

---

## Phase 0 — Prerequisites

### 0.0 Check Terraform CLI

Before doing anything else, verify the Terraform CLI is available:

```
terraform version
```

- If the command succeeds → proceed.
- If it fails → inform the user: "Terraform CLI not found. Installing now..." and install it:
  - **Linux/macOS**: download and install from `https://releases.hashicorp.com/terraform/` or use the system package manager (e.g. `brew install terraform`, `apt install terraform`).
  - **Windows**: install via `winget install HashiCorp.Terraform` or `choco install terraform`, or download the binary from the official releases page and add it to PATH.
  - After installing, verify with `terraform version` before continuing.
  - If installation fails, stop and ask the user to install Terraform manually before retrying.

---

## Phase 1 — Locate the Infrastructure Design Document

### 1.1 Determine the document path

When the user asks to create a Terraform project:

- **If the user points to a specific document path** → use that path.
- **If the user does not specify a path** → check whether `./{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md` exists.
  - If it **exists** → proceed with that path.
  - If it **does not exist** → stop and warn the user:

    ```
    No infrastructure design document was found at the default location:
      ./{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md

    Please either:
      1. Point me to the location of your infrastructure design document, or
      2. Use the design-infra-markdown skill to create one first.
    ```

Do not proceed until a valid document path is confirmed.

### 1.2 Detect cloud provider(s) and load rules

Read the design document and identify all target cloud provider(s) referenced in it (e.g. `gcp`, `aws`, `azure`). Use lowercase names matching the pattern below.

For each provider detected, check if a rule file exists at:
```
.claude/rules/cloud-providers/{provider}.md
```

Where `{provider}` is the lowercase provider name (e.g. `gcp`, `aws`, `azure`, `oci`).

- If the file **exists and is non-empty** → read its full content and store it as `{PROVIDER}_RULES`. It will be appended to the prompts sent to both `infra-terraform-extractor` and `infra-terraform-coder`.
- If the file **does not exist or is empty** → proceed without it. Do not block or warn the user.

If rules are loaded, confirm internally which providers have rules available before proceeding to Phase 2.

---

## Phase 2 — Extraction: Analysis Pass (infra-terraform-extractor — dry run)

### 2.1 Launch the extractor in analysis mode

Launch `infra-terraform-extractor` with the following instruction:

> **ANALYSIS PASS — do NOT save resource-manifest.json yet.**
> Read and fully analyse the infrastructure design document at `{DOCUMENT_PATH}`.
> Reference the example manifest at `.claude/skills/deployment-infra-terraform/examples/resource-manifest.aws-webapp.example.json` to understand the expected level of detail for resource configs, dependencies, and extractor_notes.
> Extract all infrastructure specifications (resources, networking, compute, storage, IAM, environments, regions, etc.).
> Then compile a complete list of every ambiguity, gap, missing value, or conflicting information you found.
> Present this list clearly, grouped by category (e.g. Networking, Compute, Security, IAM, Storage).
> Do NOT write any files. Return your findings as your output only.
>
> {If any provider rules were loaded in Phase 1.2, append the following block — omit entirely if none were loaded}:
> ---
> ## Provider Rules
> The following provider-specific rules must be followed during extraction and manifest production:
>
> {For each provider with rules, include:}
> ### {PROVIDER} Rules
> {PROVIDER_RULES}

### 2.2 Relay ambiguities to the user

Read the extractor's output. If it reports ambiguities:

- Present them to the user grouped exactly as the extractor returned them.
- Ask the user to resolve each one before proceeding.
- Collect all answers.

If the extractor reports **no ambiguities**, proceed directly to Phase 3 — Production Pass.

### 2.3 Iterate if needed

If the user's answers are incomplete or raise new questions, ask follow-up questions before continuing. Do not proceed to the production pass with unresolved critical parameters.

---

## Phase 3 — Extraction: Production Pass (infra-terraform-extractor — save manifest)

### 3.1 Launch the extractor to produce the manifest

Once all ambiguities are resolved, launch `infra-terraform-extractor` again with:

> **PRODUCTION PASS — produce and save resource-manifest.json.**
> Read the infrastructure design document at `{DOCUMENT_PATH}`.
> Apply the following resolved ambiguities:
>
> {LIST_OF_RESOLVED_AMBIGUITIES}
>
> Use the manifest template at `.claude/skills/deployment-infra-terraform/templates/resource-manifest.template.json` as the base structure.
> Reference the example manifest at `.claude/skills/deployment-infra-terraform/examples/resource-manifest.aws-webapp.example.json` to calibrate the expected level of detail for resource configs, dependencies, extractor_notes, and variables.
> Extract all infrastructure specifications and produce the complete `resource-manifest.json` at `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`.
> Document all decisions and assumptions in the `extractor_notes` field of the manifest.
>
> {If any provider rules were loaded in Phase 1.2, append the following block — omit entirely if none were loaded}:
> ---
> ## Provider Rules
> The following provider-specific rules must be followed during manifest production:
>
> {For each provider with rules, include:}
> ### {PROVIDER} Rules
> {PROVIDER_RULES}

### 3.2 Validate the manifest

After the extractor confirms the file has been saved, you must:

1. **Parse the JSON** — read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and verify it is syntactically valid JSON. If it fails to parse, report the error to the user and re-launch the extractor to fix it.
2. **Check for inconsistencies** — review the manifest for:
   - Resources referenced in `dependencies` that are not defined elsewhere in the manifest.
   - Empty required fields (e.g. missing `type`, missing `config`, missing region or provider).
   - Logical contradictions (e.g. a resource scoped to an environment that is not listed under `project.environments`).
   - Resources present in Mermaid diagrams or tables of the original document that appear to be missing from the manifest (cross-reference the extractor's own `extractor_notes` if present).
3. **Report any issues** — if issues are found, describe them clearly to the user and decide whether to:
   - Fix minor issues yourself directly in the JSON (for formatting or trivial field completion).
   - Re-launch the extractor in **PRODUCTION PASS** mode with targeted correction instructions for substantive issues (e.g., missing resources, wrong dependencies, incorrect field values).

Only proceed to Phase 4 when the manifest is clean, consistent, and parses correctly.

---

## Phase 4 — Implementation (infra-terraform-coder)

### 4.1 Launch the coder

Launch `infra-terraform-coder` with:

> Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and implement the complete Terraform project at `{{PATH_INFRA}}/deployment/terraform/`.
> Follow all best practices defined in your agent instructions.
> After implementation, perform a full quality assurance pass: check for syntax errors, missing required fields, undefined references, circular dependencies, and provider configuration completeness.
> Report all files created or modified, all resources implemented, all variables requiring values before apply, and any assumptions or limitations.
>
> {If any provider rules were loaded in Phase 1.2, append the following block — omit entirely if none were loaded}:
> ---
> ## Provider Rules
> The following provider-specific rules must be followed during implementation:
>
> {For each provider with rules, include:}
> ### {PROVIDER} Rules
> {PROVIDER_RULES}

### 4.2 Review the coder's output

Read the coder's completion report. Check for:
- Any flagged assumptions or limitations that require user awareness.
- Any variables marked as requiring values before `terraform apply` (especially sensitive ones like credentials).
- Any `# BREAKING CHANGE:` comments in the generated code that the user should be aware of.

If the coder reports issues it could not resolve, surface them clearly to the user.

### 4.3 Commit to shared git repository

After the coder completes, commit the Terraform project to the shared `{{PATH_INFRA}}/` repository:

1. Check whether `{{PATH_INFRA}}/.git` exists.
   - If it **does not exist** → initialise it: `git -C infra init`. Report: "Git repository initialised at `{{PATH_INFRA}}/`."
   - Do **not** create a separate `.git` inside `{{PATH_INFRA}}/deployment/terraform/`.
2. Verify `.gitignore` is present at `{{PATH_INFRA}}/deployment/terraform/.gitignore`. If missing, copy from `.claude/skills/deployment-infra-terraform/templates/gitignore.template`.
3. Stage and commit the Terraform project files:
   ```
   git -C infra add deployment/terraform/
   git -C infra commit -m "chore: initial Terraform project — {PROJECT_ID}"
   ```
4. Report the result to the user:
   ```
   Committed Terraform project to {{PATH_INFRA}}/ repository.
   Initial commit created.
   ```
5. Update `sync_state` in the manifest now that the Terraform project is committed:
   ```
   git -C infra rev-parse HEAD
   ```
   Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`, set:
   - `sync_state.last_synced_commit` → the commit hash returned above
   - `sync_state.last_synced_at` → current ISO8601 timestamp
   - `sync_state.terraform_path` → `"{{PATH_INFRA}}/deployment/terraform"` (if not already set)
   Save the file. Do not stage or commit this manifest update — it lives in `./docs/`, not `{{PATH_INFRA}}/`.

---

## Phase 5 — Completion

Once both agents have completed successfully, confirm to the user:

```
Terraform project generated successfully.

- Manifest  : ./{{PATH_DOCS}}/5-deployment/resource-manifest.json
- Project   : {{PATH_INFRA}}/deployment/terraform/
- Provider  : {PROVIDER(S)}
- Resources : {RESOURCE_COUNT} resources across {ENVIRONMENT_COUNT} environment(s)

{If variables require values before apply — omit this block entirely if none}:
Before running terraform apply, set the following variables in terraform.tfvars:
  - {VARIABLE_NAME}: {description / why it is required}
  ...

Recommended next steps:
  1. Review {{PATH_INFRA}}/deployment/terraform/ and inspect the generated code.
  2. For each root module directory (shared/, {env1}/, {envN}/):
     Copy terraform.tfvars.example → terraform.tfvars and fill in required values.
  3. Apply shared resources first (other environments depend on its outputs):
     terraform -chdir={{PATH_INFRA}}/deployment/terraform/shared init
     terraform -chdir={{PATH_INFRA}}/deployment/terraform/shared plan
     terraform -chdir={{PATH_INFRA}}/deployment/terraform/shared apply
  4. Then apply each environment in order:
     terraform -chdir={{PATH_INFRA}}/deployment/terraform/{env} init
     terraform -chdir={{PATH_INFRA}}/deployment/terraform/{env} plan
     terraform -chdir={{PATH_INFRA}}/deployment/terraform/{env} apply
```

Then ask the user:

```
Would you like me to run terraform init and terraform plan now and fix any issues found?

Note: terraform plan requires valid provider credentials and network access to the cloud provider API.
If credentials are not yet configured in terraform.tfvars, the plan will fail at authentication.
```

---

## Phase 6 — Terraform Plan (optional, user-triggered)

This phase only runs if the user confirms they want to proceed.

### 6.1 Run terraform init

Run `terraform init` for each root module directory in order — `shared/` first, then each environment. For each directory:

```
terraform -chdir={{PATH_INFRA}}/deployment/terraform/<dir> init
```

Check the output for each:
- If init fails, report the error clearly and attempt to fix it (e.g. missing `versions.tf` in modules, provider source conflicts, lock file issues).
- Common fix: if `hashicorp/{provider}` is being installed alongside the canonical source (e.g. `oracle/oci`), add a `versions.tf` with `required_providers` to every module under `{{PATH_INFRA}}/deployment/terraform/modules/` and re-run init.
- Re-run init after each fix until it succeeds with no errors and no unexpected warnings.

### 6.2 Run terraform plan

Run `terraform plan` for `shared/` first, then each environment directory:

```
terraform -chdir={{PATH_INFRA}}/deployment/terraform/<dir> plan
```

Analyse the output for each directory:
- If the plan succeeds (exit code 0), report the number of resources to add/change/destroy and confirm to the user.
- If the plan fails, categorise each error:

  | Error type | How to handle |
  |---|---|
  | **Syntax / reference error** (undeclared variable, unknown resource type, missing argument) | Fix in the Terraform code and re-run the plan. |
  | **Provider configuration error** (missing required argument, wrong provider alias) | Fix the provider block or variable wiring and re-run. |
  | **Authentication error** (401, invalid credentials, key not found) | Do NOT attempt to fix. Inform the user that credentials in `terraform.tfvars` need to be updated. |
  | **Network / DNS error** (no such host, connection refused, timeout) | Do NOT attempt to fix. Inform the user that the cloud provider API is unreachable from this machine. |
  | **Resource not found / quota error** (404, quota exceeded, region not available) | Do NOT attempt to fix. Inform the user and suggest they verify the resource exists or request a quota increase. |

- After fixing code errors, re-run the plan. Repeat until either:
  - The plan succeeds, or
  - Only non-fixable errors remain (authentication, network, quota).

### 6.3 Report the outcome

```
terraform plan result:

  shared/  : {SUCCESS | FAILED — {reason}} — {N to add, N to change, N to destroy}
  {env1}/  : {SUCCESS | FAILED — {reason}} — {N to add, N to change, N to destroy}
  {envN}/  : {SUCCESS | FAILED — {reason}} — {N to add, N to change, N to destroy}

{If all succeeded}:
All plans are clean. Apply in order:
  1. terraform -chdir={{PATH_INFRA}}/deployment/terraform/shared apply
  2. terraform -chdir={{PATH_INFRA}}/deployment/terraform/{env} apply   (repeat per environment)

{If any failed with non-fixable errors}:
The plan for {dir} could not complete due to: {reason}.
Action required: {what the user must do — e.g. update credentials, check network access, verify quota}.
```

---

## Manifest Freshness Check (Shared Procedure — MF)

Run this procedure at the start of Phase 7 and Phase 8 before making any changes to an existing project. It verifies that the manifest reflects the current state of the Terraform code in the infra repo.

### MF.1 — Read sync state from manifest

Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and extract the `sync_state` block:
- `last_synced_commit` — the infra repo commit hash the manifest was last written against
- `terraform_path` — the subdirectory within `{{PATH_INFRA}}/` tracked by this manifest (default: `{{PATH_INFRA}}/deployment/terraform`)

If `sync_state` is absent from the manifest, or `last_synced_commit` is `null`, treat as potentially stale and jump directly to MF.3.

### MF.2 — Detect Terraform-relevant commits since last sync

Run both commands:
```
git -C infra rev-parse --git-dir
git -C infra log {last_synced_commit}..HEAD -- {terraform_path}/ --oneline
```

Interpret the result:
- **Second command produces empty output** → no Terraform-relevant commits since last sync. Manifest is fresh. Return to the calling phase.
- **Second command lists commits** → Terraform has changed since the manifest was last synced. Continue to MF.3 with the commit list.
- **`git -C infra` fails** (no git repo at `{{PATH_INFRA}}/`) → skip the check entirely. Note to user: "Freshness check skipped — no git repository found at `{{PATH_INFRA}}/`." Return to the calling phase.
- **`last_synced_commit` not found in git history** (unknown revision error from the log command) → treat as stale. Continue to MF.3 with a note that the recorded commit no longer exists (likely a rebase or force-push).

### MF.3 — Handle stale manifest

Present to the user:

```
⚠ The resource manifest appears to be out of sync with the Terraform project.

The following commits touched {{PATH_INFRA}}/{terraform_path}/ after the manifest was last synced:
  {list of commits, one per line — omit if commit hash was not found}

{If last_synced_commit was not found in history}:
  Note: the previously recorded commit ({last_synced_commit}) no longer exists in the infra
  repo history. This may indicate a force-push or rebase since the manifest was last written.

Options:
  [R] Reconcile — read the current Terraform code and update the manifest to reflect it (recommended)
  [S] Skip      — proceed with the stale manifest (the manifest and Terraform may diverge further)
  [A] Abort     — stop here so you can review the changes manually
```

Wait for the user's choice:
- **R** → run MF.4, then return to the calling phase with the refreshed manifest. Set `{STALE_WARNING}` = false.
- **S** → return to the calling phase. Set `{STALE_WARNING}` = true so the scaling checklist (if Phase 8) includes the caveat.
- **A** → stop. Report the stale commits. Do not proceed.

### MF.4 — RECONCILE PASS (extractor)

Launch `infra-terraform-extractor` with:

> **RECONCILE PASS — update resource-manifest.json to match the current Terraform project.**
>
> The manifest at `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` is out of sync with the Terraform project at `{{PATH_INFRA}}/{terraform_path}/`.
>
> Commits that modified the Terraform project since the manifest was last synced:
> {LIST_OF_STALE_COMMITS}
>
> Your task:
> 1. Read the current manifest at `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` as your base — do not discard it.
> 2. Read only the Terraform files in `{{PATH_INFRA}}/{terraform_path}/` that were touched by the commits listed above. Focus on changed files; do not re-read the entire project unless a commit is too broad to scope.
> 3. For each commit, determine what changed in the Terraform code and update the corresponding resource(s) in the manifest `config` fields.
> 4. Do not remove resources from the manifest unless they have been deleted from the Terraform project.
> 5. Do not add resources not present in the Terraform project.
> 6. Get the current HEAD: `git -C infra rev-parse HEAD`. Set `sync_state.last_synced_commit` to this hash.
> 7. Set `sync_state.last_synced_at` to the current ISO8601 timestamp.
> 8. Update `generated_at` to the current ISO8601 timestamp.
> 9. Append an entry to `extractor_notes` for every manifest field changed, prefixed with `[RECONCILE]`.
> 10. Save the updated manifest to `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`.
>
> Confirm in your output that the manifest has been reconciled and saved.

After the extractor completes, set `{STALE_WARNING}` = false and return to the calling phase.

---

## Phase 7 — Change Requests (user-triggered)

This phase applies whenever the user asks to modify an **already-generated** Terraform project — without providing a new design document. Examples: "change the DNS zone to private", "add a firewall rule", "rename a bucket", "change the machine type of an instance".

**The manifest is always the source of truth. The Terraform project must never diverge from it.**

### 7.0 — Freshness Check

Run the **Manifest Freshness Check** procedure (MF.1–MF.3) before classifying or applying any change. Do not proceed with a stale manifest unless the user explicitly chooses Skip.

### 7.1 Identify and classify the change

Determine the scope:
- **Structural change** — adds, removes, or fundamentally alters a resource (e.g. add a new VM, change a resource type, change a network topology). → Requires manifest update via extractor.
- **Configuration change** — modifies a field value inside an existing resource (e.g. change `visibility` from `public` to `private`, change a machine type, rename a bucket, update a CIDR). → Update the manifest directly (no extractor needed for simple field edits).
- **Multiple changes** — treat as structural if any single change is structural; otherwise treat as configuration.

### 7.2 Update the manifest

**For structural changes** — launch `infra-terraform-extractor` in a targeted PRODUCTION PASS:

> **PRODUCTION PASS — update resource-manifest.json to reflect the following change(s).**
> Read the current manifest at `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`.
> Apply the following change(s):
>
> {DESCRIPTION OF CHANGES}
>
> Preserve all existing resources and fields that are unaffected by the change.
> Update `generated_at` to the current timestamp.
> Save the updated manifest to `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`.

**For configuration changes** — edit `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` directly: locate the affected resource(s) and update only the relevant field(s). Update `generated_at` to the current timestamp.

After updating, validate the manifest is syntactically valid JSON (Phase 3.2 rules apply).

### 7.3 Update the Terraform project

Launch `infra-terraform-coder` with the updated manifest:

> Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and apply the following change(s) to the existing Terraform project at `{{PATH_INFRA}}/deployment/terraform/`:
>
> {DESCRIPTION OF CHANGES}
>
> Diff against the existing code. Only modify the files and resources affected by the change. Preserve all other resources exactly as they are. Do NOT regenerate the entire project.
> After changes, run a quality assurance pass on the modified files only.
> Report all files modified and a summary of changes applied.

### 7.4 Confirm to the user

```
Change applied.

- Manifest updated : ./{{PATH_DOCS}}/5-deployment/resource-manifest.json
- Terraform updated: {{PATH_INFRA}}/deployment/terraform/ ({LIST OF MODIFIED FILES})

Summary: {brief description of what changed}
```

If the change affects resources that are already provisioned (i.e. `terraform.tfstate` exists), add:

```
⚠ This change affects already-provisioned resources. Run terraform plan to review the impact before applying.
```

Commit the changes to the shared `{{PATH_INFRA}}/` repository (only if `{{PATH_INFRA}}/.git` exists):

```
git -C infra add deployment/terraform/
git -C infra commit -m "chore: {brief description of change}"
```

After the commit, update `sync_state` in the manifest:
```
git -C infra rev-parse HEAD
```
Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json`, set `sync_state.last_synced_commit` to the hash returned above and `sync_state.last_synced_at` to the current ISO8601 timestamp. Save the file.

---

## Phase 8 — Scaling Request (user-triggered)

This phase applies when the user explicitly requests a capacity change to an already-deployed infrastructure — upscale or downscale. It does **not** apply to new deployments or structural changes (use Phase 7 for those).

**Trigger phrases**: "upscale", "downscale", "scale up", "scale down", "increase capacity", "decrease capacity", "reduce [resource]", "add more [resource]", or any explicit request to change sizing, counts, or instance types of existing resources.

The manifest is always updated before the Terraform code. No Terraform changes are made without user confirmation via a scaling checklist.

---

### 8.0 — Freshness Check

Run the **Manifest Freshness Check** procedure (MF.1–MF.3) before doing anything. Do not proceed with a stale manifest unless the user explicitly chooses Skip (which sets `{STALE_WARNING}` = true).

---

### 8.1 — Parse the Scaling Request

Read the user's message and determine:
- **Direction**: upscale (increase capacity), downscale (reduce capacity), or mixed.
- **Environment target**: prod, staging, all, or unspecified.
- **Specificity**:
  - **Vague** — no resource name, no target value (e.g., "downscale the infra", "scale things up for prod").
  - **Explicit** — names at least one resource and a target value (e.g., "scale prod ASG min to 2", "downgrade staging RDS to db.t3.micro").

Proceed to 8.2 for vague requests, 8.3 for explicit requests.

---

### 8.2 — (Vague) Discover Scalable Resources

Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and enumerate all scalable resources grouped by category. Present the following report (omit any category with no scalable resources):

```
Scalable resources in the manifest:

COMPUTE
  [{N}] auto_scaling_group | {id} | env: {environment_scope}
          min_size: {val}  max_size: {val}  desired_capacity: {val}
          instance_type / machine_type: {val}
  [{N}] instance | {id} | env: {environment_scope}
          instance_type / machine_type: {val}
  [{N}] container_cluster | {id} | env: {environment_scope}
          node_count: {val}  (min: {val}, max: {val})  machine_type: {val}

DATABASES
  [{N}] relational | {id} | env: {environment_scope}
          instance_class: {val}  allocated_storage: {val} GB  multi_az: {true|false}
  [{N}] cache | {id} | env: {environment_scope}
          node_type: {val}  num_cache_nodes: {val}

NETWORKING
  [{N}] nat_gateways | env: {environment_scope}  count: {N}  (HA: {yes — one per AZ | no — shared})
```

Ask:

```
Which resources would you like to scale, and to what values?
You can reference items by number or by resource ID.

Example: "Scale [1] to min=2 max=6 desired=3 and [4] to db.t3.medium"
```

Once the user provides specific targets, continue to 8.3.

---

### 8.3 — Validate the Scaling Targets

For each requested change, apply these constraint checks in order:

| Resource | Property | Constraint | On violation |
|---|---|---|---|
| `relational` (any cloud) | `allocated_storage` | May only increase — cloud providers do not allow in-place storage shrink | **Block.** Explain. Offer create+migrate as alternative |
| `relational` (any cloud) | `multi_az` → `false` | Disabling Multi-AZ causes a brief failover and permanently reduces HA | **Hard warning.** Require the user to type `CONFIRM SINGLE-AZ` to proceed |
| `auto_scaling_group` | `desired_capacity` | Must satisfy `min_size ≤ desired_capacity ≤ max_size` after all changes applied | **Block** if out of range. Show the corrected valid range |
| `auto_scaling_group` | `min_size` | Must be ≤ `desired_capacity` and ≤ `max_size` | **Block** if violated |
| `nat_gateways` | count | Below one per AZ removes HA; reducing to 0 removes all outbound | **Warn** for HA reduction; **block** for count = 0 |
| `container_cluster` | `min_node_count` | Must be ≤ `node_count` and ≤ `max_node_count` | **Block** if violated |
| Any | `instance_type` / `instance_class` cross-family downgrade (e.g., `r5` → `t3`) | Significant performance regression risk | **Warn.** Require explicit user confirmation before including in checklist |
| `instance` (any cloud) | `machine_type` / `instance_type` change | Check whether the manifest config includes the provider flag that allows Terraform to stop the instance for an in-place update (GCP: `allow_stopping_for_update`; AWS: not required; Azure: not required). If the flag is absent from the manifest config, **automatically add it as a required co-change** in the scaling plan — do not ask the user, just include it. It is always safe and never needs user confirmation. | Required co-change — add to checklist automatically |

Do not proceed to the checklist until all hard blocks are resolved.

---

### 8.4 — Ansible Impact Check

Before building the checklist, determine whether the scaling changes affect resources that Ansible manages.

**Step 1 — Identify Ansible-sensitive changes.** Check whether any change in the confirmed scaling plan touches:
- `desired_capacity` (ASG) — changes the running instance count
- `node_count` / `min_node_count` / `max_node_count` (container cluster) — changes the running node count
- `instance_type` / `machine_type` (any resource) — changes the hardware spec of running hosts

**Step 2 — Check if an Ansible project exists.** Check whether `{{PATH_INFRA}}/deployment/ansible/` exists.

**Step 3 — Set flag.** If both conditions are true (Ansible-sensitive change AND Ansible project exists), set `{ANSIBLE_IMPACT}` = true and record which resource IDs are affected.

---

### 8.5 — Build and Confirm Scaling Checklist

Fill in the scaling checklist template at `.claude/skills/deployment-infra-terraform/templates/scaling-checklist.template.md`. Reference the example at `.claude/skills/deployment-infra-terraform/examples/scaling-checklist.example.md` for format.

Save the filled checklist to `./{{PATH_DOCS}}/5-deployment/scaling-checklist.md`.

Include conditional blocks as follows:
- If `{STALE_WARNING}` is true → include the stale manifest warning block.
- If `{ANSIBLE_IMPACT}` is true → include the Ansible impact warning block (see template). This warning must appear **at the top of the checklist**, immediately after the header metadata and before the Changes table.

Present the full checklist to the user and ask:

```
Review the scaling plan above. Type CONFIRM to proceed, or describe any changes.
```

Do not proceed until the user explicitly types CONFIRM. If the user modifies the plan, update the checklist and re-present it.

---

### 8.6 — Update the Manifest

Edit `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` directly — no extractor needed; all scaling changes are configuration-level field edits:

- For each resource being scaled: find its entry by `id` and update the relevant `config` fields.
- Update `generated_at` to the current ISO8601 timestamp.
- Append one entry per changed property to `extractor_notes`:
  `"[SCALE] {direction}: {resource_id}.{property} {old_value} → {new_value} ({YYYY-MM-DD})"`
- Do NOT update `sync_state` yet — that happens after the git commit in 8.8.

Validate the manifest is syntactically valid JSON after editing.

---

### 8.7 — Apply Changes via Coder

Launch `infra-terraform-coder` with:

> Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and apply the following scaling changes to the existing Terraform project at `{{PATH_INFRA}}/deployment/terraform/`:
>
> {LIST OF CHANGES: resource_id — property: old_value → new_value, one per line}
>
> Diff against the existing code. Only modify the files and resource blocks affected by these specific changes. Preserve all other resources exactly as they are. Do NOT regenerate the entire project.
> After applying changes, run a quality assurance pass on modified files only.
> Flag any change that Terraform will classify as requiring resource replacement (destroy + recreate) rather than an in-place update — these carry downtime risk and must be surfaced to the user.
> Report all files modified and a summary of changes applied.

If the coder flags replacement-required changes, report to the user:

```
⚠ The following changes will require Terraform to destroy and recreate resources:
  - {resource_id} ({resource_type}): {reason — e.g., "instance class change requires replacement on this provider"}

Run terraform plan before applying to review the full impact and confirm acceptable downtime.
```

---

### 8.8 — Commit and Sync

Commit the Terraform changes:

```
git -C infra add deployment/terraform/
git -C infra commit -m "scale({direction}): {brief summary} — {environment(s)}"
```

After the commit:
1. Run `git -C infra rev-parse HEAD` to get the new commit hash.
2. Read `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` and update:
   - `sync_state.last_synced_commit` → new commit hash
   - `sync_state.last_synced_at` → current ISO8601 timestamp
3. Save the manifest.

Report to the user:

```
Scaling applied.

- Direction  : {Upscale | Downscale | Mixed}
- Environment: {env(s)}
- Changes    : {N} properties updated across {N} resources
- Manifest   : ./{{PATH_DOCS}}/5-deployment/resource-manifest.json (updated)
- Checklist  : ./{{PATH_DOCS}}/5-deployment/scaling-checklist.md (audit trail)
- Terraform  : {{PATH_INFRA}}/deployment/terraform/ ({list of modified files})
- Commit     : {short hash} — {commit message}

{If replacement-required changes exist}:
⚠ Some changes require resource replacement. Run terraform plan before applying.
```

---

## File and Folder Conventions

| Artefact | Path |
| --- | --- |
| Default design document | `./{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md` |
| Resource manifest | `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` |
| Terraform project | `{{PATH_INFRA}}/deployment/terraform/` |
| Manifest template | `.claude/skills/deployment-infra-terraform/templates/resource-manifest.template.json` |
| Manifest example (AWS web app) | `.claude/skills/deployment-infra-terraform/examples/resource-manifest.aws-webapp.example.json` |
| Terraform .gitignore template | `.claude/skills/deployment-infra-terraform/templates/gitignore.template` |
| Backend templates | `.claude/skills/deployment-infra-terraform/templates/backends/` |
| Infrastructure design examples | `.claude/skills/design-infra-markdown/examples/` |
| Provider rules (optional) | `.claude/rules/cloud-providers/{provider}.md` |
| Scaling checklist template | `.claude/skills/deployment-infra-terraform/templates/scaling-checklist.template.md` |
| Scaling checklist example | `.claude/skills/deployment-infra-terraform/examples/scaling-checklist.example.md` |
| Scaling checklist (audit trail) | `./{{PATH_DOCS}}/5-deployment/scaling-checklist.md` |

---

## Guidelines

- **Never skip Phase 0** — always verify the Terraform CLI is available before proceeding.
- **Never skip Phase 1** — always confirm a valid design document exists before launching any agent.
- **Never skip ambiguity resolution** — even if the document appears complete, always run the analysis pass. Missing values in a Terraform project cause apply failures.
- **Validate the manifest before launching the coder** — a malformed or inconsistent manifest will cause the coder to produce broken Terraform code.
- **Never run `terraform apply`** — only generate and validate code. Applying is always the user's responsibility.
- **Multi-provider support** — the manifest and the coder both support multi-provider projects. If the design document references multiple cloud providers, ensure the extractor captures all providers and the coder implements each with its own provider block and best practices.
- **Provider rules** — rules are optional and additive. If `.claude/rules/cloud-providers/{provider}.md` does not exist or is empty for a given provider, proceed without it. Never block or warn the user about missing or empty rule files. Rules loaded in Phase 1.2 must be injected into every agent invocation prompt — extractor (both passes) and coder.
- **Existing Terraform projects** — if `{{PATH_INFRA}}/deployment/terraform/` already contains a Terraform project, instruct the coder to diff against the existing code and preserve unchanged resources. Never silently delete or overwrite existing resources.
- **Manifest is the source of truth** — `./{{PATH_DOCS}}/5-deployment/resource-manifest.json` must always reflect the current state of the Terraform project. Any change to `{{PATH_INFRA}}/deployment/terraform/` — however small — must be applied to the manifest first (Phase 7). Never update the Terraform code without updating the manifest.
- **Remote state is the default** — the coder always generates `backend.tf` for projects with a known cloud provider. Local state (no `backend.tf`) is used only when no provider is specified or when `backend.type` is explicitly `"local"` in the manifest. The extractor should capture any backend-related requirements from the design document in the `backend` field of the manifest; if the design doc does not mention a backend, the coder defaults to the provider-native remote store.
- **No secrets in code** — the coder must never hardcode credentials, tokens, or sensitive values. All sensitive inputs must use variables with `sensitive = true` or reference secret manager data sources.
- **Manifest sync_state** — `sync_state` must be written to the manifest after every successful git commit to `{{PATH_INFRA}}/`. The `last_synced_commit` field records which infra commit the manifest was last written against, scoped to the Terraform path only (not the entire infra repo). This is the basis for stale detection in Phases 7 and 8.
- **Freshness check is path-filtered** — the git log command that detects stale manifests filters to `{terraform_path}/` within the infra repo. Commits touching Ansible, pipelines, or other paths in `{{PATH_INFRA}}/` do not count as drift. This avoids false-positive staleness warnings for unrelated infra changes.
- **Scaling is configuration-only** — Phase 8 only modifies existing resource config fields (sizes, counts, types). Any change that adds, removes, or topologically alters a resource is a structural change and must go through Phase 7 instead. When in doubt, classify as structural.

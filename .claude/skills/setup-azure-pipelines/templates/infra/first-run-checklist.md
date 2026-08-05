# First-Run Setup Checklist — {project_name}

Complete these steps **once**, before triggering the first pipeline run.
Steps are ordered by dependency — do not skip ahead.

---

## 1. Prerequisites

### 1.1 Azure CLI and DevOps extension

```bash
az version                          # must succeed
az extension show --name azure-devops  # if missing: az extension add --name azure-devops
az login
az devops configure --defaults organization={org_url} project={project_name}
```

### 1.2 Personal Access Token

If you will run CLI commands that modify Azure DevOps (pipeline registration, variable groups):

1. Go to `{org_url}` → User Settings (top right) → Personal Access Tokens → New Token
2. Scopes required: **Code (read)**, **Build (read/write)**, **Environment (read/write)**, **Variable Groups (read/write)**
3. Copy the token and run: `az devops login --organization {org_url}` (paste the token when prompted)

---

## 2. Cloud Provider Credentials

> **This section is backend-specific. Only follow the block that matches your Terraform backend.**

<!-- ============================================================
     GCS BACKEND (Google Cloud Storage)
     CONFIGURE: include this block only if backend = gcs
     ============================================================ -->

### GCS Backend — GCP Service Account Key

The pipelines authenticate to GCP using a service account key JSON.
This key is stored as a **secret variable** (`GCP_SA_KEY_JSON`) in the `{terraform-secrets-group}` variable group.

**Step 0 — Enable bootstrap APIs**

Terraform uses the Cloud Resource Manager API to manage `google_project_service` resources.
It cannot enable this API itself — enable it manually before the first pipeline run:

```bash
gcloud services enable cloudresourcemanager.googleapis.com --project={gcp_project_id}
```

**Step 1 — Find or create the service account**

```bash
gcloud iam service-accounts list --project={gcp_project_id}
```

Look for a CI/CD or Terraform SA (e.g. `cicd@{gcp_project_id}.iam.gserviceaccount.com`).
If it does not exist, create it:

```bash
gcloud iam service-accounts create cicd \
  --display-name="CI/CD Pipeline" \
  --project={gcp_project_id}
```

**Step 2 — Grant required roles**

Minimum permissions:
```bash
# Terraform state bucket (read/write)
gcloud storage buckets add-iam-policy-binding gs://{tf_state_bucket} \
  --member="serviceAccount:cicd@{gcp_project_id}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Infrastructure management — create/manage compute, networking, artifact registry
gcloud projects add-iam-policy-binding {gcp_project_id} \
  --member="serviceAccount:cicd@{gcp_project_id}.iam.gserviceaccount.com" \
  --role="roles/editor"

# Enable/disable GCP APIs via google_project_service (roles/editor does NOT include this)
gcloud projects add-iam-policy-binding {gcp_project_id} \
  --member="serviceAccount:cicd@{gcp_project_id}.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageAdmin"

# Set IAM on Artifact Registry repositories if Terraform manages them
# (roles/editor does NOT include setIamPolicy on resources)
gcloud projects add-iam-policy-binding {gcp_project_id} \
  --member="serviceAccount:cicd@{gcp_project_id}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"
```

**Step 3 — Generate a key file**

```bash
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=cicd@{gcp_project_id}.iam.gserviceaccount.com \
  --project={gcp_project_id}
```

**Step 4 — Copy the key contents**

```bash
cat sa-key.json
```

Copy the entire JSON output (including the outer `{ }`). This is the value for `GCP_SA_KEY_JSON`.

**Step 5 — Delete the local key file**

```bash
rm sa-key.json
```

Never commit this file. Never leave it on disk after copying.

---
<!-- ============================================================
     S3 BACKEND (AWS)
     CONFIGURE: include this block only if backend = s3
     ============================================================ -->

### S3 Backend — AWS Credentials

```bash
# List IAM users or roles
aws iam list-users

# Create an access key for the CI/CD user
aws iam create-access-key --user-name {cicd_iam_user}
```

Copy `AccessKeyId` → `AWS_ACCESS_KEY_ID` in `{terraform-secrets-group}`
Copy `SecretAccessKey` → `AWS_SECRET_ACCESS_KEY` in `{terraform-secrets-group}`

---
<!-- ============================================================
     azurerm BACKEND (Azure)
     CONFIGURE: include this block only if backend = azurerm
     ============================================================ -->

### azurerm Backend — Azure Service Principal

```bash
az ad sp create-for-rbac \
  --name "{project_name}-cicd" \
  --role Contributor \
  --scopes /subscriptions/{subscription_id}
```

Copy the output values to `{terraform-secrets-group}`:
- `appId`       → `ARM_CLIENT_ID`
- `password`    → `ARM_CLIENT_SECRET`
- `tenant`      → `ARM_TENANT_ID`
- subscription  → `ARM_SUBSCRIPTION_ID` (from `az account show --query id`)

---

## 3. Variable Groups

### 3.1 {terraform-secrets-group}

Create the group, then add secrets via the Azure DevOps UI.

```bash
az pipelines variable-group create \
  --name "{terraform-secrets-group}" \
  --authorize true
```

Then go to **Pipelines → Library → {terraform-secrets-group} → Variables** and add:

| Variable | Value | Secret |
|---|---|---|
| `{backend_credential_var}` | Content from Step 2 above | Yes |
| `TF_VAR_SSH_PUBLIC_KEY_DEV` | Contents of your DEV SSH public key file (`cat ~/.ssh/id_ed25519_dev.pub`) | Yes |
| `TF_VAR_SSH_PUBLIC_KEY_PROD` | Contents of your PROD SSH public key file (`cat ~/.ssh/id_ed25519_prod.pub`) | Yes |
| *(add one row per `sensitive = true` variable in variables.tf)* | | |

### 3.2 Common

```bash
az pipelines variable-group create \
  --name "Common" \
  --authorize true \
  --variables VAR_GROUP_DEV_ID="TBD" VAR_GROUP_PROD_ID="TBD"
```

Update `VAR_GROUP_DEV_ID` and `VAR_GROUP_PROD_ID` after creating the Secrets groups below
(use the numeric group ID from the URL: `...variableGroupId=<ID>`).

### 3.3 Secrets-dev

```bash
az pipelines variable-group create \
  --name "Secrets-dev" \
  --authorize true \
  --variables SSH_SECURE_FILE_DEV="id_ed25519_dev" LAST_GOOD_BACKEND_TAG="" LAST_GOOD_FRONTEND_TAG=""
```

Then add via the UI:

| Variable | Value | Secret |
|---|---|---|
| `{backend_credential_var}` | Same value as in `{terraform-secrets-group}` | Yes |

### 3.4 Secrets-prod

```bash
az pipelines variable-group create \
  --name "Secrets-prod" \
  --authorize true \
  --variables SSH_SECURE_FILE_DEV="id_ed25519_dev" SSH_SECURE_FILE_PROD="id_ed25519_prod" LAST_GOOD_BACKEND_TAG="" LAST_GOOD_FRONTEND_TAG=""
```

Then add via the UI:

| Variable | Value | Secret |
|---|---|---|
| `{backend_credential_var}` | Same value as in `{terraform-secrets-group}` | Yes |

---

## 4. SSH Keys — Secure Files

Go to **Pipelines → Library → Secure Files → + Secure File** and upload:

| File | Used by |
|---|---|
| `id_ed25519_dev` | Jump server, DEV VMs, provision pipeline |
| `id_ed25519_prod` | PROD VMs |

These are the **private** key files (not `.pub`). Keep them local only — upload directly, never commit to git.

---

## 5. Environments and Approval Gates

Environments must be created **before** the first pipeline run that references them.

Go to **Pipelines → Environments → New environment** (Resource: None) and create:

| Environment | Used by | Approval gate? |
|---|---|---|
| `{infra-environment}-shared` | terraform-shared-pipeline (apply stage) | **Yes** |
| `{infra-environment}-{env}` | terraform-{env}-pipeline (apply stage) — one per environment | **Yes** |
| `AppMod-dev` | provision-pipeline (dev stage), app pipelines | Optional |
| `AppMod-prod` | provision-pipeline (prod stage), app pipelines | **Yes** |

To add an approval gate to an environment:
1. Open the environment → three-dot menu → **Approvals and checks** → **+** → **Approvals**
2. Add approvers → **Create**

---

## 6. Register the Pipelines

### Infra pipelines (infra repo)

```bash
# Terraform — shared module (always first)
az pipelines create \
  --name "infra - terraform - shared" \
  --yml-path "setup/azure/pipelines/repos/infra/Pipelines/terraform-shared-pipeline.yaml" \
  --repository {infra_repo} \
  --branch main \
  --folder-path "\infra\terraform"

# Terraform — one pipeline per environment (repeat for each env)
# CONFIGURE: replace {env} with dev, staging, prod, etc.
az pipelines create \
  --name "infra - terraform - {env}" \
  --yml-path "setup/azure/pipelines/repos/infra/Pipelines/terraform-{env}-pipeline.yaml" \
  --repository {infra_repo} \
  --branch main \
  --folder-path "\infra\terraform"

# Provision pipeline
az pipelines create \
  --name "infra - provision" \
  --yml-path "setup/azure/pipelines/repos/infra/Pipelines/provision-pipeline.yaml" \
  --repository {infra_repo} \
  --branch main \
  --folder-path "\infra"
```

### App pipelines (one per app repository)

```bash
# CONFIGURE: repeat for each repository
az pipelines create \
  --name "{repo-name}" \
  --yml-path "Pipelines/build-pipeline.yaml" \
  --repository {repo-name} \
  --branch main \
  --folder-path "\{group}"
```

### Grant the infra repo template access

All app pipelines read templates from the infra repo. Grant read access:

**Project Settings → Repositories → {infra_repo} → Security → {project_name} Build Service → Reader**

### Authorise variable groups

After the first pipeline run, Azure DevOps may prompt for variable group authorisation. Pre-authorise to avoid interruptions:

**Pipelines → Library → {group} → Pipeline permissions → + → add each pipeline**

---

## 7. Update VAR_GROUP IDs in Common

After creating `Secrets-dev` and `Secrets-prod`:

1. Go to **Pipelines → Library → Secrets-dev** → check the URL for the numeric ID
2. Go to **Pipelines → Library → Common → Variables**
3. Set `VAR_GROUP_DEV_ID` = numeric ID of `Secrets-dev`
4. Set `VAR_GROUP_PROD_ID` = numeric ID of `Secrets-prod`

---

## 8. First Run Order

Run in this exact order — each step depends on the previous one completing successfully.

1. **`infra - terraform - shared`** → Plan runs automatically → review the plan → approve Apply in Azure DevOps
2. **`infra - terraform - {env}`** (e.g. `infra - terraform - dev`) → Plan runs automatically → review the plan → approve Apply. Repeat for each environment in order (dev before prod).
3. **`infra - provision`** → run manually, `targetEnv = dev` → wait for completion
4. **App pipelines** → trigger ms/web pipelines → apps deploy to DEV
5. Repeat steps 2–4 for remaining environments (staging, prod) when ready

> **Important:** Always apply `shared` before any environment module. Environment modules read shared outputs via `terraform_remote_state` — applying them without shared state will fail with a remote state lookup error.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `terraform output -json` returns empty in Ansible | Backend credential not passed to `ansible-playbook` step | Add `BACKEND_CREDENTIAL_VAR: $(BACKEND_CREDENTIAL_VAR)` to the step's `env:` block |
| App health check times out after destroy+apply | MongoDB/DB not provisioned on new VM | Run `infra - provision` before triggering app pipelines |
| `Access denied` updating variable group | Build service lacks Administrator role | Library → group → Security → add Build Service → Administrator |
| Pipeline can't read infra templates | Missing Read access on infra repo | Project Settings → Repositories → infra → Security → Build Service → Reader |

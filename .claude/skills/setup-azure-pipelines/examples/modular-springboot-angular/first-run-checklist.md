# First-Run Setup Checklist — AppMod

Complete these steps **once**, before triggering the first pipeline run.
Steps are ordered by dependency — do not skip ahead.

---

## 1. Prerequisites

### 1.1 Azure CLI and DevOps extension

```bash
az version                          # must succeed
az extension show --name azure-devops  # if missing: az extension add --name azure-devops
az login
az devops configure --defaults organization=https://dev.azure.com/LC-Production project=AppMod
```

### 1.2 Personal Access Token

If you will run CLI commands that modify Azure DevOps (pipeline registration, variable groups):

1. Go to `https://dev.azure.com/LC-Production` → User Settings (top right) → Personal Access Tokens → New Token
2. Scopes required: **Code (read)**, **Build (read/write)**, **Environment (read/write)**, **Variable Groups (read/write)**
3. Copy the token and run: `az devops login --organization https://dev.azure.com/LC-Production` (paste the token when prompted)

---

## 2. Cloud Provider Credentials

### GCS Backend — GCP Service Account Key

The pipelines authenticate to GCP using a service account key JSON.
This key is stored as a **secret variable** (`GCP_SA_KEY_JSON`) in the `Secrets-infra` variable group.

**Step 0 — Enable bootstrap APIs**

Terraform uses the Cloud Resource Manager API to manage `google_project_service` resources.
It cannot enable this API itself — enable it manually before the first pipeline run:

```bash
gcloud services enable cloudresourcemanager.googleapis.com --project=ama-proj-01
```

**Step 1 — Find or create the service account**

```bash
gcloud iam service-accounts list --project=ama-proj-01
```

Look for a CI/CD or Terraform SA (e.g. `cicd-sa@ama-proj-01.iam.gserviceaccount.com`).
If it does not exist, create it:

```bash
gcloud iam service-accounts create cicd \
  --display-name="CI/CD Pipeline" \
  --project=ama-proj-01
```

**Step 2 — Grant required roles**

```bash
# Terraform state bucket (read/write)
gcloud storage buckets add-iam-policy-binding gs://ama-proj-01-tfstate \
  --member="serviceAccount:cicd-sa@ama-proj-01.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Infrastructure management (create/manage compute, networking, artifact registry)
gcloud projects add-iam-policy-binding ama-proj-01 \
  --member="serviceAccount:cicd-sa@ama-proj-01.iam.gserviceaccount.com" \
  --role="roles/editor"

# Enable/disable GCP APIs (roles/editor does NOT include this)
gcloud projects add-iam-policy-binding ama-proj-01 \
  --member="serviceAccount:cicd-sa@ama-proj-01.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageAdmin"

# Set IAM on Artifact Registry repositories (roles/editor does NOT include setIamPolicy)
gcloud projects add-iam-policy-binding ama-proj-01 \
  --member="serviceAccount:cicd-sa@ama-proj-01.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"
```

**Step 3 — Generate a key file**

```bash
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=cicd-sa@ama-proj-01.iam.gserviceaccount.com \
  --project=ama-proj-01
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

## 3. Variable Groups

### 3.1 Secrets-infra

Create the group, then add secrets via the Azure DevOps UI.

```bash
az pipelines variable-group create \
  --name "Secrets-infra" \
  --authorize true
```

Then go to **Pipelines → Library → Secrets-infra → Variables** and add:

| Variable | Value | Secret |
|---|---|---|
| `GCP_SA_KEY_JSON` | Full JSON content from Step 2 above | Yes |
| `TF_VAR_SSH_PUBLIC_KEY_DEV` | Contents of your DEV SSH public key file (`cat ~/.ssh/id_ed25519_dev.pub`) | Yes |
| `TF_VAR_SSH_PUBLIC_KEY_PROD` | Contents of your PROD SSH public key file (`cat ~/.ssh/id_ed25519_prod.pub`) | Yes |
| `TF_VAR_CICD_SA_EMAIL` | `cicd-sa@ama-proj-01.iam.gserviceaccount.com` | No |

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
| `GCP_SA_KEY_JSON` | Same value as in `Secrets-infra` | Yes |
| `Registry.User` | Docker registry username | Yes |
| `Registry.Password` | Docker registry password | Yes |

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
| `GCP_SA_KEY_JSON` | Same value as in `Secrets-infra` | Yes |
| `Registry.User` | Docker registry username | Yes |
| `Registry.Password` | Docker registry password | Yes |

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
| `AppMod-infra-shared` | terraform-shared-pipeline (apply stage) | **Yes** |
| `AppMod-infra-dev` | terraform-dev-pipeline (apply stage) | **Yes** |
| `AppMod-infra-prod` | terraform-prod-pipeline (apply stage) | **Yes** |
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
  --repository infra \
  --branch main \
  --folder-path "\infra\terraform"

# Terraform — dev module
az pipelines create \
  --name "infra - terraform - dev" \
  --yml-path "setup/azure/pipelines/repos/infra/Pipelines/terraform-dev-pipeline.yaml" \
  --repository infra \
  --branch main \
  --folder-path "\infra\terraform"

# Terraform — prod module
az pipelines create \
  --name "infra - terraform - prod" \
  --yml-path "setup/azure/pipelines/repos/infra/Pipelines/terraform-prod-pipeline.yaml" \
  --repository infra \
  --branch main \
  --folder-path "\infra\terraform"

# Provision pipeline
az pipelines create \
  --name "infra - provision" \
  --yml-path "setup/azure/pipelines/repos/infra/Pipelines/provision-pipeline.yaml" \
  --repository infra \
  --branch main \
  --folder-path "\infra"
```

### App pipelines

```bash
# ms-todo-list
az pipelines create \
  --name "ms-todo-list" \
  --yml-path "Pipelines/build-pipeline.yaml" \
  --repository ms-todo-list \
  --branch main \
  --folder-path "\ms"

# web-todo-list
az pipelines create \
  --name "web-todo-list" \
  --yml-path "Pipelines/build-pipeline.yaml" \
  --repository web-todo-list \
  --branch main \
  --folder-path "\web"
```

### Grant the infra repo template access

All app pipelines read templates from the infra repo. Grant read access:

**Project Settings → Repositories → infra → Security → AppMod Build Service → Reader**

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
2. **`infra - terraform - dev`** → Plan runs automatically → review the plan → approve Apply
3. **`infra - provision`** → run manually, `targetEnv = dev` → wait for completion
4. **`web-todo-list`** (frontend pipeline) → must run first to push a frontend image and set `LAST_GOOD_FRONTEND_TAG`
5. **`ms-todo-list`** (backend pipeline) → runs after frontend; deploys both containers to the VM
6. **`infra - terraform - prod`** → Plan runs automatically → review the plan → approve Apply
7. Repeat steps 3–5 for `targetEnv = prod` when ready

> **Important:** Always apply `shared` before any environment module. Environment modules read shared
> outputs via `terraform_remote_state` — applying without shared state will fail with a remote state
> lookup error.

> **Important:** Always run the frontend pipeline before the backend pipeline on a fresh environment.
> The backend deploy role pulls both images — if `LAST_GOOD_FRONTEND_TAG` points to an image that
> doesn't exist in the registry yet, the deploy will fail with a 404.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `terraform output -json` returns empty in Ansible | `GCP_SA_KEY_JSON` not passed to `ansible-playbook` step | Verify `GOOGLE_CREDENTIALS: $(GCP_SA_KEY_JSON)` is in the step's `env:` block |
| App health check times out after destroy+apply | MongoDB not provisioned on new VM | Run `infra - provision` before triggering app pipelines |
| `Access denied` updating variable group | Build service lacks Administrator role | Library → group → Security → add Build Service → Administrator |
| Pipeline can't read infra templates | Missing Read access on infra repo | Project Settings → Repositories → infra → Security → Build Service → Reader |
| Ansible `terraform output` command not found | Terraform not in PATH on pipeline agent | The provision pipeline re-runs `terraform init` before Ansible — verify the init step succeeded |

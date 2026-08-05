# Variable Groups — AppMod (modular template example)

## Common

Loaded at the pipeline level in `main-pipeline.yaml`. Non-secret shared values.

| Variable | Value | Secret |
|---|---|---|
| (no variables required here — all non-secrets are in global.yaml) | | |

> Create with: `az pipelines variable-group create --name Common --authorize true --variables placeholder=true`

---

## Secrets-dev

Secrets for the DEV environment. Loaded at the stage level.

| Variable | Value | Secret |
|---|---|---|
| Registry.User | GCP service account email or ACR username | yes |
| Registry.Password | GCP JSON key (base64) or ACR password | yes |
| SSH.SecureFileName | Name of the SSH key file uploaded to Library → Secure Files | no |

> Create with: `az pipelines variable-group create --name Secrets-dev --authorize true --variables SSH.SecureFileName="appmod-dev-deploy.pem"`
>
> Then add secrets via the Azure DevOps UI (Pipelines → Library → Secrets-dev → Variables).

---

## Secrets-prod

Secrets for the PROD environment.

| Variable | Value | Secret |
|---|---|---|
| Registry.User | GCP service account email or ACR username | yes |
| Registry.Password | GCP JSON key (base64) or ACR password | yes |
| SSH.SecureFileName | Name of the SSH key file uploaded to Library → Secure Files | no |

> Create with: `az pipelines variable-group create --name Secrets-prod --authorize true --variables SSH.SecureFileName="appmod-prod-deploy.pem"`
>
> Then add secrets via the Azure DevOps UI.

---

## Secure Files (Library → Secure Files)

Upload SSH private key files here. The filename must match the value of `SSH.SecureFileName` in each `Secrets-{env}` group.

| File | Used by |
|---|---|
| `appmod-dev-deploy.pem` | All pipelines deploying to DEV |
| `appmod-prod-deploy.pem` | All pipelines deploying to PROD |

---

## Notes

- Variable groups must be **authorised** for the pipelines that use them. Use `--authorize true` when creating, or go to **Pipelines → Library → {group} → Pipeline permissions**.
- The `infra` repo's pipeline must be granted **Read** on the template repository: **Project Settings → Repositories → infra → Security → AppMod Build Service (LC-Production) → Reader**.

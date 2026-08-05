# Service Connections — AppMod (modular template example)

## Container Registry — Google Artifact Registry (GCR)

The pipelines use raw `docker login` with credentials from the `Secrets-{env}` variable group rather than an Azure DevOps Docker service connection. This avoids credential duplication and keeps the service connection list clean.

If you prefer the Azure DevOps native Docker service connection:

Create in: **Project Settings → Service Connections → New service connection → Docker Registry**

| Field | Value |
|---|---|
| Connection name | `appmod-registry` |
| Registry type | Others |
| Docker Registry | `https://europe-southwest1-docker.pkg.dev` |
| Docker ID | GCP service account email |
| Docker Password | GCP service account JSON key |

Then replace the `docker login` steps in the sub-pipelines with:
```yaml
- task: Docker@2
  inputs:
    command: buildAndPush
    containerRegistry: appmod-registry
    repository: ama-proj-01/docker/$(App.Name)
    tags: |
      $(Build.BuildId)
      $(Environment.Name)
```

---

## SSH — Jump Server

The pipelines use `DownloadSecureFile` + raw `ansible-playbook` with `--private-key` rather than an SSH service connection. This is required because Ansible needs the raw key file path, not an Azure DevOps SSH connection handle.

For connectivity verification only (optional):

Create in: **Project Settings → Service Connections → New service connection → SSH**

| Field | Value |
|---|---|
| Connection name | `appmod-jump-server` |
| Host name | `jumpserver.appmod.internal` |
| Port | 22 |
| Username | `azureuser` |
| Private key | paste the DEV or PROD deploy key content |

This connection is not referenced by any pipeline YAML — it is only for manual connectivity tests from the Azure DevOps UI.

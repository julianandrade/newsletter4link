# Example — Modular Pipeline: Spring Boot + Angular (AppMod)

Complete generated output for the `setup-azure-pipelines` skill in **modular template** mode.

## Scenario

| Field | Value |
|---|---|
| Organisation | `https://dev.azure.com/LC-Production` |
| Project | `AppMod` |
| Template repo | `infra` (branch: `main`) |
| Repositories | `ms-todo-list` (maven + ms), `web-todo-list` (angular + web) |
| Environments | `dev`, `prod` |
| Registry | `europe-southwest1-docker.pkg.dev/ama-proj-01/docker` (GCR) |
| Agent pool | `appmod-agents` (self-hosted Linux) |
| Ansible | pre-installed on agent |
| PR validation | yes |

## File map

```
templates/                              → commit to the infra repo under setup/azure/pipelines/templates/
  main-pipeline.yaml
  variables/
    global.yaml
    global-dev.yaml
    global-prod.yaml
    pools/
      global-appmod-agents.yaml
  sub/
    sub-pipeline-maven-ms.yaml
    sub-pipeline-angular-web.yaml
    sub-pipeline-maven-ms-verify.yaml

repos/ms-todo-list/Pipelines/          → commit to the ms-todo-list repo under Pipelines/
repos/web-todo-list/Pipelines/         → commit to the web-todo-list repo under Pipelines/
```

## Azure DevOps pipeline folders

| Pipeline | Folder |
|---|---|
| ms-todo-list | `\ms` |
| ms-todo-list (validation) | `\ms\validation` |
| web-todo-list | `\web` |
| web-todo-list (validation) | `\web\validation` |

## Setup checklist

- [ ] Commit `templates/` to `infra` repo under `setup/azure/pipelines/templates/`
- [ ] Grant `AppMod Build Service (LC-Production)` → Read on the `infra` repo
- [ ] Commit `repos/ms-todo-list/Pipelines/` to the `ms-todo-list` repo
- [ ] Commit `repos/web-todo-list/Pipelines/` to the `web-todo-list` repo
- [ ] Create variable groups: `Common`, `Secrets-dev`, `Secrets-prod`
- [ ] Upload SSH deploy key to Azure DevOps Library → Secure Files
- [ ] Register pipelines in Azure DevOps (see `variable-groups.md`)
- [ ] Configure approval gate on `prod` environment: Pipelines → Environments → prod → Approvals

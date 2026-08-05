# Variable Groups

<!-- CONFIGURE: Remove the {backend_credential_var} row if Terraform is not used. -->

## {project_name}-shared

Shared across all environments and all pipelines.

| Variable | Value | Secret |
|---|---|---|
| registryUrl | {registry_url} | no |
| jumpServerAddress | {jump_server_address} | no |
| ansiblePlaybookPath | {playbook_path} | no |

## {project_name}-{env} (one per environment)

| Variable | Value | Secret |
|---|---|---|
| sshSecureFileName | <Secure File name in Library> | no |
| variableGroupId_{env} | <variable group ID — set after group creation> | no |
| last_good_{env}_tag | (starts empty — updated by pipeline on each successful deploy) | no |
| {backend_credential_var} | Cloud provider credential for terraform init | yes |

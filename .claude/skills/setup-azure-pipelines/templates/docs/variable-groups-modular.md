# Variable Groups

<!-- CONFIGURE: Remove the Secrets-{infra-secrets-group} section if Terraform is not used. -->

## Common

Shared across all environments and all pipelines.

| Variable | Value | Secret |
|---|---|---|
| Registry.Location | {registry_url} | no |
| Jump.Server.Address | {jump_server_address} | no |
| Jump.Server.User | {ssh_user} | no |

## Secrets-{env} (one per environment)

| Variable | Value | Secret |
|---|---|---|
| Registry.User | <registry username> | yes |
| Registry.Password | <registry password> | yes |
| SSH.SecureFileName.{env} | <Secure File name in Library> | no |
| {Service}.Keycloak.Auth.Secret | <keycloak client secret> | yes |

## Secrets-{infra-secrets-group} (Terraform pipelines only)

| Variable | Value | Secret | Notes |
|---|---|---|---|
| {backend_credential_var} | Cloud provider credential | yes | See first-run-checklist.md § 2 |
| TF_VAR_SSH_PUBLIC_KEY_DEV | Contents of DEV SSH public key file | yes | |
| TF_VAR_SSH_PUBLIC_KEY_PROD | Contents of PROD SSH public key file | yes | |
| *(one row per additional `sensitive = true` variable in variables.tf)* | | | |

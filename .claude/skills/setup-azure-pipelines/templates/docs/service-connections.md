# Service Connections

## Container Registry — {registry_type}

Create in: Project Settings → Service Connections → New service connection → {registry_type}

| Field | Value |
|---|---|
| Connection name | {project_name}-registry |
| Registry URL | {registry_url} |
| Username / credentials | <your registry credentials> |

## SSH — Jump Server

Create in: Project Settings → Service Connections → New service connection → SSH

| Field | Value |
|---|---|
| Connection name | {project_name}-jump-server |
| Host name | {jump_server_address} |
| Port | 22 |
| Username | <SSH user> |

Note: The Ansible deployment steps use the raw SSH key via DownloadSecureFile, not this connection directly.
This SSH service connection can be used for connectivity verification.

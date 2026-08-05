# {{tx-id-display}} worktree Docker stack

Isolated Docker stack for the {{tx-id-display}} worktree(s). Coexists with the main workspace stack and with any other worktree stack — different container names, ports, and network.

## Layout

| File | Purpose |
|---|---|
| `docker-compose.override.yml` | Merge layer on top of each project's `setup/local/docker-compose.yml` (renames containers, remaps ports, replaces shared net, pins absolute build contexts). |
| `.env` | Project name, image tag, host port overrides, Mongo creds. |
{{frontend-config-row}}

## Host port map

| Service | Host port | Container port |
|---|---|---|
{{port-map-rows}}

Mongo + Redis + Kafka broker are reachable only from inside the `{{tx-id-lower}}_shared` network — no host port for the DB itself.

## Usage (run **inside WSL**)

> Per project rule, all Docker commands run in WSL. Never from PowerShell.

From this directory (`{{WORKTREES_PATH}}/_compose/{{tx-id-display}}`):

```bash
# Build + start everything (including dev-only GUIs)
docker compose -p {{tx-id-lower}} \
  {{compose-args}} \
  -f ./docker-compose.override.yml \
  --env-file ./.env \
  --profile only_if_not_cicd \
  up -d --build

# Tail logs
docker compose -p {{tx-id-lower}} logs -f {{primary-services}}

# Stop + remove containers, keep volumes
docker compose -p {{tx-id-lower}} down

# Stop + remove containers AND volumes (full reset)
docker compose -p {{tx-id-lower}} down -v
```

The `--profile only_if_not_cicd` flag enables the dev GUIs (Mongo Express, RedisInsight, Kafka UI). Omit to skip them.

## Endpoints

{{endpoint-list}}

## Notes

- The `{{tx-id-lower}}_shared` network is created automatically by Compose (project-local; no need to pre-create with `docker network create`).
- The frontend volume mount `../../:/app` resolves relative to the **frontend** compose file directory — i.e. it mounts the {{tx-id-display}} frontend worktree root into the container. Hot reload works inside the worktree.
{{frontend-config-note}}
- If you also run the main workspace stack at the same time, no port or container name collides — both can coexist.
- All `build.context` values are pinned to absolute WSL paths in the override (multi-file merge confuses bake's relative-path resolution).

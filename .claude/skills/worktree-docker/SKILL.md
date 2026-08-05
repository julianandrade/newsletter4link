---
name: worktree-docker
description: Manage an isolated Docker Compose stack for a transaction's git worktree(s). Default action generates the override files; flags add `--up` (start), `--stop` (down keep volumes), `--destroy` (down -v + remove generated files), `--status` (ps). Use when invoked by `/worktree-docker` or when asked to "create/start/stop/delete a docker for the worktree of <TX>".
---

# Worktree Docker Skill

## Purpose

For a given transaction/NTI ID (e.g. `TX-003`, `NTI-002`), manage an isolated Docker Compose stack under `{{WORKTREES_PATH}}/_compose/<TX>/` that runs the TX's worktree(s) for one or more projects in parallel with the main workspace stack (and with other worktree stacks).

The skill **does not** modify the project worktrees or the per-project `setup/local/docker-compose.yml` files. It only writes new files under `{{WORKTREES_PATH}}/_compose/<TX>/` that merge on top of the existing per-project compose files via `docker compose -f a -f b -f c`.

## Modes

Exactly one mode flag may be set per invocation. Without any mode flag, the default is **generate**.

| Mode | Flag | What it does |
|------|------|--------------|
| generate (default) | (none) | Write/refresh the override files and validate the merge. Does NOT start the stack. |
| up | `--up` | Generate (if missing) + start the stack (`up -d --build --force-recreate`). |
| stop | `--stop` / `--down` | Stop and remove containers; keep volumes (`down`). |
| destroy | `--destroy` / `--down-v` | Stop + remove containers AND volumes (`down -v`), and delete the `_compose/<TX>/` folder. Asks for confirmation unless `--force`. |
| status | `--status` / `--ps` | Print `docker compose ps` for the project. No side effects. |
| logs | `--logs [services...]` | Tail logs for the project (or only the listed services). No side effects. |

## Inputs

- `$ARGUMENTS` from `/worktree-docker`:
  - Positional: transaction ID matching `^(TX|NTI)-` (required, single value).
  - Mode flag (zero or one — see table above). If two are present, **stop** and report.
  - `--port-offset <N>` (optional, integer, default = computed deterministically from TX ID). Only honoured in generate / up modes.
  - `--project <name>[,<name>...]` (optional, repeatable). Default = every project whose worktree exists at `{{WORKTREES_PATH}}/<project>/<TX>/`. Only honoured in generate / up modes.
  - `--force` (optional): in generate / up modes, overwrite an existing `{{WORKTREES_PATH}}/_compose/<TX>/` folder. In destroy mode, skip the confirmation prompt.

- `env` object of `.claude/settings.json` — resolves `WORKTREES_PATH` and `PATH_DOCS`.

## Outputs

Under `{{WORKTREES_PATH}}/_compose/<TX>/`:

1. `docker-compose.override.yml` — override layer (renames containers, remaps host ports, swaps shared network, pins build contexts to absolute WSL paths).
2. `.env` — project name (`<tx-id-lowercase>`), image tag, offset host ports, Mongo defaults.
3. `frontend-config.json` — optional, only when a frontend worktree exists and uses a runtime `Configs/config.json` with an `API_BASE_URL` pointing at the BFF. Bind-mounted over the frontend container's config so `apiFetch` targets the worktree-scoped backend host port.
4. `README.md` — port map, WSL run commands, endpoint URLs.

After writing, validates the merge via `docker compose … config --quiet` in WSL.

## Procedure

### 1. Parse parameters

From `$ARGUMENTS`:
- Capture the single positional TX ID. Must match `^(TX|NTI)-`. If missing/invalid → stop, report.
- Detect mode flag (`--up` / `--stop` / `--down` / `--destroy` / `--down-v` / `--status` / `--ps` / `--logs`). At most one. Default = generate.
- Parse `--port-offset`, `--project`, `--force`.

### 1a. Mode dispatch

After parsing, branch on mode:

- **generate** → run steps 2–10 (the original flow).
- **up** → run steps 2–9; then start the stack (see §11).
- **stop** → skip steps 2–9; run `down` without `-v` (see §12).
- **destroy** → skip steps 2–9; run `down -v` and delete `{{WORKTREES_PATH}}/_compose/<TX>/` (see §13).
- **status** → skip steps 2–9; run `ps` for the project (see §14).
- **logs** → skip steps 2–9; tail logs for the project / listed services (see §14).

For stop / destroy / status / logs, the only required input is the TX ID. The skill resolves the project name as `<tx-id-lower>` (matching what generate / up wrote into `.env`). If `_compose/<TX>/` does not exist and the mode is stop / status / logs, attempt the operation anyway via `-p <tx-id-lower>` — Compose can act on running containers without the source files. For destroy, only delete the folder if it exists.

### 2. Resolve variables

Read `env` object of `.claude/settings.json`. Capture `WORKTREES_PATH` (default `.worktrees`) and `PATH_DOCS` (default `.claude/docs`).

### 3. Discover applicable projects

- List the immediate subdirectories of `{{PATH_DOCS}}/projects/`. Each is one project name.
- For each project name, the worktree path is `<workspace-root>/{{WORKTREES_PATH}}/<project>/<TX>`. Keep the project only if that path exists.
- If `--project` was supplied, intersect with the discovered set. If a requested name does not exist on disk → stop, report.
- If the resulting set is empty → stop, report (no worktree to dockerize).

### 4. Classify each project (frontend / backend)

Detect by reading the project folder under `{{PATH_DOCS}}/projects/<project>/` for a `type:` declaration (`frontend` or `backend`). Fallback: inspect the worktree for `src/Api/Dockerfile` (→ backend) or `src/App/Dockerfile_local` (→ frontend). Multiple frontends or backends in scope are allowed but each is treated as its own stack contribution.

### 5. Parse each project's local compose file

For each in-scope project, read `<worktree>/setup/local/docker-compose.yml`. Extract:

- Every service name and its declared `container_name` (if any).
- Every service's host port mapping (literal or `${VAR:-default}` form).
- Whether the service references the `myapp_shared` external network.
- The `build.context` and `build.dockerfile` (so the override can pin both to absolute WSL paths).

If a service has **no** `container_name` declared, no rename override is needed (Compose will project-scope it automatically).

### 6. Compute port offset

- If `--port-offset` was supplied, use it verbatim. Validate: integer in `[100, 9000]`, multiple of 100 (so 10000 + offset stays under 19999 for the backend API).
- Otherwise, compute deterministically: parse the trailing digits of the TX ID (e.g. `TX-003` → 3, `NTI-002` → 2). Offset = `100 + (digits * 100)`. So `TX-003` → 400, `NTI-002` → 300. (TX-001 → 200, TX-002 → 300 — same offset as NTI-002 is possible; record the chosen offset in `.env` so the user can edit before invoking the stack.)
- The offset is added to every default host port from the parsed compose files. Additionally, fixed-literal host ports (Kafka 9092, JMX 9101, Schema Registry 8081) are remapped to `<base> + offset / 100 * 100`.

### 7. Detect frontend runtime config

For each frontend project in scope, search the worktree for `src/*/Configs/config.json`. If present and it contains an `API_BASE_URL` value targeting `http://localhost:<port>`, generate `frontend-config.json` with `API_BASE_URL` set to `http://localhost:<API_PORT-with-offset>`. The override compose bind-mounts this file over the container path read-only.

If no such config exists, skip `frontend-config.json` and emit a note in the README.

### 8. Generate output files

Create `{{WORKTREES_PATH}}/_compose/<TX>/` (mkdir -p). If the folder is non-empty and `--force` was not passed → stop, report.

Render templates from `.claude/skills/worktree-docker/templates/` substituting variables:

- `{{tx-id}}` (e.g. `TX-003`)
- `{{tx-id-lower}}` (e.g. `tx003`) — used for project name, container prefix, image tag, network name
- `{{tx-id-display}}` (e.g. `TX-003`) — used in README/title
- `{{port-offset}}` (e.g. `100`)
- `{{api-port}}` / `{{app-port}}` / `{{mongo-gui-port}}` / `{{redis-gui-port}}` / `{{kafka-gui-port}}` / `{{kafka-broker-port}}` / `{{schema-registry-port}}`
- `{{services-block}}` — generated YAML block of per-service overrides (container_name + ports + build context pin) for every service parsed in step 5
- `{{frontend-volumes}}` — bind-mount line for `frontend-config.json` when applicable, empty otherwise
- `{{has-frontend}}` (boolean) — gates the README's frontend section and the frontend-config.json write
- `{{worktree-paths}}` — absolute WSL paths for each in-scope worktree
- `{{compose-args}}` — the `-f` argument list (relative paths from `_compose/<TX>/`)

### 9. Validate

Run in WSL from `{{WORKTREES_PATH}}/_compose/<TX>/`:

```bash
docker compose -p <tx-id-lower> \
  <compose-args> \
  --env-file ./.env \
  config --quiet
```

If the command exits non-zero, print the stderr and stop. Do not delete the generated files — the user may want to inspect them.

### 10. Report

Print to the user:

- Output folder absolute path.
- Per-service container name + host port table.
- The exact WSL `docker compose … up -d --build` command to start the stack.
- Reminder that Docker commands must run inside WSL (per project rule).
- Cleanup command: `docker compose -p <tx-id-lower> down [-v]`.

### 11. Start the stack (`--up`)

After generate finishes (steps 2–9 pass), run **in WSL** from `{{WORKTREES_PATH}}/_compose/<TX>/`:

```bash
docker compose -p <tx-id-lower> \
  <compose-args> \
  -f ./docker-compose.override.yml \
  --env-file ./.env \
  --profile only_if_not_cicd \
  up -d --build --force-recreate
```

Then run `docker compose -p <tx-id-lower> ps` and `curl -s -o /dev/null -w "%{http_code}"` against the API + app host ports for a smoke check. Report the result table to the user.

### 12. Stop (`--stop` / `--down`)

Run **in WSL**:

```bash
docker compose -p <tx-id-lower> \
  <compose-args> \
  -f ./docker-compose.override.yml \
  --env-file ./.env \
  down
```

If `_compose/<TX>/` does not exist, fall back to `docker compose -p <tx-id-lower> down` without the file list — Compose can stop a running project by name alone.

Report which containers were removed. Volumes are kept (the stack can be re-started with `--up`).

### 13. Destroy (`--destroy` / `--down-v`)

**Confirm before acting** unless `--force` was passed. Default destroy removes both the stack volumes (data loss) and the generated `_compose/<TX>/` folder.

Steps:

1. Run **in WSL**:

   ```bash
   docker compose -p <tx-id-lower> \
     <compose-args> \
     -f ./docker-compose.override.yml \
     --env-file ./.env \
     down -v --remove-orphans
   ```

   If `_compose/<TX>/` does not exist, fall back to `docker compose -p <tx-id-lower> down -v --remove-orphans`.

2. Delete `{{WORKTREES_PATH}}/_compose/<TX>/` (use `rm -rf` from WSL or `Remove-Item -Recurse` from PowerShell).

3. Confirm by listing remaining `docker volume ls --filter label=com.docker.compose.project=<tx-id-lower>` — should be empty.

4. Report: containers removed, volumes removed, folder removed. Mention that the **git worktrees** at `{{WORKTREES_PATH}}/<project>/<TX>/` are NOT touched — they remain on disk on `feature/<TX>`. To remove them, use `git worktree remove` per project.

### 14. Status / logs (`--status` / `--logs`)

- **`--status` / `--ps`**: run `docker compose -p <tx-id-lower> ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"` in WSL and print the output verbatim.
- **`--logs [services...]`**: run `docker compose -p <tx-id-lower> logs --tail 100 [services...]` in WSL and print the output. Default services = `<tx-id-lower>_api <tx-id-lower>_app` if both exist; else all.

## Multi-file merge compatibility (MANDATORY)

When `docker compose -f a -f b -f c …` merges multiple files, **every relative path is resolved against the FIRST `-f` file's directory**, not against each file's own directory. This breaks three things that the override must fix:

1. **`build.context`** — bake mis-resolves relative paths and cross-links unrelated projects (symptom: `lstat .../backend/.../src/App: no such file`). Pin every service's `build.context` to an absolute WSL path (`/mnt/c/...`) and re-declare `build.dockerfile`.
2. **`volumes`** — `../../:/app` in the frontend compose, intended as the frontend worktree root, will land in the backend root and produce `npm error ENOENT /app/package.json`. Pin every relative bind-mount to an absolute WSL path.
3. **Bind-mount files in `_compose/<TX>/`** — `./frontend-config.json:/app/...` resolves to the backend root, fails with `not a directory: Are you trying to mount a directory onto a file`. Pin to the absolute path of the file under `_compose/<TX>/`.

Additionally, Compose merges list-typed fields (`ports`, `volumes`) by **union**, not replacement. Without `!override` the base port `9092:9092` survives next to the override's `9192:9092`, leaking the original port. Every overridden list must be tagged `!override`:

```yaml
ports: !override
  - "9192:9092"
volumes: !override
  - /mnt/c/.../frontend-worktree:/app
  - /app/node_modules
  - /mnt/c/.../_compose/<TX>/frontend-config.json:/app/src/App/Configs/config.json:ro
```

The templates do all of this automatically; do not regress.

## Failure handling

- Missing TX ID → stop.
- Two mode flags set simultaneously → stop, report.
- **generate / up**:
  - No worktree for any project → stop with the list of expected paths.
  - Existing `_compose/<TX>/` folder without `--force` → stop.
  - Compose validation fails → keep files, print the error.
  - Port collision detected (offset already used by an earlier `_compose/<other-TX>/.env`) → warn; continue if `--force`, else stop and suggest a new offset.
- **stop / destroy**:
  - No running containers for the project → succeed silently (idempotent).
  - `down -v` fails partway → report the error; do **not** delete `_compose/<TX>/` (so the user can retry).
- **destroy**:
  - No `--force` and the user does not confirm → stop without changes.
- **status / logs**:
  - Project has no containers → print "no containers for project `<tx-id-lower>`" and exit cleanly.

## Notes for the orchestrator

- The skill writes only into `{{WORKTREES_PATH}}/_compose/<TX>/`. It never modifies the worktrees themselves or any project source.
- The skill does not start, stop, or build any container. It only generates files and validates the merge. Starting the stack is a user action.
- The skill assumes Docker Desktop with the WSL2 backend. WSL paths are written as `/mnt/c/...`. Per project rule, all Docker commands run inside WSL.

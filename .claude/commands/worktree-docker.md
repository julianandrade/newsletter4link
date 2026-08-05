# Worktree Docker (isolated Compose stack per TX/NTI worktree)

Manage an isolated Docker Compose stack for a transaction's git worktree(s). Default action generates the override files; mode flags also support starting, stopping, destroying, and inspecting the stack.

Use when you want to run, stop, or remove a TX-specific worktree (created by `/complete-development-tree`) in Docker without colliding with the main workspace stack or other worktree stacks.

## Modes

Exactly one mode flag may be set per invocation. Without any mode flag, the default is **generate**.

| Mode | Flag | What it does |
|------|------|--------------|
| generate (default) | (none) | Write/refresh the override files and validate the merge. Does NOT start the stack. |
| up | `--up` | Generate (if missing) + start the stack (`up -d --build --force-recreate`). |
| stop | `--stop` / `--down` | Stop and remove containers; keep volumes. |
| destroy | `--destroy` / `--down-v` | Stop + remove containers AND volumes, and delete the `_compose/<TX>/` folder. Asks for confirmation unless `--force`. |
| status | `--status` / `--ps` | Print `docker compose ps` for the project. No side effects. |
| logs | `--logs [services...]` | Tail logs for the project (or only the listed services). |

## Parameters

`$ARGUMENTS` (space-separated):

- **Positional (required)**: TX/NTI ID matching `^(TX|NTI)-` (e.g. `TX-003`, `NTI-002`). Exactly one.
- Mode flag (zero or one — see table above).
- **`--port-offset <N>`** (optional, generate / up only): integer in `[100, 9000]`, multiple of 100. Default = computed from the TX ID's trailing digits (e.g. `TX-003` → 400, `NTI-002` → 300).
- **`--project <name>[,<name>...]`** (optional, generate / up only, repeatable): restrict to specific projects. Default = every project whose worktree exists for the TX.
- **`--force`** (optional): in generate / up, overwrite an existing `{{WORKTREES_PATH}}/_compose/<TX>/` folder. In destroy, skip the confirmation prompt.

## Preconditions

- generate / up:
  1. `env` object of `.claude/settings.json` exists with `WORKTREES_PATH` and `PATH_DOCS`.
  2. At least one project worktree exists at `<workspace-root>/{{WORKTREES_PATH}}/<project>/<TX>/`.
  3. Each in-scope project has `setup/local/docker-compose.yml` inside the worktree.
  4. Docker Desktop with the WSL2 backend is installed and reachable from `wsl bash -c 'docker compose …'`.
- stop / destroy / status / logs:
  1. Docker Desktop with the WSL2 backend reachable. Generated files under `_compose/<TX>/` are preferred but **not required** — Compose can act on a running project by name alone.

If any precondition fails, the agent **stops** and reports.

## Flow

Delegates to the **worktree-docker** skill (`.claude/skills/worktree-docker/SKILL.md`). High-level steps depend on mode:

- **generate / up** — parse args; discover projects; classify; parse local compose files; compute port offset; detect frontend runtime config; render templates; validate; **up** also runs `up -d --build --force-recreate` + smoke check.
- **stop** — `docker compose -p <tx-id-lower> down` (keep volumes).
- **destroy** — confirm; `docker compose -p <tx-id-lower> down -v --remove-orphans`; delete `_compose/<TX>/`; verify no leftover volumes.
- **status** — `docker compose -p <tx-id-lower> ps`.
- **logs** — `docker compose -p <tx-id-lower> logs --tail 100 [services...]`.

## Block boundaries

None — single-shot. No sub-agents.

## Resume

Not applicable. Re-running with `--force` overwrites the previous output (generate / up) or skips confirmation (destroy).

## Usage

```
/worktree-docker <TX-id> [mode-flag] [--port-offset N] [--project <name>[,<name>...]] [--force]
```

Examples:

- Generate stack for TX-003 (default offset 400): `/worktree-docker TX-003`
- Generate + start stack for TX-003: `/worktree-docker TX-003 --up`
- Stop stack: `/worktree-docker TX-003 --stop`
- Destroy stack + remove generated files: `/worktree-docker TX-003 --destroy`
- Destroy without confirmation: `/worktree-docker TX-003 --destroy --force`
- Inspect: `/worktree-docker TX-003 --status`
- Logs (api + app): `/worktree-docker TX-003 --logs`
- Logs (specific): `/worktree-docker TX-003 --logs tx003_api`
- Generate frontend-only stack for NTI-002: `/worktree-docker NTI-002 --project pt.plataformaenvios.frontend`
- Custom offset: `/worktree-docker TX-003 --port-offset 1500`
- Regenerate: `/worktree-docker TX-003 --force`

## Notes

- **Docker in WSL only** (project rule). The skill executes all Compose commands via `wsl bash -c '…'`.
- **Destroy is destructive**. Volumes are removed (any seeded Mongo data, Redis state, Kafka topics) and the `_compose/<TX>/` folder is deleted. The **git worktrees** at `{{WORKTREES_PATH}}/<project>/<TX>/` are NOT touched — to remove them, use `git worktree remove` per project.
- The override pins every `build.context`, bind-mount, and volume to an absolute WSL path, and tags every overridden `ports:` / `volumes:` list with `!override`. Multi-file `docker compose -f` merges resolve relative paths against the first `-f` file's directory and union list fields by default — both behaviours cross-link unrelated projects without these guards. Templates handle this; do not regress.
- Each worktree stack uses its own project name (`<tx-id-lower>`), container prefix, network (`<tx-id-lower>_shared`), and host port range — multiple worktree stacks can run simultaneously alongside the main workspace stack.
- Generated files live under `{{WORKTREES_PATH}}/_compose/<TX>/` (outside both project source folders, so the project-structure-immutable rule is not violated).

# Complete Development Tree (parallel trunk + tracks across a Transaction dependency tree)

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

Orchestrate **`/complete-development` (trunk)** and **`/frontend-development` / `/backend-development` (tracks)** across multiple Transactions in parallel, respecting an explicit parent→child dependency tree declared in `{{PATH_DOCS}}/4-implementation/development/_tree.md`.

**Two-phase model**:
- **Trunk phase** (`/complete-development`): project-agnostic. Runs **once per Transaction**. Produces shared artifacts (complete-transaction, technical-solution-transaction, OpenAPI). No git worktrees.
- **Track phase** (`/frontend-development` / `/backend-development`): project-specific. Runs **once per (Transaction, project) pair** in isolated git worktrees.

Same-level Transactions execute concurrently within each phase. Children wait for all direct parents to complete before being scheduled.

**This command does not replace `/complete-development`, `/frontend-development`, or `/backend-development`.** It **invokes** them via parallel sub-agents.

## Parameters

The agent must interpret `$ARGUMENTS` as a token list (space-separated). Tokens:

- **Transaction IDs** (zero or more, positional): any token matching `TX-*` (e.g. `TX-001`, `TX-002-editar-tarefa`). Omit to include **all** Transactions in `_tree.md`.
- **`--project <name>[,<name>...]`** (optional, repeatable): target project(s) for the **track phase**. Names are subfolder names under `{{PATH_DOCS}}/4-implementation/projects/`. Source folder is `<workspace-root>/<project-name>` (must be a git repo). Omit → all registered projects.
Feature keys are read from `features` in `.claude/settings.json` and apply automatically to all trunk and track invocations. No CLI flags needed. Note: `features.confirm` causes each sub-agent to pause after every step within its block — the orchestrator does **not** gate on these pauses; they are internal to each sub-agent.
- **`--trunk-only`** (optional): stop after trunk phase (after 4api) without launching track agents.
- **`--tree <path>`** (optional): path to a `_tree.md` file to use instead of the default `{{PATH_DOCS}}/4-implementation/development/_tree.md`. Use when sub-transactions have their own local tree generated after a split (e.g. `{{PATH_DOCS}}/4-implementation/development/TX-001/_tree.md`). Accepts absolute paths or paths relative to the workspace root.
- **`--run-id <id>`** (optional): resume an in-flight run. Omit to start a new run or auto-detect the most recent unfinished run for the same (project set, Transaction set).

Token order is irrelevant. Flags can be combined.

## Preconditions

1. `{{PATH_DOCS}}/4-implementation/development/_tree.md` exists with a valid **Dependencies** table, **OR** `--tree <path>` is provided and the file at that path exists with a valid **Dependencies** table.
2. Each Transaction in scope has a document at `{{PATH_DOCS}}/4-implementation/development/<RQ>.md` or `{{PATH_DOCS}}/4-implementation/development/<RQ>/<RQ>.md`.
3. Each target project has a folder at `{{PATH_DOCS}}/4-implementation/projects/<name>/` declaring its **type** (`frontend` or `backend`) and a source folder at `<workspace-root>/<name>/` that is an independent git repository on its working branch.
4. The agent has permission to run `git worktree add`, `git worktree remove`, and `git worktree list` inside each target project's source folder.

If any precondition fails, the agent **stops** and reports; it does not partially execute.

## Flow

Delegates to the **complete-development-tree** skill (`.claude/skills/complete-development-tree/SKILL.md`). High-level steps:

### Step 1 — Parse and resolve

1. Parse `$ARGUMENTS`: collect RQ IDs, project names, flags.
2. Read `.claude/settings.json` for `PATH_DOCS`, `PATH_WORKTREES`, `MAX_PARALLEL_AGENTS`.
3. Discover projects: list subdirectories under `{{PATH_DOCS}}/4-implementation/projects/`. For each, read the declared type (`frontend` → `/frontend-development`, `backend` → `/backend-development`).
4. Load dependency tree from `--tree <path>` if provided; otherwise from `{{PATH_DOCS}}/4-implementation/development/_tree.md`.
5. If RQ list omitted → include all Transactions in the tree; else include selected RQs plus **all transitive ancestors**.
6. Validate: no cycles, no missing RQ documents, no unknown project names, no contradictory flags.

### Step 2 — Compute topological levels (Kahn's algorithm)

- Level 0 = Transactions with no parents in scope.
- Level N = Transactions whose parents are all in levels `< N`.

### Step 3 — Create/resume run manifest

Write `{{PATH_DOCS}}/4-implementation/development/_runs/<run-id>/manifest.md` (shared across phases; one file per run). If resuming, load the existing manifest.

### Step 4 — Trunk phase (per level, per RQ)

For each topological level, in order:

1. Spawn **up to `MAX_PARALLEL_AGENTS`** trunk sub-agents **in parallel** (single assistant message with multiple `Agent` tool calls) — one per `pending` RQ — each instructed to run `/complete-development <RQ>` from the shared docs directory. Sub-agents stop at the next trunk block boundary (see **Trunk blocks** below).
2. Collect sub-agent outcomes; update manifest (`trunk_phase`, `status`, `pause_reason`).
3. **Synchronization gate**:
   - Any RQ `paused_for_user` (awaiting clarifications or technical-clarifications) → list the pending files and **stop**. User fills files in batch and re-invokes to resume.
   - All RQs at the level `trunk_done` → advance to **Track phase** for this level (unless `--trunk-only`).
   - Any RQ `failed` → report and stop.

### Step 5 — Track phase (per level, per RQ × project)

For each topological level (after trunk phase for that level completes), and unless `--trunk-only`:

1. For each `pending` (RQ, project) pair, read `{tx-id}-technical-solution-transaction.md` to confirm the project's track scope applies. Skip pairs where scope does not match (e.g. no frontend scope → skip frontend project for that RQ).
2. Create git worktrees: inside the project's source folder, run `git worktree add <workspace-root>/{{PATH_WORKTREES}}/<project-name>/<RQ> -b feature/<RQ>`.
3. Spawn **up to `MAX_PARALLEL_AGENTS`** track sub-agents **in parallel** — one per (RQ, project) pair — each instructed to run `/frontend-development <RQ>` or `/backend-development <RQ>` (per project type) inside its worktree. Feature keys are read from `settings.json` by each sub-agent. Sub-agents stop at the next track block boundary (see **Track blocks** below).
4. Collect sub-agent outcomes; update manifest (`track_phase`, `status`, `pause_reason`).
5. **Synchronization gate** (same pattern as trunk gate):
   - Any (RQ, project) pair `paused_for_user` → list pending files; **stop** until user fills them.
   - All pairs at the level `done` → advance to next level.
   - Any pair `failed` → report and stop.

### Step 6 — Finish

When every level across both phases is `done`, emit a summary listing worktrees, branches, and any post-run actions (merge policy remains manual; worktrees are kept by default).

## Block boundaries

Sub-agents run **exactly one block** between two pause boundaries and return. The orchestrator is responsible for the synchronization gate. State is carried in each RQ's `progress.md` (Document & Compact mechanism defined in `/complete-development`).

### Trunk blocks (`/complete-development`)

| Block | Steps it runs | Next pause |
|-------|---------------|------------|
| A | 0 (validate), 1 (clarify) | step 2 — wait clarifications |
| B | 3 (specify), 3a (tech clarifications) | step 3b — wait tech-clarifications |
| C | 3c (tech solution Transaction), 4api (OpenAPI) | trunk done → track phase |

### Track blocks (`/frontend-development` or `/backend-development`)

| Block | Steps it runs | Next pause |
|-------|---------------|------------|
| T1 | 4a (architect), 4b (arch security if active), 4c (FE: UI/UX) | before test or developer sync |
| T2 | 5, 5b (FE only: test-plan + coverage loop) | if coverage doubts → wait; otherwise T3 |
| T3 | 5c (FE: Robot), 5d (unit TDD Red), 6 (developer + /simplify + commit), loop 7, 8, 9, 10 | end of track command |

Sub-agents MUST NOT cross block boundaries unattended.

## Resume

Re-invoking with the same `(project set, Transaction set, run-id)` picks up from the current manifest state:

- RQs `paused_for_user` (trunk or track) whose awaited files are now populated → transition to `pending`, re-enter the relevant phase loop.
- RQs `trunk_done` but track not yet started → enter track phase.
- RQs `running` (from a crashed previous invocation) → re-read their `progress.md` and re-spawn.
- Completed RQs and (RQ, project) pairs are skipped.

`--run-id` optional; without it, command looks for the most recent unfinished run matching the project + Transaction set.

## Usage

```
/complete-development-tree [TX-X TX-Y ...] [--project <name>[,<name>...]]... [--trunk-only] [--run-id <id>]
```

Feature keys (`features.security`, `features.test`, `features.clarifications`, `features.confirm`) are read from `.claude/settings.json` and apply automatically to all trunk and track invocations.

Examples:

- Every project, every Transaction: `/complete-development-tree`
- Trunk only for all Transactions: `/complete-development-tree --trunk-only`
- Trunk only for specific Transactions: `/complete-development-tree TX-001 TX-002 --trunk-only`
- One project, three Transactions: `/complete-development-tree --project pt.plataformaenvios.frontend TX-001 TX-002 TX-005`
- Two projects, one Transaction: `/complete-development-tree --project pt.plataformaenvios.frontend,pt.plataformaenvios.backend TX-001`
- Resume a specific run: `/complete-development-tree --run-id 2026-04-20-153000`
- Sub-transactions from a split, using a local tree: `/complete-development-tree --tree docs/4-implementation/development/TX-001/_tree.md`
- Sub-transactions from a split, trunk only: `/complete-development-tree --tree docs/4-implementation/development/TX-001/_tree.md --trunk-only`

Project names are folder names at the workspace root — substitute your own.

## Notes

- **Context isolation**: each sub-agent runs in its own sub-session with its own worktree (track phase) or shared docs only (trunk phase). The orchestrator session holds only manifests and gate decisions.
- **Shared docs**: `{{PATH_DOCS}}/4-implementation/development/<RQ>/` is shared across all worktrees (lives in the `.claude/` tree, outside target repos). Trunk artifacts (complete-transaction, tech-spec, OpenAPI, progress) are readable by track sub-agents.
- **Trunk is project-agnostic**: no worktrees are created in the trunk phase. Trunk sub-agents read and write docs only.
- **Scope filtering**: if a Transaction has only frontend scope, backend projects are skipped for that RQ (and vice versa). Scope is determined from `{tx-id}-technical-solution-transaction.md` after trunk completes.
- **Merges / PRs**: this command does **not** merge worktree branches. The user decides policy per project at run end.
- **Cleanup**: worktrees are retained after the run. Remove manually with `git worktree remove` when no longer needed.

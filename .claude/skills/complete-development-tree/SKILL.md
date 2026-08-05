---
name: complete-development-tree
description: Orchestrate `/complete-development` across multiple Transactions in parallel using git worktrees, respecting a parent→child dependency tree. Use when invoked by `/complete-development-tree` or when asked to run several Transactions concurrently with level-based synchronization. Not a replacement for `/complete-development`; it invokes it once per (Transaction, project) pair.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Develop Tree Skill

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

## Purpose

Implements the logic behind the `/complete-development-tree` command. Given a set of Transaction IDs, a set of target projects, and flags, this skill:

1. Parses the central dependency tree (`{{PATH_DOCS}}/transactions/_tree.md`).
2. Computes topological levels so children wait for parents and same-level Transactions run in parallel.
3. Creates one git worktree + feature branch per `(Transaction, project)` pair.
4. Spawns parallel sub-agents that each run `/complete-development` from the next pending block until the next pause boundary.
5. Synchronizes human-pause gates per level and per project.
6. Persists state in a per-project manifest so the run can be resumed.

This skill **does not** modify `/complete-development`. It invokes it; `/complete-development` remains the single source of truth for the per-Transaction flow.

## Inputs

- `$ARGUMENTS` from the `/complete-development-tree` command: optional TX/NTI IDs, optional `--project` values (comma-separated or repeated), `--tree`, `--run-id`.
- `features` from `.claude/settings.json`: `features.security`, `features.test`, `features.clarifications` — apply automatically to all trunk and track invocations.
- `.claude/settings.json` — `PATH_DOCS`, `PATH_WORKTREES`, `MAX_PARALLEL_AGENTS`.
- `{{PATH_DOCS}}/projects/` — source of project **names** (each immediate subdirectory is one project; files are ignored).
- **Workspace root** (directory where `.claude/` symlink lives) — source of project **paths** (`./<project-name>` must exist and be an independent git repository).
- `{{PATH_DOCS}}/transactions/_tree.md` — **Dependencies** table (source of truth). Overridden by `--tree <path>` when provided.

## Outputs

- `{{PATH_DOCS}}/transactions/_runs/<run-id>/<project>/manifest.md` — one per project (shared `<run-id>`).
- Git worktrees at `{{PATH_WORKTREES}}/<project-name>/<TX>` on branches `feature/<TX>`.
- Per-Transaction `{{PATH_DOCS}}/4-implementation/development/<TX>/progress.md` files updated by the spawned sub-agents.
- A final run report (printed in the orchestrator response, no file) listing worktrees, branches, and final status per `(project, TX/NTI)`.

## Procedure

### 1. Parse parameters

From `$ARGUMENTS`:

- Collect all tokens matching `^(TX|NTI)-` as **requested TX/NTI IDs** (may be empty).
- Collect all `--project <value>` occurrences; split each value on `,`. Deduplicate. If empty, mark "all projects".
- Detect `--tree <path>`: if present, resolve to an absolute path (relative to workspace root if not absolute). Store as the **tree file path** to use in step 3.
- Detect `--run-id <id>` for resume mode.

### 2. Resolve configuration

Read `.claude/settings.json`. Required:

- `PATH_DOCS` (relative to workspace root).
- `PATH_WORKTREES` (root path relative to workspace root, or absolute; default `.worktrees`). Worktrees land at `<PATH_WORKTREES>/<project-name>/<TX>`.
- `MAX_PARALLEL_AGENTS` (integer; default `4`).
- `features.security`, `features.test`, `features.clarifications`, `features.confirm` (booleans, default `true`/`false` per feature when absent) — passed implicitly via `settings.json` to all spawned sub-agents. Note: `features.confirm` causes each sub-agent to pause after every step within its block; the orchestrator does not gate on these pauses.

**Discover projects**:

1. List the immediate subdirectories of `{{PATH_DOCS}}/projects/`. Each subdirectory name is a **project name**. Non-directory entries (e.g. `README.md`, `_TEMPLATE.md`) are ignored.
2. For each project name, the **project path** is `<workspace-root>/<project-name>` (workspace root = directory containing the `.claude/` symlink).
3. Each resolved project path must exist on disk and be an independent git repository (contain a `.git` entry). If it does not, **stop** and report.

If `--project` is empty, use every discovered project. If a requested `--project <name>` has no subfolder under `{{PATH_DOCS}}/projects/`, **stop** and report (list the discovered names).

### 3. Load dependency tree

Determine the tree file path:
- If `--tree <path>` was provided in step 1: use that path (already resolved to absolute).
- Otherwise: use `{{PATH_DOCS}}/4-implementation/development/_tree.md`.

Open the resolved tree file. Locate the section starting at `## Dependencies` followed by a Markdown table with the exact header `| TX | Parents | Notes |`. Parse each data row:

- `rq` = first column trimmed.
- `parents` = second column; `—` (em dash) or empty string means no parents. Otherwise split on `,` and trim each token.
- `notes` = third column (informational only).

Build an in-memory directed graph `tx → parents[]`.

Ignore the `## Tree view (illustrative)` section for parsing. If the table and the tree view disagree, emit a warning but proceed — the table wins.

### 4. Resolve scope

- If the requested TX/NTI list is empty → **scope** = every TX/NTI in the graph.
- Else → **scope** = the requested TX/NTIs plus every transitive ancestor. Include a requested TX/NTI's parents even when not explicitly listed; without the ancestor, the child cannot be correctly scheduled.

If any scoped TX/NTI has no matching document under `{{PATH_DOCS}}/4-implementation/development/<TX>.md` or `{{PATH_DOCS}}/4-implementation/development/<TX>/<TX>.md`, **stop** and list the missing documents.

### 5. Validate

- **Cycle detection**: run DFS; if any back edge exists inside the scope, **stop** and list the cycle.
- **Unknown parent**: any parent referenced by an in-scope TX that is not itself defined in the Dependencies table → **stop**.
- **Features sanity**: `features` values are read from `settings.json`; no CLI flags to validate here.

### 6. Topological levels (Kahn)

1. Compute `indegree[tx]` within scope (count of parents also in scope).
2. Repeat: set `levelN` = every scoped TX with `indegree == 0` that is not yet placed; remove them from the remaining set; decrement `indegree` of their children.
3. Stop when no TX is left. If the remaining set is non-empty after no TX has `indegree == 0`, there is a cycle (should have been caught in step 5).

Record levels as an ordered list `[level0, level1, ...]`.

### 7. Create or resume the run

- **`<run-id>`**: if `--run-id` provided, use it. Else, if there is an unfinished run under `_runs/` whose scope (project set + TX set) matches the current invocation exactly, adopt its id. Otherwise generate a new id: `YYYY-MM-DD-HHMMSS` in UTC.
- **Per project**: path `{{PATH_DOCS}}/transactions/_runs/<run-id>/<project>/manifest.md`. If missing, generate from `.claude/skills/complete-development-tree/templates/manifest.md.tpl`, substituting:
  - `{{run-id}}`, `{{project-name}}`, `{{project-path}}`, `{{flags}}` (joined list), `{{levels}}` (Level table), `{{transactions}}` (initial Transactions table — see initialisation rule below).
  - **Initialisation rule per TX**: before setting `status=pending`, read `{{PATH_DOCS}}/4-implementation/development/<RQ>/progress.md` (if it exists). If that file contains `"next_phase": "end"` or `"status": "done"`, initialise that TX with `phase=end`, `status=done` in the manifest — it will be skipped by the execution loop. Otherwise initialise with `phase=pending`, `status=pending` (default).
- **If resuming**: load the existing manifest. Transactions with `status=done` are skipped. `paused_for_user` with all awaited files now filled → transition to `pending` (the orchestrator detects this by re-checking the files listed in the manifest's `Pause reason` cell).

### 8. Execute levels (per project, projects run independently)

For each project, independently, walk the level list in order:

1. **Prepare worktrees** for every TX/NTI at the current level whose status is `pending`:

   **1a. Determine base branch** — for each TX, inspect its parents from the dependency graph:

   ```bash
   cd "<project-path>"
   # For each parent of TX, check whether feature/<parent> is already merged into HEAD
   git merge-base --is-ancestor feature/<parent> HEAD
   # exit 0 → merged; exit 1 → not yet merged
   ```

   Collect **unmerged parents** (those where the check exits non-zero).

   | Unmerged parents | Base branch | Action |
   |---|---|---|
   | 0 (all merged or root TX) | `HEAD` (default) | create branch normally |
   | 1 | `feature/<that-parent>` | create branch from parent branch |
   | 2+ | — | **STOP** — print list of unmerged parents; instruct user to merge them before proceeding |

   > **Note:** `feature/<parent>` may only exist as a remote ref (`origin/feature/<parent>`). Check both local and remote:
   > ```bash
   > git show-ref --verify refs/heads/feature/<parent> ||
   > git show-ref --verify refs/remotes/origin/feature/<parent>
   > ```
   > Use whichever exists. If remote only, fetch first: `git fetch origin feature/<parent>`.

   **1b. Create or attach worktree:**

   ```bash
   cd "<project-path>"
   if ! git worktree list | grep -q "<PATH_WORKTREES>/<project-name>/<TX>"; then
       if git show-ref --verify --quiet "refs/heads/feature/<TX>"; then
           # branch already exists — attach to it (resume scenario)
           git worktree add "<workspace-root>/<PATH_WORKTREES>/<project-name>/<TX>" "feature/<TX>"
       elif [ "<base-branch>" = "HEAD" ]; then
           # no unmerged parent — branch from current HEAD
           git worktree add "<workspace-root>/<PATH_WORKTREES>/<project-name>/<TX>" -b "feature/<TX>"
       else
           # one unmerged parent — branch from its feature branch
           git worktree add "<workspace-root>/<PATH_WORKTREES>/<project-name>/<TX>" -b "feature/<TX>" "<base-branch>"
       fi
   fi
   ```

   Record the worktree path, branch, and resolved base branch in the manifest.

2. **Batch into chunks of `MAX_PARALLEL_AGENTS`**: if the level has more RQs than `MAX_PARALLEL_AGENTS`, process them in sequential chunks of that size (within a chunk, sub-agents run in parallel).

3. **Spawn sub-agents in parallel** (one assistant message with multiple `Agent` tool calls — one call per TX/NTI in the chunk). Each sub-agent receives the prompt template in §9.

4. **Collect results** from each sub-agent. The sub-agent's final message must end with a fenced code block labelled `complete-development-tree-result` (see §9) containing a JSON object with:

   ```json
   {
     "status": "paused_for_user | done | failed | running",
     "next_phase": "2.wait | 3b.wait | 5b.wait | 5c.robot | 6.developer | 7.loop | 8.tag | 9.docs | 10.sec | end",
     "pause_reason": "awaiting clarifications | awaiting technical-clarifications | awaiting test-plan-clarifications | null",
     "awaited_files": ["<absolute path>", "..."] ,
     "error": "short error message or null"
   }
   ```

   If a sub-agent does not produce this block, record `status=failed` with a descriptive error and continue collecting peers.

5. **Update the manifest** (rewrite the Transactions table) with each TX/NTI's new `phase`, `status`, `pause_reason`, `awaited_files`. Every write is a full-file rewrite to keep parsing trivial.

6. **Synchronization gate** (end of level):
   - Any `failed` → **stop**; print the per-TX/NTI error lines and the path to each `progress.md`.
   - Any `paused_for_user` → **stop**; print a consolidated list of `awaited_files` the user must complete. The orchestrator **does not** advance to the next level until the user re-invokes the command.
   - All `done` → proceed to the next level.

When every level in every project is `done`, go to §10.

### 9. Sub-agent prompt template

Use the `general-purpose` subagent_type. Prompt:

```
You are running one block of `/complete-development` for a single Transaction inside a dedicated git worktree, coordinated by `/complete-development-tree`.

### Context
- Transaction: <TX-id>
- Project: <project-name>
- Worktree path (absolute): <worktree-path>
- Branch: feature/<TX-id>
- Starting phase (from manifest): <phase>
- Flags to pass to /complete-development: <flags>
- Parents (already completed): <parent-list or "none">

### Your task

> **WORKTREE ISOLATION (MANDATORY — do this before anything else)**
> The Read, Edit, and Write tools resolve paths relative to the agent's working directory, NOT to the Bash cwd. You MUST use **absolute paths** for every file operation throughout this task. Two allowed root prefixes:
> - **Project files**: `<worktree-path>/…` (everything inside the worktree)
> - **Shared docs**: `{{PATH_DOCS}}/…` (transaction specs, mockups, progress.md — shared across worktrees)
>
> Any path outside these two roots is a mistake. If you catch yourself writing to `<project-name>/…` without the `.worktrees/` prefix, stop and correct it.

1. **Verify worktree** (Bash, absolute path): `cd <worktree-path> && pwd`. Confirm output matches `<worktree-path>` before proceeding.
2. If the starting phase is not `0`, read `{{PATH_DOCS}}/transactions/<RQ-id>/progress.md` first. That file is the resume point.
3. Execute the steps of `/complete-development <TX-id>` starting from the current phase, **stopping at the next pause boundary**. Block boundaries (exactly one block per invocation):
   - Block A: steps 0, 1 (skip 1 if `features.clarifications` is `false`) → stop at step 2 (wait clarifications) **unless** `features.clarifications` is `false`, in which case proceed directly to Block B.
   - Block B: steps 3, 3a (skip 3a if `features.clarifications` is `false`) → stop at step 3b (wait technical-clarifications) **unless** `features.clarifications` is `false`, in which case proceed directly to Block C.
   - Block C: steps 3c, 4a, 4b, 4c, 4d, 5, 5b → stop at step 5b only if coverage <100% with doubts (test-plan-clarifications); otherwise continue into block D.
   - Block D: steps 5c, 5d, 6, loop 7, 8 → stop at end of 8.
   - Block E: steps 9, 10 → stop at end of command.
4. DO NOT cross a pause boundary. If you reach a human-pause step, stop, do not create any file you cannot finalise, and return the structured result below.
5. Always leave `{{PATH_DOCS}}/transactions/<RQ-id>/progress.md` consistent with where you stopped.
6. When parent artefacts are needed (parent complete-transaction, tech-spec), read them from `{{PATH_DOCS}}/transactions/<parent-id>/`. Do not copy parent code between worktrees.

### Mockup priority (frontend projects — MANDATORY)
Before writing any component or SCSS code in step 6, check for mockups:

1. **Consolidated file** (preferred): `{{PATH_DOCS}}/mockups/<RQ-id>/html/<RQ-id>-mockups.html`
2. **Individual screen files** (fallback when consolidated does not exist): all `*.html` files under `{{PATH_DOCS}}/mockups/<RQ-id>/html/` — read every one.
3. **PNG screenshots**: all `*.png` files under `{{PATH_DOCS}}/mockups/<RQ-id>/screenshots/` — read every one.
4. **Component reference files** (when project uses a design system): all `*.md` files under `{{PATH_DOCS}}/mockups/<TX-id>/components/` — read every one if the folder exists. Each file maps a screen's UI elements to the exact design system component names, variants, and props to use.
   - **Design-system gate**: if the project uses a design system (`{{PATH_DOCS}}/design-system/` exists or a design system package is in `package.json`) but `components/` is absent → stop and warn: "Component reference files are missing for <TX-id>. Re-run `/generate-mockup` to regenerate them before proceeding with implementation."

If any mockup files exist (consolidated OR individual):
- **Read them ALL before writing a single line of UI code.**
- Treat them as the highest-priority visual reference. They define layout, colors, spacing, component structure, and interaction states.
- Extract: exact hex/CSS color values, CSS class definitions, layout structure (flex/grid), spacing values, component hierarchy, state variants (empty, loading, error, active row, selected, hover, badge styles).
- When component reference files exist, also extract the prescribed design system component names, variants, and props for each screen element — use them directly during implementation.
- Do NOT copy HTML from the mockup into React components — use the project's tech stack and design system components. The mockup is a visual specification, not source code.
- Only deviate from the mockup if a specific element is technically impossible in the target stack. Document any deviation in a comment.

If no mockup files exist at all, use the frontend tech spec as the visual reference instead.

### Required final output
The very last thing in your response must be a fenced code block tagged `complete-development-tree-result` containing a single JSON object:

```complete-development-tree-result
{
  "status": "paused_for_user" | "done" | "failed",
  "next_phase": "<step identifier, e.g. 2.wait, 3b.wait, 5c.robot, 6.developer, 7.loop, 8.tag, 9.docs, 10.sec, end>",
  "pause_reason": "<short string>" | null,
  "awaited_files": [ "<absolute path>", ... ],
  "error": "<short string>" | null
}
```

No prose after that block.
```

Substitute `<...>` placeholders per call. Sub-agents run in parallel — issue all `Agent` tool calls in a single assistant message.

### 10. Finalisation

When every level across every project is `done`:

- Print a run summary:
  - Run id.
  - Per project: worktree → branch → final phase.
  - Any warnings (tree-view drift, missing notes).
- Remind the user that worktrees are **kept** by default. Removal is manual:

  ```bash
  cd "<project-path>"
  git worktree remove "<workspace-root>/<PATH_WORKTREES>/<project-name>/<RQ>"
  ```

- Do **not** merge, rebase, or push. The user owns merge policy per project.

## Sub-agent block rules (clarifications)

- Each invocation of the skill runs **one** block per TX/NTI, not the entire `/complete-development`. This keeps the orchestrator's gate logic simple (one pause per block per TX/NTI per call).
- Block C may end at 5b (paused_for_user) **or** pass straight into Block D when there are no test-plan doubts. In the latter case, the sub-agent still stops at end of Block D.
- When `features.clarifications` is `false`, steps 1, 2, 3a, 3b are skipped; Block A runs only step 0 then merges into Block B, and Block B runs only step 3 then merges into Block C — no human-pause gates for clarifications.
- When `features.test` is `false`, steps 5, 5b, 5c, 5d, 7a, 7a2, 7b, 9 are skipped; the sub-agent collapses Block C and D accordingly and may return `status=done` at the end of the next block.
- When both `features.security` and `features.test` are `false`, Blocks C and D merge into a short path (4a → 4c if frontend → 4d if greenfield → 6 → 8); the sub-agent may return `status=done` after Block D and the orchestrator skips Block E.

## Failure handling

- Sub-agent returns `status=failed`: record the error in the manifest; stop the run for that project; allow other projects to continue until **their** next gate. Final summary lists all failures.
- Sub-agent crashes without the required final block: treat as `failed` with a stub error. User can fix and re-run with `--run-id`.
- Git worktree creation fails (dirty working tree, locked worktree, or other git error): stop the run for the affected project before spawning any sub-agents. Report the git error verbatim. Note: pre-existing `feature/<TX/NTI>` branches are handled gracefully — the worktree attaches to the existing branch without `-b`.

## Notes for the orchestrator

- Never call `/complete-development` yourself from the orchestrator session — always via a sub-agent. The orchestrator session owns the manifest and the gate; sub-agents own the per-TX/NTI work.
- Do not use `EnterWorktree` in the orchestrator: it would switch the orchestrator's own cwd. Sub-agents change directory via `Bash` with absolute paths.
- Keep the orchestrator response compact: summarise each chunk's sub-agent outcomes (one row per TX/NTI) plus the gate decision; do not echo full sub-agent transcripts.

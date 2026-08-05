# Develop-tree Run — {{run-id}}

- **Run ID**: {{run-id}}
- **Project**: {{project-name}}
- **Project path**: {{project-path}}
- **Flags**: {{flags}}
- **Worktrees path**: {{PATH_WORKTREES}}
- **Max parallel**: {{MAX_PARALLEL_AGENTS}}

## Levels

| Level | Transactions |
|-------|--------------|
{{levels}}

## Transactions

| RQ | Parents | Worktree | Branch | Phase | Status | Pause reason | Awaited files |
|----|---------|----------|--------|-------|--------|--------------|---------------|
{{Transactions}}

## Status values

- `pending` — not yet started or waiting for its level turn.
- `running` — a sub-agent is currently executing this RQ in a block of `/complete-development`.
- `paused_for_user` — the sub-agent stopped at a human-pause step (2, 3b, 5b). The user must complete the files listed in `Awaited files` and re-invoke `/complete-development-tree` to resume.
- `done` — all blocks of `/complete-development` finished successfully for this RQ.
- `failed` — a sub-agent returned an error or crashed. See the RQ's `progress.md` and error line in this manifest.

## Phase values (what the next block must run)

Phases refer to the steps in `.claude/commands/complete-development.md`:

- `0.validate` / `1.clarify` / `2.wait` (Block A)
- `3.specify` / `3a.tech-clar` / `3b.wait` (Block B)
- `3c.tech-sol` / `4a.architect` / `4b.sec-arch` / `4c.design` / `4d.baseline` / `5.test-plan` / `5b.coverage` (Block C)
- `5c.robot` / `5d.unit-tdd` / `6.developer` / `7.loop` / `8.tag` (Block D)
- `9.docs` / `10.ctx-sec` (Block E)
- `end` — finished

## Notes

- This file is **machine-rewritten** by `/complete-development-tree` on every update. Manual edits may be overwritten; put project notes elsewhere.
- `Awaited files` is a comma-separated list of absolute paths the user must complete when `Status = paused_for_user`.
- When resuming (`/complete-development-tree --run-id {{run-id}}`) the orchestrator re-reads this file, re-checks every `paused_for_user` RQ's awaited files, and transitions them to `pending` if filled.

# Git worktrees, for parallel agent work

> Julian's instruction, 10 August 2026. Supersedes the old "do not touch worktrees"
> line in CLAUDE.md's Multi-Agent Safety section.

**When work can run in parallel, or when more than one agent may touch this repo at
once, give each stream its own worktree.** Sharing a single checkout is now the thing
that needs justifying, not the other way round.

---

## Why

Agents sharing one checkout do not collide on the files they each edit. They collide on
whatever is global to the checkout. All three of these have actually happened in this
repository:

| Collision | What it looks like |
|---|---|
| Branch switching | One session runs `git checkout`, and a neighbour's edits are suddenly against a tree it never saw. Nothing errors; the work is just wrong. |
| The dev server port | `npm run dev` binds 3111. The second session gets `EADDRINUSE: address already in use :::3111` and cannot verify anything in a browser. |
| Staging everything | `git add -A` sweeps in another session's untracked files. This repo has two commits whose whole purpose was undoing that: `608cc5c` and `9e288a7`. |

A worktree gives each stream its own working directory and its own `HEAD`, sharing one
`.git`. Branch switches, dev servers, and staging stop being shared state.

---

## How

```bash
# From the repo root. One worktree per stream of work, branch named for the work.
git worktree add ../n4l-superadmin -b feat/superadmin
git worktree add ../n4l-curation   -b fix/curation-visibility

git worktree list                      # what exists right now
git worktree remove ../n4l-superadmin  # when the work has landed
git worktree prune                     # tidy stale entries
```

Claude Code has two shortcuts that do the same thing with less ceremony:

- The `EnterWorktree` tool, and `ExitWorktree` to come back.
- `isolation: "worktree"` on an `Agent` call, which gives that subagent its own worktree
  and removes it automatically if the agent changed nothing.
- The `superpowers:using-git-worktrees` skill, for the full workflow including how to
  finish and merge.

### Per-worktree setup this project needs

A fresh worktree is a fresh directory. Three things do not come with it:

1. **`.env` is untracked**, so copy it: `cp .env ../n4l-superadmin/.env`. Without it
   every Prisma and Supabase call fails on a missing `DATABASE_URL`.
2. **`node_modules` is not shared.** Run `npm install` in the worktree. `postinstall`
   runs `prisma generate`, which the worktree also needs its own copy of.
3. **The dev server port collides anyway.** `npm run dev` is pinned to 3111 in
   `package.json`. Give each worktree its own: `npx next dev --port 3112`. Two worktrees
   do not fix one hardcoded port.

### One database, always

Every worktree points at the same Supabase instance, because `DATABASE_URL` is copied.
**Worktrees isolate code, not data.** Two agents running `prisma db push` against
different schema edits will fight, and the loser's schema is silently gone. If a change
touches `prisma/schema.prisma`, it does not run in parallel with another schema change.

---

## Rules

- One worktree per stream of work, named for the work, on its own branch.
- Copy `.env`, run `npm install`, pick a free port.
- Remove the worktree once the branch has landed. `git worktree list` should be short.
- Never `git add -A`. Stage explicit paths, in a worktree as much as anywhere else.
- Schema changes are serial. One agent at a time on `prisma/schema.prisma`.
- Do not create or drop a `git stash` to move work between worktrees. Commit on a branch
  instead; that is what the branch is for.

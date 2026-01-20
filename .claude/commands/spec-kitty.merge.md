---
description: Merge a completed feature into the main branch and clean up worktree
---

**Path reference rule:** Provide absolute paths or paths relative to project root.

# Merge Feature Branch

This command merges a completed feature branch into main and handles cleanup.

## Location Pre-flight Check (CRITICAL)

**BEFORE PROCEEDING:** You MUST be in the feature worktree, NOT the main repository.

```bash
pwd
git branch --show-current
```

**Expected output:**
- `pwd`: Should end with `.worktrees/001-feature-name`
- Branch: Feature branch name like `001-feature-name` (NOT `main`)

**If you see `main`:** STOP - DANGER! You are in the wrong location!

---

## Prerequisites

Before running this command:

1. ✅ Feature must pass `/spec-kitty.accept` checks
2. ✅ All work packages must be in `tasks/done/`
3. ✅ Working directory must be clean
4. ✅ Run from the feature worktree

## What This Command Does

1. **Detects** current feature branch and worktree status
2. **Verifies** working directory is clean
3. **Switches** to target branch (default: `main`)
4. **Updates** target branch (`git pull --ff-only`)
5. **Merges** using chosen strategy
6. **Optionally pushes** to origin
7. **Removes** feature worktree
8. **Deletes** feature branch

## Usage

### Basic merge
```bash
spec-kitty merge
```

### Merge with options
```bash
# Squash all commits
spec-kitty merge --strategy squash

# Push after merging
spec-kitty merge --push

# Keep the feature branch
spec-kitty merge --keep-branch

# Merge into different branch
spec-kitty merge --target develop

# Dry run
spec-kitty merge --dry-run
```

## Merge Strategies

### `merge` (default)
Creates a merge commit preserving all feature commits.

### `squash`
Squashes all feature commits into a single commit.

### `rebase`
Requires manual rebase first (command will guide you).

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--strategy` | merge, squash, or rebase | merge |
| `--keep-branch` | Keep feature branch | delete |
| `--keep-worktree` | Keep worktree | remove |
| `--push` | Push to origin | no push |
| `--target` | Target branch | main |
| `--dry-run` | Preview only | off |

## The Worktree Pattern

```
my-project/                    # Main repo (main branch)
├── .worktrees/
│   ├── 001-auth-system/      # Feature 1 worktree
│   ├── 002-dashboard/        # Feature 2 worktree
│   └── 003-notifications/    # Feature 3 worktree
├── .kittify/
├── kitty-specs/
└── ... (main branch files)
```

## The Complete Flow

```
1. /spec-kitty.specify    → Creates branch + worktree
2. cd .worktrees/<feature>
3. /spec-kitty.plan
4. /spec-kitty.tasks
5. /spec-kitty.implement
6. /spec-kitty.review
7. /spec-kitty.accept
8. /spec-kitty.merge      → Merge + cleanup
9. Back in main repo!
```

## After Merging

After successful merge:
- ✅ Feature code integrated
- ✅ Worktree removed
- ✅ Feature branch deleted
- ✅ Ready for next feature!

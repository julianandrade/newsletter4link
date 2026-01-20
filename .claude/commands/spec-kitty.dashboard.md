---
description: Open the Spec Kitty dashboard to view project status.
---

## Context: Dashboard Overview

**What is the dashboard?**
A real-time, read-only interface showing the health and status of all features in your project.

**Key characteristics**:
- ✅ Read-only (for viewing/monitoring only)
- ✅ Project-wide view (shows ALL features)
- ✅ Live updates (refreshes as you work)
- ✅ No configuration needed

**Run from**: Main repository root (automatically detects worktrees)

---

## When to Use Dashboard

- **Project overview**: See all features, statuses, and progress
- **Debugging workflow**: Check if features are properly detected
- **Monitoring**: Track which features are in progress, review, or complete
- **Status reports**: Show stakeholders real-time feature status

---

## Workflow Context

**Where it fits**: This is a utility command, not part of the sequential workflow

**You can run this**:
- From main repository root
- From inside a feature worktree
- At any point during feature development
- Multiple times

**What it shows**:
- All features and their branches
- Current status (in development, reviewed, accepted, merged)
- File integrity checks
- Worktree status
- Missing or problematic artifacts

---

## Implementation

The dashboard can be opened by:

1. **Checking feature status manually**:
   ```bash
   ls -la kitty-specs/*/
   ls -la .worktrees/
   ```

2. **Using git to see branches**:
   ```bash
   git branch -a
   git worktree list
   ```

3. **Reviewing task status**:
   ```bash
   for dir in kitty-specs/*/; do
     echo "=== $dir ==="
     if [ -f "$dir/tasks.md" ]; then
       grep -c "\[x\]" "$dir/tasks.md" || echo "0 completed"
       grep -c "\[ \]" "$dir/tasks.md" || echo "0 pending"
     fi
   done
   ```

## Success Criteria

- User sees clear status of all features
- Any issues or blockers are highlighted
- Easy to understand project health at a glance

---
description: Execute the implementation plan by processing all tasks defined in tasks.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Location Pre-flight Check (CRITICAL)

**BEFORE PROCEEDING:** Verify you are working from inside the feature worktree.

```bash
pwd
git branch --show-current
```

**Expected output:**
- `pwd`: `/path/to/project/.worktrees/004-feature-name`
- Branch: `004-feature-name` (NOT `main`)

**If you see `main`:** STOP - You are in the wrong location!

---

## Review Feedback Check

**Before implementing**, check for prior review feedback:

1. Open the task prompt file
2. Look for `review_status` field in frontmatter:
   - `review_status: has_feedback` -> Task was reviewed and returned
   - `review_status: acknowledged` -> Feedback already being addressed
   - `review_status: ""` -> No feedback; proceed normally

3. **If feedback exists**: Read the `## Review Feedback` section and treat action items as your TODO list

---

## Outline

1. **Verify worktree context** (validated in pre-flight)

2. **Run prerequisites check**: `.kittify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`

3. **Initialize Task Workflow** (for EACH task):
   a. Move task prompt to doing lane:
   ```bash
   SHELL_PID=$(echo $$)
   .kittify/scripts/bash/tasks-move-to-lane.sh FEATURE-SLUG TXXX doing \
     --shell-pid "$SHELL_PID" --agent "claude" --note "Started implementation"
   ```
   b. Verify frontmatter metadata
   c. Confirm Activity Log entry
   d. Commit the move

4. **Load and analyze context**:
   - Read tasks.md, task prompt file, plan.md
   - If exists: data-model.md, contracts/, research.md

5. **Execute implementation**:
   - Follow phase-by-phase execution
   - Respect dependencies
   - Follow TDD approach when appropriate

6. **Progress tracking**:
   - Report progress after each completed task
   - After completing each task, move to for_review:
   ```bash
   .kittify/scripts/bash/tasks-move-to-lane.sh FEATURE-SLUG TXXX for_review \
     --shell-pid "$SHELL_PID" --agent "claude" --note "Ready for review"
   ```

7. **Completion validation**:
   - Verify all tasks completed
   - Check implementation matches specification
   - Confirm tests pass

## Task Workflow Summary

**For every task**:

1. **START**: `planned/` → `doing/`
2. **WORK**: Implement the task
3. **COMPLETE**: `doing/` → `for_review/`
4. **REVIEW**: Reviewer moves to `done/`

**Shell PID**: Capture once per session with `echo $$`
**Timestamp format**: ISO 8601 with timezone
**Agent identifiers**: claude, codex, gemini, copilot, cursor, etc.

**Next suggested command**: `/spec-kitty.review`

---
description: Perform structured code review and kanban transitions for completed task prompt files.
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

## Outline

1. **Run prerequisites**: `.kittify/scripts/bash/check-prerequisites.sh --json --include-tasks`

2. **Determine review target**:
   - If user specifies filename, validate it exists in `tasks/for_review/`
   - Otherwise, select oldest file in `tasks/for_review/`

3. **Load context**:
   - Read prompt file frontmatter (lane MUST be `for_review`)
   - Read body sections (Objective, Context, Implementation Guidance)
   - Review associated code changes

4. **Conduct the review**:
   - Verify implementation against Definition of Done
   - Run required tests/commands
   - Document findings: bugs, regressions, missing tests, risks

5. **Decide outcome**:

   **Needs changes**:
   - Insert detailed feedback in `## Review Feedback` section:
   ```markdown
   ## Review Feedback

   **Status**: ❌ **Needs Changes**

   **Key Issues**:
   1. [Issue 1] - Why and what to do
   2. [Issue 2] - Why and what to do

   **What Was Done Well**:
   - [Positive note 1]

   **Action Items** (must complete before re-review):
   - [ ] Fix [specific thing 1]
   - [ ] Add [missing thing 2]
   ```
   - Update frontmatter: `lane: "planned"`, `review_status: "has_feedback"`
   - Move task back to planned lane

   **Approved**:
   - Move task to `done/` lane
   - Update `review_status: "approved"`
   - Mark task complete in `tasks.md`

6. **Update tasks.md**: Run `.kittify/scripts/bash/mark-task-status.sh --task-id <TASK_ID> --status done`

7. **Produce review report**:
   - Task ID and filename reviewed
   - Approval status and key findings
   - Tests executed and results
   - Follow-up actions

All review feedback must live inside the prompt file for future reference.

**Next suggested command**: `/spec-kitty.accept` (after all tasks reviewed)

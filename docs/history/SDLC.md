# Software Development Lifecycle (SDLC)

This document describes the spec-kitty workflow for collaborative, multi-agent feature development.

## Overview

The spec-kitty workflow ensures:
- Clear specifications before implementation
- Traceable requirements through artifacts
- Quality gates at each phase
- Support for parallel multi-agent development

---

## Workflow Phases

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SPECIFY   │────▶│   CLARIFY   │────▶│    PLAN     │
│  (spec.md)  │     │ (questions) │     │  (plan.md)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   MERGE     │◀────│   ACCEPT    │◀────│   TASKS     │
│  (branch)   │     │  (checks)   │     │ (tasks.md)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           ▲                   │
                           │                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   REVIEW    │◀────│  IMPLEMENT  │
                    │ (feedback)  │     │  (code)     │
                    └─────────────┘     └─────────────┘
```

---

## Phase Details

### 1. SPECIFY (`/spec-kitty.specify`)

**Purpose:** Create comprehensive feature specification

**Input:** Feature name/description
**Output:** `kitty-specs/<feature>/spec.md`

**Activities:**
- Discovery interview with stakeholder
- Define acceptance criteria
- Identify dependencies
- List constraints and assumptions
- Consider security implications

**Artifacts:**
```
kitty-specs/<feature>/
└── spec.md
```

### 2. CLARIFY (`/spec-kitty.clarify`)

**Purpose:** Resolve ambiguities in specification

**Input:** Existing spec.md
**Output:** Updated spec.md with resolved questions

**Activities:**
- Review specification for gaps
- Ask clarifying questions
- Mark resolved items
- Update acceptance criteria

**Markers:**
- `[NEEDS CLARIFICATION]` - Unresolved question
- `[RESOLVED]` - Clarified item

### 3. PLAN (`/spec-kitty.plan`)

**Purpose:** Create implementation plan

**Input:** Finalized spec.md
**Output:** `kitty-specs/<feature>/plan.md`

**Activities:**
- "Plan interrogation" to validate understanding
- Identify components and changes
- Determine implementation order
- Consider testing strategy
- Review constitutional principles

**Artifacts:**
```
kitty-specs/<feature>/
├── spec.md
└── plan.md
```

### 4. TASKS (`/spec-kitty.tasks`)

**Purpose:** Generate work packages

**Input:** plan.md
**Output:** `kitty-specs/<feature>/tasks.md` or individual task files

**Activities:**
- Break plan into atomic tasks
- Assign task IDs
- Set initial lane (planned)
- Create dependencies graph

**Task Lanes:**
| Lane | Description |
|------|-------------|
| `planned` | Task defined, not started |
| `doing` | In progress |
| `for_review` | Ready for review |
| `done` | Completed and verified |

### 5. IMPLEMENT (`/spec-kitty.implement`)

**Purpose:** Execute work packages

**Input:** Task to implement
**Output:** Code changes, tests

**Activities:**
- Claim task (multi-agent coordination)
- Move to `doing` lane
- Write implementation
- Write tests
- Move to `for_review` lane

**Multi-Agent Protocol:**
```bash
# Register instance
.kittify/scripts/bash/register-instance.sh

# Claim task
.kittify/scripts/bash/claim-task.sh <feature> <task-id>

# Update heartbeat periodically
.kittify/scripts/bash/update-heartbeat.sh
```

### 6. REVIEW (`/spec-kitty.review`)

**Purpose:** Code review and feedback

**Input:** Completed task
**Output:** Review feedback or approval

**Activities:**
- Check code quality
- Verify tests pass
- Review against spec
- Provide feedback using format:
  - ✅ Approved
  - 🔧 Changes requested
  - ❌ Rejected

### 7. ACCEPT (`/spec-kitty.accept`)

**Purpose:** Feature acceptance checks

**Input:** All tasks completed
**Output:** Acceptance status

**Checks:**
- [ ] spec.md exists
- [ ] plan.md exists
- [ ] tasks.md exists
- [ ] All tasks marked done
- [ ] No `[NEEDS CLARIFICATION]` markers
- [ ] Tests pass
- [ ] Build succeeds

### 8. MERGE (`/spec-kitty.merge`)

**Purpose:** Merge feature branch

**Input:** Accepted feature
**Output:** Merged code

**Options:**
- `--strategy merge` - Standard merge
- `--strategy squash` - Squash commits
- `--push` - Push after merge
- `--keep-branch` - Don't delete branch
- `--keep-worktree` - Don't remove worktree

---

## Directory Structure

```
kitty-specs/
├── feature-a/
│   ├── spec.md          # Feature specification
│   ├── plan.md          # Implementation plan
│   ├── tasks.md         # Work packages (summary)
│   └── tasks/           # Individual task files (optional)
│       ├── task-001.md
│       └── task-002.md
├── feature-b/
│   └── ...
└── ...
```

---

## Feature Branch Workflow

### Using Git Worktrees

For parallel feature development:

```bash
# Create feature with worktree
.kittify/scripts/bash/create-new-feature.sh "user-auth"

# Creates:
# .worktrees/042-user-auth/    (worktree)
# kitty-specs/user-auth/       (specs directory)

# Work in the worktree
cd .worktrees/042-user-auth/

# After completion, merge
.kittify/scripts/bash/merge-feature.sh --push
```

### Without Worktrees

```bash
# Create feature branch
git checkout -b feat/user-auth

# Create specs directory
mkdir -p kitty-specs/user-auth

# Work on feature...

# Merge when done
git checkout main
git merge feat/user-auth
```

---

## Multi-Agent Coordination

When multiple Claude instances work on the same project:

### Instance Registration

```bash
.kittify/scripts/bash/register-instance.sh
# Creates: .kittify/.instances/<instance-id>.json
```

### Task Claiming

```bash
# Claim a task
.kittify/scripts/bash/claim-task.sh <feature> <task-id>

# Release a task
.kittify/scripts/bash/release-task.sh <feature> <task-id>
```

### Heartbeat

```bash
# Update heartbeat (prevents stale claim detection)
.kittify/scripts/bash/update-heartbeat.sh
```

### Stale Detection

```bash
# Find instances that haven't updated recently
.kittify/scripts/bash/detect-stale-claims.sh

# Default timeout: 2 hours
```

---

## Quality Commands

| Command | Purpose |
|---------|---------|
| `/spec-kitty.dashboard` | View project status |
| `/spec-kitty.checklist` | Quality checklist |
| `/spec-kitty.constitution` | Non-negotiable principles |
| `/spec-kitty.analyze` | Cross-artifact consistency |

---

## Best Practices

1. **Always start with specification** - Don't skip to implementation
2. **Resolve all clarifications** - No `[NEEDS CLARIFICATION]` markers before planning
3. **Review constitutional principles** - Check before architectural decisions
4. **Atomic tasks** - Each task should be independently completable
5. **Test-first** - Write tests before or with implementation
6. **Update CLAUDE.md** - Keep context file current with changes
7. **Use appropriate persona** - Switch agents for different task types

---

## Troubleshooting

### Task stuck in "doing"

```bash
# Check if instance is active
.kittify/scripts/bash/list-instances.sh

# Detect stale instances
.kittify/scripts/bash/detect-stale-claims.sh

# Release the task
.kittify/scripts/bash/release-task.sh <feature> <task-id>
```

### Acceptance failing

```bash
# Run acceptance checks
.kittify/scripts/bash/accept-feature.sh --feature <slug>

# Check specific issues
.kittify/scripts/bash/accept-feature.sh --json --feature <slug>
```

### Merge conflicts

1. Ensure worktree is up to date with target branch
2. Resolve conflicts manually
3. Run tests to verify
4. Re-run merge command

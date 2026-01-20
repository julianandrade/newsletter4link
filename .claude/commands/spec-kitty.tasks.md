---
description: Generate grouped work packages with actionable subtasks and matching prompt files for the feature.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Location Pre-flight Check (CRITICAL)

Before proceeding, verify you are in the correct working directory:

```bash
git branch --show-current
```

**Expected output:** A feature branch like `001-feature-name`
**If you see `main`:** You are in the wrong location!

**Path reference rule:** Provide absolute paths or paths relative to project root.

## Outline

1. **Setup**: Run `.kittify/scripts/bash/check-prerequisites.sh --json --include-tasks` and capture `FEATURE_DIR` plus `AVAILABLE_DOCS`. All paths must be absolute.

2. **Load design documents** from `FEATURE_DIR`:
   - **Required**: plan.md, spec.md
   - **Optional**: data-model.md, contracts/, research.md, quickstart.md

3. **Derive fine-grained subtasks** (IDs `T001`, `T002`, ...):
   - Parse plan/spec to enumerate implementation steps
   - Capture prerequisites, dependencies, parallelizability markers `[P]`

4. **Roll subtasks into work packages** (IDs `WP01`, `WP02`, ...):
   - Target 4-10 work packages
   - Each should be independently implementable
   - Ensure every subtask appears in exactly one work package

5. **Write `tasks.md`** using template:
   - Location: `FEATURE_DIR/tasks.md`
   - Populate Work Package sections
   - Include: Summary, subtasks, implementation sketch, dependencies

6. **Generate prompt files** (one per work package):
   - **FLAT STRUCTURE**: All WP files go directly in `FEATURE_DIR/tasks/`
   - Filename format: `WPxx-slug.md`
   - Use frontmatter with `work_package_id`, `subtasks`, `lane: "planned"`

7. **Report**: Provide outcome summary:
   - Path to `tasks.md`
   - Work package count and subtask tallies
   - Parallelization highlights
   - Next suggested command

## Task Generation Rules

1. **Subtask derivation**:
   - Assign IDs `Txxx` sequentially
   - Use `[P]` for parallel-safe items
   - Include migrations, data seeding, operational chores

2. **Work package grouping**:
   - Map subtasks to user stories or themes
   - Keep each work package focused on single goal
   - Do not exceed 10 work packages

3. **Prioritization & dependencies**:
   - Sequence: setup → foundational → story phases → polish
   - Call out inter-package dependencies explicitly

4. **Prompt composition**:
   - Mirror subtask order inside the prompt
   - Provide actionable implementation guidance
   - Surface risks, integration points, acceptance gates

**Next suggested command**: `/spec-kitty.implement`

---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
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

## Planning Interrogation (mandatory)

Before generating artifacts, interrogate the specification and stakeholders.

- **Scope proportionality (CRITICAL)**:
  - **Trivial/Test Features**: Ask 1-2 questions about tech stack
  - **Simple Features**: Ask 2-3 questions about tech choices
  - **Complex Features**: Ask 3-5 questions about architecture, NFRs, integrations
  - **Platform/Critical Features**: Full interrogation with 5+ questions

- **First response rule**: Ask a single architecture question and end with `WAITING_FOR_PLANNING_INPUT`

Planning requirements:
1. Maintain a **Planning Questions** table internally (do **not** render to user)
2. When sufficient context gathered, summarize into an **Engineering Alignment** note
3. If user asks to skip questions, proceed with best practices

## Outline

1. **Check planning status**: Stay in one-question cadence until confirmed

2. **Setup**: Run `.kittify/scripts/bash/setup-plan.sh --json` and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH

3. **Load context**: Read FEATURE_SPEC and `.kittify/memory/constitution.md`

4. **Execute plan workflow**:
   - Update Technical Context with explicit statements
   - Fill Constitution Check section
   - Evaluate gates (ERROR if violations)
   - Phase 0: Generate research.md (resolve clarifications)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md

5. **STOP and report**: This command ends after Phase 1 planning

## Phases

### Phase 0: Outline & Research

1. Extract unknowns from Technical Context
2. Generate and dispatch research tasks
3. Consolidate findings in `research.md`:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. Extract entities from feature spec -> `data-model.md`
2. Generate API contracts from functional requirements -> `/contracts/`
3. Update agent context files

## MANDATORY STOP POINT

**This command is COMPLETE after generating planning artifacts.**

Do NOT:
- Generate `tasks.md`
- Create work package files
- Proceed to implementation

**Next suggested command**: `/spec-kitty.tasks`

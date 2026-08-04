---
name: specify-requirement
description: Transform the clarified requirement into a detailed functional specification (product-owner SPECIFY mode). Read requirement and clarifications, synthesize, and produce {req-id}-complete-requirement.md in .claude/docs/requirements/{req-id-name}/. Use when executing step 3 Specify in complete-development or when asked to create the specification.
preferred_agent: product-owner
---

# Specify Requirement

Use this skill when you need to **specify** a requirement: transform the **clarified** requirement (requirement document + completed clarifications) into a **detailed functional specification** and write it as `{req-id}-complete-requirement.md`. This corresponds to **step 3 (Specify)** in complete-development and to **SPECIFY mode** of the product-owner agent (`.claude/agents/general/product-owner.md`).

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 3 — Specify (product-owner)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id. Prefer **product-owner** in SPECIFY mode (`.claude/agents/general/product-owner.md`). If unavailable, main agent executes the procedure. |
| **In flow** | Step 3 invokes product-owner in SPECIFY mode; agent follows this skill. |

Requirements and specs live under **`.claude/docs/requirements/{req-id-name}/`**. Optionally update project spec documentation (e.g. `.claude/docs/specs/`) per project standard. The output is **functional only** (what to build), not technical design; technical specification is produced later by architects in **frontend-development** / **backend-development** (step **4a**, after **`/complete-development`** **4api**).

## Purpose of Specify

- **Synthesize**: Combine the requirement document and the **answered** clarification file into one coherent specification.
- **Detail**: Produce a more detailed functional specification with user stories, acceptance criteria, business rules, workflows, and dependencies.
- **Handoff**: Produce `{req-id}-complete-requirement.md` as input for **`/complete-development`** (through **4api**) and then for architects (step **4a** in each track) and for test planning (step **5** on **frontend-development**).

## When to Use

- Executing **step 3 (Specify)** in the complete-development flow, **after** the user has confirmed that clarifications are completed (step 2).
- When the user asks to "specify", "create specification", "write the complete requirement spec", "generate spec", or similar.
- **Prerequisite**: A clarifications file must exist and **all questions must be answered**; otherwise ask the user to complete clarifications first (Clarify step).

## Document Locations

- **Requirement folder**: `.claude/docs/requirements/{req-id-name}/` (e.g. `RQ-028-feature-name`). Create if it does not exist.
- **Requirement source**: Read from `{req-id}.md` or, if it exists, **`{req-id}-revised.md`** (revised takes precedence). **Never edit** the original `{req-id}.md`; if revisions are needed based on clarifications, create `{req-id}-revised.md` in the same folder.
- **Clarifications**: Read from `{req-id}-clarifications.md` or the **highest numbered** version (`{req-id}-clarifications-1.md`, `-2.md`, …) if the base or numbered files exist.
- **Output**: Write or update `.claude/docs/requirements/{req-id-name}/{req-id}-complete-requirement.md`.
- **Optional**: Update or add documents under `.claude/docs/specs/` per project standard.

## Process

1. **Resolve requirement ID and folder**: From context or arguments, get `{req-id}` and `{req-id-name}`. Ensure the requirement folder exists.
2. **Read the requirement document**: Check for `{req-id}-revised.md` first; if absent, read `{req-id}.md`. Do not edit the original RQ file.
3. **Read the clarifications file**: Look for `{req-id}-clarifications.md` or numbered versions; read the **highest numbered** version. If no clarifications file exists, inform the user that Clarify must be run first and stop. If the file exists but has **unanswered questions**, inform the user that all questions must be answered before creating the specification and stop.
4. **Synthesize**: Combine requirement + clarifications: incorporate all clarification answers, resolve ambiguities, ensure every clarification is reflected in the specification. If revisions to the base requirement are needed, create `{req-id}-revised.md` (copy original, apply revisions); do not edit `{req-id}.md`.
5. **Document conflicts and open questions**: In the specification, explicitly document contradictions (and how they were resolved), areas that remain unclear (Open Questions), assumptions made, and any questions still needing stakeholder input.
6. **Write {req-id}-complete-requirement.md**: Create or update `.claude/docs/requirements/{req-id-name}/{req-id}-complete-requirement.md` with the structure below. When **updating** an existing file, use **change tracking** markers (see below).
7. **Prepare handoff**: Inform the user that the specification is complete and ready for architects, providing the file path, `{req-id-name}` for branch naming, and relevant project documentation references (e.g. Technical Context, Business Rules, Features, Requirements catalogs).

## Complete Requirement Specification Structure

The file `{req-id}-complete-requirement.md` should include (adapt section names to project):

```markdown
# Req ID: {req-id-name}

## Feature Overview

[High-level description of what functionality is being specified]

## User Stories

- As a [role], I want to [action] so that [benefit]
  - Acceptance Criteria:
    - [ ] [Specific, testable criterion]
    - [ ] [Another criterion]

## Functional Requirements

[Detailed list of what the system should do from a user perspective]

## Business Rules

[All validation rules, business logic, and constraints]

## User Roles and Permissions

- {ROLE_1}: [What this role can do]
- {ROLE_2}: [What this role can do]

## Data Requirements

[What data is needed - NOT database structure]

## User Workflows

[Step-by-step description of how users will interact with this feature]

## Dependencies

[What other features, data, or functionality this depends on]

## Open Questions

[List of questions requiring stakeholder clarification]

## Conflicts Identified

[Any contradictory requirements or unclear areas]
```

Content must be **functional** (what to build), not technical implementation. Align with existing project business rules and domain concepts where documented.

## Change Tracking (when updating existing specification)

When **updating** an existing `{req-id}-complete-requirement.md` (not on first creation), mark changed content with:

- **`[NEW]`** — New content added to the specification.
- **`[IMPROVED]`** — Existing content enhanced or improved.
- **`[REVISED]`** — Existing content modified or corrected.

**Format**: Place the marker at the end of the line (or first line of a multi-line block). Example:

```markdown
- {ROLE_1}: Can create, update, and delete entities [NEW]
- {ROLE_2}: Can view and search entities [REVISED]
- New validation rule: Reference must be unique per type [NEW]
```

Use `[NEW]` when adding requirements from clarifications, `[REVISED]` when modifying existing content, `[IMPROVED]` when adding more detail. Omit change tracking for the first creation of the file.

## Guidelines

- **Original RQ protection**: Never edit `.claude/docs/requirements/{req-id-name}/{req-id}.md`. If clarifications imply changes to the base requirement, create `{req-id}-revised.md` with the revised content; subsequent steps use the revised file when present.
- **Clarifications must be completed**: Do not run Specify until the clarifications file exists and all questions are answered; otherwise stop and ask the user to complete clarifications (and confirm step 2).
- **Functional only**: The specification describes **what** the system must do from a user and business perspective, not **how** (no API design, database schema, or technology choices); that is for architects (track step **4a**).
- **Product-owner agent**: For full SPECIFY behavior (domain context, quality standards, handoff), use or align with the product-owner agent (`.claude/agents/general/product-owner.md`) in SPECIFY mode.
- **Quality**: Be complete, clear, specific, and honest; document open questions and conflicts rather than guessing.

## Reference

- **Flow step**: `.claude/commands/complete-development.md` — step 3 **Specify (product-owner)**.
- **Agent (SPECIFY mode)**: `.claude/agents/general/product-owner.md` — Mode 2: SPECIFY (read RQ or revised + clarifications, synthesize, write complete-requirement.md, change tracking, handoff).
- **Prerequisite**: Step 2 — user confirms clarifications are completed before step 3.

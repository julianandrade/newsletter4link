---
name: specify-transaction
description: Transform the clarified Transaction into a detailed functional specification (product-owner SPECIFY mode). Read Transaction and clarifications, synthesize, and produce {tx-id}-complete-transaction.md in {{PATH_DOCS}}/4-implementation/development/{tx-id-name}/. Use when executing step 3 Specify in complete-development or when asked to create the specification.
preferred_agent: product-owner
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Specify Transaction

Use this skill when you need to **specify** a Transaction: transform the **clarified** Transaction (Transaction document + completed clarifications) into a **detailed functional specification** and write it as `{tx-id}-complete-transaction.md`. This corresponds to **step 3 (Specify)** in complete-development and to **SPECIFY mode** of the product-owner agent (`.claude/agents/general/product-owner.md`).

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 3 — Specify (product-owner)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id. Prefer **product-owner** in SPECIFY mode (`.claude/agents/general/product-owner.md`). If unavailable, main agent executes the procedure. |
| **In flow** | Step 3 invokes product-owner in SPECIFY mode; agent follows this skill. |

Transactions and specs live under **`{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`**. The output is **functional only** (what to build), not technical design; technical specification is produced later by architects in **frontend-development** / **backend-development** (step **4a**, after **`/complete-development`** **4api**).

## Purpose of Specify

- **Synthesize**: Combine the Transaction document and the **answered** clarification file into one coherent specification.
- **Detail**: Produce a more detailed functional specification with user stories, acceptance criteria, business rules, workflows, and dependencies.
- **Handoff**: Produce `{tx-id}-complete-transaction.md` as input for **`/complete-development`** (through **4api**) and then for architects (step **4a** in each track) and for test planning (step **5** on **frontend-development**).

## When to Use

- Executing **step 3 (Specify)** in the complete-development flow, **after** the user has confirmed that clarifications are completed (step 2).
- When the user asks to "specify", "create specification", "write the complete Transaction spec", "generate spec", or similar.
- **Prerequisite**: A clarifications file must exist and **all questions must be answered**; otherwise ask the user to complete clarifications first (Clarify step).

## Document Locations

- **Transaction folder**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/` (e.g. `TX-028-feature-name`). Create if it does not exist.
- **Transaction source**: Read from `{tx-id}.md` or, if it exists, **`{tx-id}-revised.md`** (revised takes precedence). **Never edit** the original `{tx-id}.md`; if revisions are needed based on clarifications, create `{tx-id}-revised.md` in the same folder.
- **Clarifications**: Read from `{tx-id}-clarifications.md` or the **highest numbered** version (`{tx-id}-clarifications-1.md`, `-2.md`, …) if the base or numbered files exist.
- **Output**: Write or update `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}-complete-transaction.md`.

## Process

1. **Resolve Transaction ID and folder**: From context or arguments, get `{tx-id}` and `{tx-id-name}`. Ensure the Transaction folder exists.
2. **Read the Transaction document**: Check for `{tx-id}-revised.md` first; if absent, read `{tx-id}.md`. Do not edit the original RQ file.
3. **Read the clarifications file**: Look for `{tx-id}-clarifications.md` or numbered versions; read the **highest numbered** version. If no clarifications file exists, inform the user that Clarify must be run first and stop. If the file exists but has **unanswered questions**, inform the user that all questions must be answered before creating the specification and stop.
4. **Read cross-cutting clarifications (optional)**: Check whether `{{PATH_DOCS}}/core/clarifications/clarification_questions.md` exists. If it does not → skip, continue normally. If it exists → read it and extract only the questions whose `**Affects:**` field contains the current TX/NTI ID. Answered questions inform the synthesis in the next step. Questions with `_<to be filled by dev team>_` (or any blank/placeholder answer) are open and must be listed under **Open Questions** in the output.
5. **Synthesize**: Combine Transaction + clarifications (TX-level and cross-cutting): incorporate all clarification answers, resolve ambiguities, ensure every clarification is reflected in the specification. If revisions to the base Transaction are needed, create `{tx-id}-revised.md` (copy original, apply revisions); do not edit `{tx-id}.md`.
6. **Document conflicts and open questions**: In the specification, explicitly document contradictions (and how they were resolved), areas that remain unclear (Open Questions), assumptions made, and any questions still needing stakeholder input — including open cross-cutting questions from step 4.
7. **Write {tx-id}-complete-transaction.md**: Create or update `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}-complete-transaction.md` with the structure below. When **updating** an existing file, use **change tracking** markers (see below).
8. **Prepare handoff**: Inform the user that the specification is complete and ready for architects, providing the file path, `{tx-id-name}` for branch naming, and relevant project documentation references (e.g. Technical Context, Business Rules, Features, Transactions catalogs).

## Complete Transaction Specification Structure

The file `{tx-id}-complete-transaction.md` should include (adapt section names to project):

```markdown
# Transaction ID: {tx-id-name}

## Feature Overview

[High-level description of what functionality is being specified]

## User Stories

- As a [role], I want to [action] so that [benefit]
  - Acceptance Criteria:
    - [ ] [Specific, testable criterion]
    - [ ] [Another criterion]

## Functional Transactions

[Detailed list of what the system should do from a user perspective]

## Business Rules

[All validation rules, business logic, and constraints]

## User Roles and Permissions

- {ROLE_1}: [What this role can do]
- {ROLE_2}: [What this role can do]

## Data Transactions

[What data is needed - NOT database structure]

## User Workflows

[Step-by-step description of how users will interact with this feature]

## Dependencies

[What other features, data, or functionality this depends on]

## Open Questions

[List of questions requiring stakeholder clarification]

## Conflicts Identified

[Any contradictory Transactions or unclear areas]
```

Content must be **functional** (what to build), not technical implementation. Align with existing project business rules and domain concepts where documented.

## Change Tracking (when updating existing specification)

When **updating** an existing `{tx-id}-complete-transaction.md` (not on first creation), mark changed content with:

- **`[NEW]`** — New content added to the specification.
- **`[IMPROVED]`** — Existing content enhanced or improved.
- **`[REVISED]`** — Existing content modified or corrected.

**Format**: Place the marker at the end of the line (or first line of a multi-line block). Example:

```markdown
- {ROLE_1}: Can create, update, and delete entities [NEW]
- {ROLE_2}: Can view and search entities [REVISED]
- New validation rule: Reference must be unique per type [NEW]
```

Use `[NEW]` when adding Transactions from clarifications, `[REVISED]` when modifying existing content, `[IMPROVED]` when adding more detail. Omit change tracking for the first creation of the file.

## Guidelines

- **Original RQ protection**: Never edit `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}.md`. If clarifications imply changes to the base Transaction, create `{tx-id}-revised.md` with the revised content; subsequent steps use the revised file when present.
- **Clarifications must be completed**: Do not run Specify until the clarifications file exists and all questions are answered; otherwise stop and ask the user to complete clarifications (and confirm step 2).
- **Functional only**: The specification describes **what** the system must do from a user and business perspective, not **how** (no API design, database schema, or technology choices); that is for architects (track step **4a**).
- **Product-owner agent**: For full SPECIFY behavior (domain context, quality standards, handoff), use or align with the product-owner agent (`.claude/agents/general/product-owner.md`) in SPECIFY mode.
- **Quality**: Be complete, clear, specific, and honest; document open questions and conflicts rather than guessing.
- **Cross-cutting clarifications are read-only**: Never write or modify `{{PATH_DOCS}}/core/clarifications/clarification_questions.md`. It is strictly an input; its absence must never block execution.

## Reference

- **Flow step**: `.claude/commands/complete-development.md` — step 3 **Specify (product-owner)**.
- **Agent (SPECIFY mode)**: `.claude/agents/general/product-owner.md` — Mode 2: SPECIFY (read RQ or revised + clarifications, synthesize, write complete-transaction.md, change tracking, handoff).
- **Prerequisite**: Step 2 — user confirms clarifications are completed before step 3.

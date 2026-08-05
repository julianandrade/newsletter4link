---
name: clarify-transaction
description: Run Transaction clarification (product-owner CLARIFY mode). Analyze Transaction documents, raise questions and risks, and record clarifications in {{PATH_DOCS}}/4-implementation/development/{tx-id}/. Use when executing step 1 Clarify in complete-development or when asked to clarify Transactions.
# preferred_agent: product-owner
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Clarify Transaction

Use this skill when you need to **clarify** a Transaction: analyze the Transaction document, identify areas needing clarification (questions, risks, missing or contradictory details), and **record** the clarification questions in the appropriate Transaction folder so stakeholders can fill them in. This corresponds to **step 1 (Clarify)** in complete-development and to **CLARIFY mode** of the product-owner agent (`.claude/agents/general/product-owner.md`). **Skip** when `features.clarifications` is `false` in `settings.json`.

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 1 — Clarify (product-owner)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id. Prefer **product-owner** in CLARIFY mode (`.claude/agents/general/product-owner.md`). If unavailable, main agent executes the procedure. |
| **In flow** | Step 1 invokes product-owner in CLARIFY mode; agent follows this skill. |

Transactions live under **`{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`** (e.g. `{{PATH_DOCS}}/4-implementation/development/TX-028-feature-name/`). The clarification output is a markdown file with numbered questions and blank answer spaces; the agent **does not** create the specification in this step.

## Purpose of Clarify

- **Raise questions**: Identify ambiguous, missing, or contradictory information in the Transaction.
- **Surface risks**: Call out unclear workflows, unspecified edge cases, or undefined roles/permissions.
- **Record for stakeholders**: Write clarification questions in a structured file under the Transaction folder; stakeholders fill in answers before the next step (Specify).

## When to Use

- Executing **step 1 (Clarify)** in the complete-development flow, after step 0 (Validate Transaction) has passed.
- When the user asks to "clarify", "analyze Transactions", "identify clarification needs", or similar.
- Before **Specify**: clarification must be completed (and user must confirm) before creating the complete-transaction specification.

## Transaction Document Location and Reading

- **Folder**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/` (e.g. `TX-028-feature-name`). Create the folder if it does not exist.
- **Source file**: Read the Transaction from `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}.md` or, if it exists, **`{tx-id}-revised.md`** (revised takes precedence). **Never edit** the original `{tx-id}.md`; if revisions are needed, create `{tx-id}-revised.md` instead.
- **Clarifications output**: Write to `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}-clarifications.md` or a **numbered** version (e.g. `{tx-id}-clarifications-1.md`, `-2.md`) if the base or a numbered file already exists — **never overwrite**; always create a new numbered version when a file already exists.

## Process

1. **Resolve Transaction ID and folder**: From context or arguments, get `{tx-id}` (e.g. `TX-028`) and derive `{tx-id-name}` (e.g. `TX-028-feature-name`). Ensure the Transaction folder exists under `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`.
2. **Read the Transaction document**: Check for `{tx-id}-revised.md` first; if absent, read `{tx-id}.md`. Do not edit the original RQ file.
3. **Validate Transaction definition and scope (optional but recommended)**: Read `{{PATH_DOCS}}/4-implementation/development/README.md`. If the content does **not** qualify as one Transaction or **should be split**, inform the user (suggest split in format RQ_XXX_01, RQ_XXX_02, … or rewrite) and state that permission must be requested before clarifying each split; you may still create the clarifications file and include a "Scope & splitting" question, or stop without creating it depending on project flow.
4. **Analyze the Transaction**: Identify ambiguities, missing information, contradictions, unclear business rules, workflows, validations, edge cases, and role/permission gaps.
5. **Read prior implemented transactions**: Before writing questions, glob for all `*-complete-transaction.md` files under `{{PATH_DOCS}}/4-implementation/development/` and read them to extract patterns (business rules, workflows, permissions, naming conventions, edge cases).
5b. **Read functional and technical documentation (if present)**: Check whether `{{PATH_DOCS}}/1-analysis/functional-documentation/` exists; if so, read its files. Check whether `{{PATH_DOCS}}/3-design/technical-documentation/` exists; if so, read its files. Use this context to better inform the `Suggestion:` field for each question — domain concepts, data models, workflows, and conventions described there should be cited in suggestions when relevant.
6. **Create the clarifications file**: In `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`, create a **new** file: `{tx-id}-clarifications.md` if no clarification file exists, or `{tx-id}-clarifications-N.md` (next N) if the base or numbered files exist. Never overwrite an existing clarifications file.
7. **Write questions with Suggestions**: Populate the file with **numbered questions**. Each question has two fields: `Answer:` (blank — stakeholder fills) and `Suggestion:` (filled by agent — see format below). Organize by categories (see below). Do not include status columns.
8. **Inform the user**: Tell the user the path of the created file and that stakeholders should fill in answers in the blank spaces and review the Suggestions. If a split was suggested in step 3, remind the user. **Stop** — do not create the specification in Clarify.

## Clarification Categories and Question Types

Organize questions by category. Include only questions; leave answers blank for stakeholders.

- **Business Rules & Validations**: validation rules, business rules, edge cases, behavior on validation failure, error messages, constraints.
- **User Workflows & Interactions**: step-by-step workflow, actions and order, cancel behavior, confirmations, feedback per action.
- **Data & State Management**: required vs optional data, formats, validation (format, range, uniqueness), state transitions, error handling for data entry.
- **User Roles & Permissions**: which roles can do which actions, role-specific restrictions, behavior for unauthorized attempts.
- **Edge Cases & Error Handling**: error scenarios, missing/invalid data, timeouts, concurrency, deleted/deactivated related entities.
- **Dependencies & Integration**: dependencies on other features or data, system dependencies, interaction with existing features.
- **Ambiguous or Contradictory Transactions**: contradictions in the Transaction, clarification of vague statements, request for examples when descriptions are vague.
- **Scope & splitting (if applicable)**: how the stakeholder wishes to split the Transaction (e.g. RQ_XXX_01, RQ_XXX_02) when split was suggested.

## Clarifications File Format

Use markdown. Structure:

```markdown
# Clarifications for {tx-id}

## Instructions

Please answer each question below in the space after "Answer:". A "Suggestion" is provided for each question based on analysis of prior implemented transactions or domain best practices — use it as a starting point, not a constraint.

## Category Name

Q1. [Question text]

Answer:


Suggestion: [Agent fills this — cite prior transaction(s) by name if a relevant pattern exists and explain why it applies. If no prior transaction is relevant, give best-practice guidance with reasoning. Never leave blank.]

Q2. [Question text]

Answer:


Suggestion: [Agent fills this — same rules as above.]

## Next Category Name

Q3. [Question text]

Answer:


Suggestion: [Agent fills this — same rules as above.]
```

**Formatting rules**:

- Number questions sequentially (Q1, Q2, Q3, …) across all categories.
- Group by category with `##` section headers.
- Each question on its own line: `Q{number}. [Question text]`.
- After `Answer:` leave two blank lines for the stakeholder response.
- `Suggestion:` immediately follows — filled by agent, never blank.
- If a prior `*-complete-transaction.md` has a relevant pattern, cite it by name and explain why. If none is relevant, provide best-practice guidance with reasoning.
- Do **not** include status columns.
- Reference specific parts of the Transaction when relevant (e.g. "In section X, it mentions...").

## Clarifications File Location

- **Path**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}-clarifications.md` or `{tx-id}-clarifications-N.md` (when base or numbered file already exists).
- **Rule**: Never overwrite an existing clarifications file; always create a new file (base or next numbered version).

## Guidelines

- **Original RQ protection**: Never edit `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/{tx-id}.md`. If revisions are needed, create `{tx-id}-revised.md` instead; both CLARIFY and later steps use the revised file when present.
- **No specification in Clarify**: This skill only produces the clarification questions file. It does **not** create `{tx-id}-complete-transaction.md`; that is done in **Specify** (step 3) after the user has completed clarifications.
- **Product-owner agent**: For full CLARIFY behavior (file structure checks, flat-structure migration, domain context), use or align with the product-owner agent (`.claude/agents/general/product-owner.md`) in CLARIFY mode.
- **Validate before or during Clarify**: Optionally use the **validate-transaction** skill before or during Clarify; if the Transaction does not qualify or should be split, report to the user and optionally still create clarifications with a scope/splitting question.

## Reference

- **Flow step**: `.claude/commands/complete-development.md` — step 1 **Clarify (product-owner)**.
- **Agent (CLARIFY mode)**: `.claude/agents/general/product-owner.md` — Mode 1: CLARIFY (read RQ or revised, validate scope, analyze, create clarifications file, never overwrite, no specification).
- **Transaction definition and split**: `{{PATH_DOCS}}/4-implementation/development/README.md`.

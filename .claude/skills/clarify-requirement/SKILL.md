---
name: clarify-requirement
description: Run requirement clarification (product-owner CLARIFY mode). Analyze requirement documents, raise questions and risks, and record clarifications in .claude/docs/requirements/{req-id}/. Use when executing step 1 Clarify in complete-development or when asked to clarify requirements.
# preferred_agent: product-owner
---

# Clarify Requirement

Use this skill when you need to **clarify** a requirement: analyze the requirement document, identify areas needing clarification (questions, risks, missing or contradictory details), and **record** the clarification questions in the appropriate requirement folder so stakeholders can fill them in. This corresponds to **step 1 (Clarify)** in complete-development and to **CLARIFY mode** of the product-owner agent (`.claude/agents/general/product-owner.md`).

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 1 — Clarify (product-owner)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id. Prefer **product-owner** in CLARIFY mode (`.claude/agents/general/product-owner.md`). If unavailable, main agent executes the procedure. |
| **In flow** | Step 1 invokes product-owner in CLARIFY mode; agent follows this skill. |

Requirements live under **`.claude/docs/requirements/{req-id-name}/`** (e.g. `.claude/docs/requirements/RQ-028-feature-name/`). The clarification output is a markdown file with numbered questions and blank answer spaces; the agent **does not** create the specification in this step.

## Purpose of Clarify

- **Raise questions**: Identify ambiguous, missing, or contradictory information in the requirement.
- **Surface risks**: Call out unclear workflows, unspecified edge cases, or undefined roles/permissions.
- **Record for stakeholders**: Write clarification questions in a structured file under the requirement folder; stakeholders fill in answers before the next step (Specify).

## When to Use

- Executing **step 1 (Clarify)** in the complete-development flow, after step 0 (Validate requirement) has passed.
- When the user asks to "clarify", "analyze requirements", "identify clarification needs", or similar.
- Before **Specify**: clarification must be completed (and user must confirm) before creating the complete-requirement specification.

## Requirement Document Location and Reading

- **Folder**: `.claude/docs/requirements/{req-id-name}/` (e.g. `RQ-028-feature-name`). Create the folder if it does not exist.
- **Source file**: Read the requirement from `.claude/docs/requirements/{req-id-name}/{req-id}.md` or, if it exists, **`{req-id}-revised.md`** (revised takes precedence). **Never edit** the original `{req-id}.md`; if revisions are needed, create `{req-id}-revised.md` instead.
- **Clarifications output**: Write to `.claude/docs/requirements/{req-id-name}/{req-id}-clarifications.md` or a **numbered** version (e.g. `{req-id}-clarifications-1.md`, `-2.md`) if the base or a numbered file already exists — **never overwrite**; always create a new numbered version when a file already exists.

## Process

1. **Resolve requirement ID and folder**: From context or arguments, get `{req-id}` (e.g. `RQ-028`) and derive `{req-id-name}` (e.g. `RQ-028-feature-name`). Ensure the requirement folder exists under `.claude/docs/requirements/{req-id-name}/`.
2. **Read the requirement document**: Check for `{req-id}-revised.md` first; if absent, read `{req-id}.md`. Do not edit the original RQ file.
3. **Validate requirement definition and scope (optional but recommended)**: Read `.claude/docs/requirements/README.md`. If the content does **not** qualify as one requirement or **should be split**, inform the user (suggest split in format RQ_XXX_01, RQ_XXX_02, … or rewrite) and state that permission must be requested before clarifying each split; you may still create the clarifications file and include a "Scope & splitting" question, or stop without creating it depending on project flow.
4. **Analyze the requirement**: Identify ambiguities, missing information, contradictions, unclear business rules, workflows, validations, edge cases, and role/permission gaps.
5. **Create the clarifications file**: In `.claude/docs/requirements/{req-id-name}/`, create a **new** file: `{req-id}-clarifications.md` if no clarification file exists, or `{req-id}-clarifications-N.md` (next N) if the base or numbered files exist. Never overwrite an existing clarifications file.
6. **Write questions only**: Populate the file with **numbered questions** and **blank answer spaces** for stakeholders. Do not include answers, status, or assumptions. Organize by categories (see below).
7. **Inform the user**: Tell the user the path of the created file and that stakeholders should fill in answers in the blank spaces; remind that clarification contains only questions. If a split was suggested in step 3, remind the user. **Stop** — do not create the specification in Clarify.

## Clarification Categories and Question Types

Organize questions by category. Include only questions; leave answers blank for stakeholders.

- **Business Rules & Validations**: validation rules, business rules, edge cases, behavior on validation failure, error messages, constraints.
- **User Workflows & Interactions**: step-by-step workflow, actions and order, cancel behavior, confirmations, feedback per action.
- **Data & State Management**: required vs optional data, formats, validation (format, range, uniqueness), state transitions, error handling for data entry.
- **User Roles & Permissions**: which roles can do which actions, role-specific restrictions, behavior for unauthorized attempts.
- **Edge Cases & Error Handling**: error scenarios, missing/invalid data, timeouts, concurrency, deleted/deactivated related entities.
- **Dependencies & Integration**: dependencies on other features or data, system dependencies, interaction with existing features.
- **Ambiguous or Contradictory Requirements**: contradictions in the requirement, clarification of vague statements, request for examples when descriptions are vague.
- **Scope & splitting (if applicable)**: how the stakeholder wishes to split the requirement (e.g. RQ_XXX_01, RQ_XXX_02) when split was suggested.

## Clarifications File Format

Use markdown. Structure:

```markdown
# Clarifications for {req-id}

## Instructions

Please answer each question below. Leave your answer in the space provided after each question.

## Category Name

Q1. [Question text]

Answer:
[Leave blank line for stakeholder to fill]

Q2. [Question text]

Answer:
[Leave blank line for stakeholder to fill]

## Next Category Name

Q3. [Question text]

Answer:
[Leave blank line for stakeholder to fill]
```

**Formatting rules**:

- Number questions sequentially (Q1, Q2, Q3, …) across all categories.
- Group by category with `##` section headers.
- Each question on its own line: `Q{number}. [Question text]`.
- After `Answer:` leave a blank line for the response.
- Do **not** include status, justifications, or answers — only questions.
- Do **not** make assumptions or suggest answers.
- Reference specific parts of the requirement when relevant (e.g. "In section X, it mentions...").

## Clarifications File Location

- **Path**: `.claude/docs/requirements/{req-id-name}/{req-id}-clarifications.md` or `{req-id}-clarifications-N.md` (when base or numbered file already exists).
- **Rule**: Never overwrite an existing clarifications file; always create a new file (base or next numbered version).

## Guidelines

- **Original RQ protection**: Never edit `.claude/docs/requirements/{req-id-name}/{req-id}.md`. If revisions are needed, create `{req-id}-revised.md` instead; both CLARIFY and later steps use the revised file when present.
- **No specification in Clarify**: This skill only produces the clarification questions file. It does **not** create `{req-id}-complete-requirement.md`; that is done in **Specify** (step 3) after the user has completed clarifications.
- **Product-owner agent**: For full CLARIFY behavior (file structure checks, flat-structure migration, domain context), use or align with the product-owner agent (`.claude/agents/general/product-owner.md`) in CLARIFY mode.
- **Validate before or during Clarify**: Optionally use the **validate-requirement** skill before or during Clarify; if the requirement does not qualify or should be split, report to the user and optionally still create clarifications with a scope/splitting question.

## Reference

- **Flow step**: `.claude/commands/complete-development.md` — step 1 **Clarify (product-owner)**.
- **Agent (CLARIFY mode)**: `.claude/agents/general/product-owner.md` — Mode 1: CLARIFY (read RQ or revised, validate scope, analyze, create clarifications file, never overwrite, no specification).
- **Requirement definition and split**: `.claude/docs/requirements/README.md`.

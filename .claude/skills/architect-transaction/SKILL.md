---
name: architect-transaction
description: Generate technical specification from complete Transaction. Choose backend-architect or frontend-architect based on scope. Use when executing step 4a in frontend-development or backend-development (after complete-development trunk through 4api), or when asked to create tech-spec or design architecture for a Transaction.
# preferred_agent: backend-architect
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Architect Transaction

Use this skill when you need to **generate the technical specification** (tech-spec) from the technical solution Transaction. This corresponds to **step 4a** in **`/frontend-development`** or **`/backend-development`** (after the **`/complete-development`** trunk through **4api**). The architect(s) produce architectural decisions, implementation blueprints, and file structure for developers.

## Where Used

- **frontend-development** / **backend-development** (`.claude/commands/frontend-development.md`, `.claude/commands/backend-development.md`): step **4a** — Architect (scoped per track)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id. Prefer launching **backend-architect** (`.claude/agents/backend/backend-architect.md`) or **frontend-architect** (`.claude/agents/frontend/frontend-architect.md`) depending on Transaction scope. If unavailable, main agent executes the procedure. |
| **In flow** | In each track command, step 4a invokes backend-architect or frontend-architect; agent follows this skill. |

## Purpose

- **Tech-spec**: Translate technical-solution-transaction into technical specifications (`{tx-id}-backend-tech-spec.md`, `{tx-id}-frontend-tech-spec.md`).
- **Architect selection**: Use `{tx-id}-technical-solution-transaction.md` to determine which architect(s) to invoke (backend-architect, frontend-architect, or both).
- **Handoff**: Output feeds step 4b (security review), step 5 (test-plan), and step 6 (developer).

## When to Use

- Executing **step 4a** in **frontend-development** or **backend-development**, after **`/complete-development`** has produced **OpenAPI (4api)** and `{tx-id}-technical-solution-transaction.md`.
- When asked to create tech-spec, design architecture, or produce technical specification for a Transaction.

## Agent Selection

Scope is defined in `{tx-id}-technical-solution-transaction.md`:

| Scope from technical-solution-transaction | Agent |
|------------------------------------------|-------|
| Backend scope | **backend-architect** |
| Frontend scope | **frontend-architect** |
| Both | Both; coordinate per technical-solution-transaction |

## Inputs

- **Technical solution Transaction**: `{tx-id}-technical-solution-transaction.md` in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`.
- **Complete Transaction**: `{tx-id}-complete-transaction.md`.
- **Clarifications**: Completed clarifications if applicable.
- **Project context**: Tech stack, existing patterns, database schema (for backend).

## Process

1. **Resolve paths**: Get `{tx-id}` and `{tx-id-name}`. Transaction folder: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`.
2. **Read technical-solution-transaction**: Determine backend and/or frontend scope.
3. **Invoke architect(s)**: Pass the relevant portion of technical-solution-transaction, complete-transaction, clarifications, project context.
4. **Output location**: Tech-spec in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/` as `{tx-id}-backend-tech-spec.md` and/or `{tx-id}-frontend-tech-spec.md` (per scope).
5. **Handoff**: In the active track, step **4b** (architecture-security-review) runs next if `features.security` is `true` in `settings.json`.

## Outputs

- **Tech-spec**: Technical specification document with architectural decisions, file structure, implementation guidelines.
- **Location**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/` or project specs location.

## Post-generation Validation (mandatory for frontend tech specs)

After producing `{tx-id}-frontend-tech-spec.md`, scan the spec for any screen that combines **inline-edit rows** with **LOV/search modals** (or any modal opened from within an editable table row). For each such screen found, verify the tech spec explicitly documents all three of the following before handing off to step 4b:

- [ ] **Focus contract**: the row stays in its current edit state while the modal is open; focus must not escape the modal; the row's auto-commit must not fire while the modal is active.
- [ ] **Focus trap**: the modal component traps `Tab`/`Shift+Tab` within itself until dismissed.
- [ ] **Commit guard**: the row's blur-to-commit handler is suppressed when a modal it triggered is open (e.g. via an `isLovOpen` prop or equivalent mechanism).

If any of these three points is missing from the tech spec, add it before proceeding to step 4b.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **4a** **Architect**.
- **Agents**: `.claude/agents/backend/backend-architect.md`, `.claude/agents/frontend/frontend-architect.md`.
- **Next step**: architecture-security-review (4b) if `features.security` is `true` in `settings.json`.

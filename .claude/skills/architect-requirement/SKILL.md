---
name: architect-requirement
description: Generate technical specification from complete requirement. Choose backend-architect or frontend-architect based on scope. Use when executing step 4a in frontend-development or backend-development (after complete-development trunk through 4api), or when asked to create tech-spec or design architecture for a requirement.
# preferred_agent: backend-architect
---

# Architect Requirement

Use this skill when you need to **generate the technical specification** (tech-spec) from the technical solution requirement. This corresponds to **step 4a** in **`/frontend-development`** or **`/backend-development`** (after the **`/complete-development`** trunk through **4api**). The architect(s) produce architectural decisions, implementation blueprints, and file structure for developers.

## Where Used

- **frontend-development** / **backend-development** (`.claude/commands/frontend-development.md`, `.claude/commands/backend-development.md`): step **4a** — Architect (scoped per track)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id. Prefer launching **backend-architect** (`.claude/agents/backend/backend-architect.md`) or **frontend-architect** (`.claude/agents/frontend/frontend-architect.md`) depending on requirement scope. If unavailable, main agent executes the procedure. |
| **In flow** | In each track command, step 4a invokes backend-architect or frontend-architect; agent follows this skill. |

## Purpose

- **Tech-spec**: Translate technical-solution-requirement into technical specifications (`{req-id}-backend-tech-spec.md`, `{req-id}-frontend-tech-spec.md`).
- **Architect selection**: Use `{req-id}-technical-solution-requirement.md` to determine which architect(s) to invoke (backend-architect, frontend-architect, or both).
- **Handoff**: Output feeds step 4b (security review), step 5 (test-plan), and step 6 (developer).

## When to Use

- Executing **step 4a** in **frontend-development** or **backend-development**, after **`/complete-development`** has produced **OpenAPI (4api)** and `{req-id}-technical-solution-requirement.md`.
- When asked to create tech-spec, design architecture, or produce technical specification for a requirement.

## Agent Selection

Scope is defined in `{req-id}-technical-solution-requirement.md`:

| Scope from technical-solution-requirement | Agent |
|------------------------------------------|-------|
| Backend scope | **backend-architect** |
| Frontend scope | **frontend-architect** |
| Both | Both; coordinate per technical-solution-requirement |

## Inputs

- **Technical solution requirement**: `{req-id}-technical-solution-requirement.md` in `.claude/docs/requirements/{req-id-name}/`.
- **Complete requirement**: `{req-id}-complete-requirement.md`.
- **Clarifications**: Completed clarifications if applicable.
- **Project context**: Tech stack, existing patterns, database schema (for backend).

## Process

1. **Resolve paths**: Get `{req-id}` and `{req-id-name}`. Requirement folder: `.claude/docs/requirements/{req-id-name}/`.
2. **Read technical-solution-requirement**: Determine backend and/or frontend scope.
3. **Invoke architect(s)**: Pass the relevant portion of technical-solution-requirement, complete-requirement, clarifications, project context.
4. **Output location**: Tech-spec in `.claude/docs/requirements/{req-id-name}/` as `{req-id}-backend-tech-spec.md` and/or `{req-id}-frontend-tech-spec.md` (per scope).
5. **Handoff**: In the active track, step **4b** (architecture-security-review) runs next if not `--no-security`.

## Outputs

- **Tech-spec**: Technical specification document with architectural decisions, file structure, implementation guidelines.
- **Location**: `.claude/docs/requirements/{req-id-name}/` or project specs location.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **4a** **Architect**.
- **Agents**: `.claude/agents/backend/backend-architect.md`, `.claude/agents/frontend/frontend-architect.md`.
- **Next step**: architecture-security-review (4b) if not `--no-security`.

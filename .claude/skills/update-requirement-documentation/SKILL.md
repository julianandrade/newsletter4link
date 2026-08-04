---
name: update-requirement-documentation
description: Validate app vs documentation and update project docs (README, architecture, API). Use when executing step 9 in frontend-development or backend-development, or when asked to validate or update documentation. Skip if --no-tests.
preferred_agent: req-checker
---

# Update Requirement Documentation

Use this skill when you need to **validate** whether documentation (BR, RQ, specs) matches implemented app behavior and **update** project documentation (README, architecture docs, API docs) with the new functionality. This corresponds to **step 9** in **`/frontend-development`** or **`/backend-development`**. **Skip** when `--no-tests` is set. Does not re-enter the fix loop.

## Where Used

- **frontend-development** / **backend-development**: step **9** — Documentation Update (req-checker)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id and app URL. Prefer launching **req-checker** (`.claude/agents/tests/req-checker.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Step 9 invokes req-checker; agent follows this skill. |

## Purpose

- **Validation**: Navigate app (Playwright MCP), cross-check with `.claude/docs` (BR-*, RQ-*, specs).
- **Gap analysis**: Identify missing, incorrect, or incomplete documentation.
- **Update**: Update README, architecture docs, API docs to reflect implemented functionality.
- **Report**: Generate validation report in reqs-check/.

## When to Use

- Executing **step 9** in **frontend-development** or **backend-development**, after step **8** (Code-tagger).
- When asked to validate documentation, update docs, or check app vs specs.

## Inputs

- **App URL**: For navigation and validation.
- **Requirement folder**: `{req-id-name}` for docs and report paths.
- **Documentation**: `{req-id}-complete-requirement.md`, tech-spec, specs in `.claude/docs/requirements/{req-id-name}/`.

## Process

1. **Navigate app**: Use Playwright MCP to explore screens, flows, and features.
2. **Read documentation**: Complete-requirement, tech-spec, BR-*, RQ-*.
3. **Cross-validate**: Compare app behavior with documented BR, RQ, screens, flows.
4. **Identify gaps**: Missing docs, incorrect docs, undocumented features.
5. **Update project docs**: README, architecture docs, API docs as needed.
6. **Generate report**: Save in `.claude/docs/requirements/{req-id-name}/tests/reqs-check/` (never in project under test).

## Outputs

- **Validation report**: Accuracy, completeness, recommendations.
- **Updated docs**: README, architecture, API docs with new functionality.
- **Report location**: `.claude/docs/requirements/{req-id-name}/tests/reqs-check/`.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **9** **Documentation Update**.
- **Preferred agent**: `.claude/agents/tests/req-checker.md`.

---
name: update-transaction-documentation
description: Validate app vs documentation and update project docs (README, architecture, API). Use when executing step 9 in frontend-development or backend-development, or when asked to validate or update documentation. Skip if features.test is false in settings.json.
preferred_agent: tx-checker
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Update Transaction Documentation

Use this skill when you need to **validate** whether documentation (BR, RQ, specs) matches implemented app behavior and **update** project documentation (README, architecture docs, API docs) with the new functionality. This corresponds to **step 9** in **`/frontend-development`** or **`/backend-development`**. **Skip** when `features.test` is `false` in `settings.json`. Does not re-enter the fix loop.

## Where Used

- **frontend-development** / **backend-development**: step **9** — Documentation Update (tx-checker)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id and app URL. Prefer launching **tx-checker** (`.claude/agents/tests/tx-checker.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Step 9 invokes tx-checker; agent follows this skill. |

## Purpose

- **Validation**: Navigate app (Playwright MCP), cross-check with `{{PATH_DOCS}}` (BR-*, TX-*, specs).
- **Gap analysis**: Identify missing, incorrect, or incomplete documentation.
- **Update**: Update README, architecture docs, API docs to reflect implemented functionality.
- **Report**: Generate validation report in reqs-check/.

## When to Use

- Executing **step 9** in **frontend-development** or **backend-development**, after step **8** (Code-tagger).
- When asked to validate documentation, update docs, or check app vs specs.

## Inputs

- **App URL**: For navigation and validation.
- **Transaction folder**: `{tx-id-name}` for docs and report paths.
- **Documentation**: `{tx-id}-complete-transaction.md`, tech-spec, specs in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`.

## Process

1. **Navigate app**: Use Playwright MCP to explore screens, flows, and features.
2. **Read documentation**: complete-transaction, tech-spec, BR-*, TX-*.
3. **Cross-validate**: Compare app behavior with documented BR, RQ, screens, flows.
4. **Identify gaps**: Missing docs, incorrect docs, undocumented features.
5. **Update project docs**: README, architecture docs, API docs as needed.
6. **Generate report**: Save in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/` (never in project under test).

## Outputs

- **Validation report**: Accuracy, completeness, recommendations.
- **Updated docs**: README, architecture, API docs with new functionality.
- **Report location**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/`.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **9** **Documentation Update**.
- **Preferred agent**: `.claude/agents/tests/tx-checker.md`.

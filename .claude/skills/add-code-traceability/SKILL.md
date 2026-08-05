---
name: add-code-traceability
description: Add Transaction traceability tags (TX-XXX, BR-*) to generated code. Use when executing step 8 in frontend-development or backend-development, or when asked to add Transaction tags to code.
preferred_agent: code-tagger
---

# Add Code Traceability

Use this skill when you need to **add Transaction traceability tags** (tx-id and BR IDs) to newly created code. This corresponds to **step 8** in **`/frontend-development`** or **`/backend-development`**, after all tests and code security pass (or after step **6** if step **7** is skipped).

## Where Used

- **frontend-development** / **backend-development**: step **8** — Code-tagger (scope to the track’s changes)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id and branch/commit context. Prefer launching **code-tagger** (`.claude/agents/general/code-tagger.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Each track command: step **8** invokes code-tagger; agent follows this skill. |

## Purpose

- **Traceability**: Tag code blocks with TX-XXX-{feature-name} and BR-XXXX, BR-YYYY.
- **Git diff**: Identify new code via diff against develop branch.
- **Language patterns**: C#, TypeScript, YAML, etc. use appropriate comment syntax.

## When to Use

- Executing **step 8** in **frontend-development** or **backend-development**, after loop **7** completes successfully.
- When asked to add Transaction tags, tag code for traceability, or add TX/BR comments.

## Inputs

- **Feature branch**: Branch with implemented code.
- **Transaction folder/spec**: To extract tx-id-name and BR IDs from specification.
- **Git state**: develop branch for diff comparison.

## Process

1. **Check branch**: `git branch --show-current`.
2. **Git diff**: `git diff develop...{feature-branch}` to identify new code.
3. **Extract tx-id-name**: From branch name (e.g. TX-001-feature-name) or specification directory.
4. **Extract BR IDs**: From `{tx-id}-complete-transaction.md` or tech-spec.
5. **Add tags**: Wrap multi-line blocks with BEGIN/END; inline for single-line. Follow language patterns:
   - C#: `// TX-XXX-{feature-name} [BR-XXXX, BR-YYYY] BEGIN/END`
   - TypeScript: `// TX-XXX-{feature-name} [BR-XXXX, BR-YYYY] BEGIN/END`
   - YAML: `# TX-XXX-{feature-name} [BR-XXXX, BR-YYYY] BEGIN/END`
6. **Exclude**: obj/, bin/, node_modules/, dist/, generated files.
7. **Never**: Modify logic, remove existing tags, change formatting unnecessarily.

## Outputs

- **Tagged code**: All new code blocks have TX and BR comment tags.
- **No logic changes**: Only comment annotations added.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` or `.claude/commands/backend-development.md` — step **8** **Code-tagger**.
- **Preferred agent**: `.claude/agents/general/code-tagger.md`.

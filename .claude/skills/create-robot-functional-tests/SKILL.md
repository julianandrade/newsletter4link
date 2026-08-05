---
name: create-robot-functional-tests
description: Create Robot Framework test files in the functional-tests repository, organized by Transaction. Use when executing step 5c in frontend-development or when asked to create .robot tests in the functional-tests repo. Prefer robot-tester agent when available.
preferred_agent: robot-tester
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Create Robot Functional Tests

Use this skill when you need to **create** Robot Framework `.robot` test files in the **functional-tests** repository. This corresponds to **step 5c** in **`/frontend-development`**, within Track Test after step **5b** (validate coverage 100%). Tests are organized by Transaction: all tests for TX-XXX go inside folder `TX-XXX`. **Not** used in **backend-development**.

## Where Used

- **frontend-development** (`.claude/commands/frontend-development.md`): step **5c** — Robot tests (functional-tests)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id and functional-tests repo path. Prefer launching **robot-tester** (`.claude/agents/tests/robot-tester.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Step 5c invokes robot-tester; agent follows this skill. |

## Purpose

- **Create .robot files**: Use **`.robot`** content from `TestPlan/` (primary from step 5) to build production-ready Robot Framework tests in the functional-tests repo; legacy **`.feature`** in `TestPlan/` may still be transformed when present.
- **Organize by Transaction**: All tests for Transaction TX-XXX go inside `web/TX-XXX/` (or `web/{tx-id}/`).
- **Integration**: Output can be executed in step 7b (robot-tester runs tests) or by CI pipeline.

## Inputs

- **TestPlan/**: **`.robot`** files in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/TestPlan/` (primary); optional legacy **`.feature`**.
- **Complete Transaction**: `{tx-id}-complete-transaction.md`.
- **Tech-spec**: `{tx-id}-backend-tech-spec.md` and/or `{tx-id}-frontend-tech-spec.md`.
- **Functional-tests repo path**: Default is `{workspace-root}/tests-functional` (workspace root where the project is open). Override via `FUNCTIONAL_TESTS_REPO_PATH` or `.claude/config` when explicit configuration exists.

## Structure in functional-tests (mandatory)

```
functional-tests/
├── README.md
├── Pipelines/
│   └── test-pipeline.yaml
├── Transactions.txt
└── web/
    ├── _keywords.robot          # Shared keywords (login, session)
    ├── _variables.robot         # Global variables (browser, URL, timeout)
    ├── TX-001/                  # All tests for Transaction TX-001
    │   ├── TC_*.robot
    │   ├── _variables.robot
    │   └── _keywords.robot
    ├── TX-002/                  # All tests for Transaction TX-002
    │   ├── TC_*.robot
    │   └── ...
    └── {tx-id}/                # All tests for Transaction {tx-id}
        ├── TC_*.robot
        ├── _variables.robot
        └── _keywords.robot
```

- **Path**: `web/{tx-id}/` — e.g. `web/TX-001/`, `web/TX-002-editar-tarefa/`.
- **File naming**: `TC_{tx-id-numeric}_{ShortName}.robot` or `TX-{id}_{ShortName}.robot`.
- **Resources**: Create or update `_keywords.robot` and `_variables.robot` in `web/` and in `web/{tx-id}/` as needed.

## Process

1. **Resolve paths**: Get `{tx-id}`, `{tx-id-name}`, and functional-tests repo path.
2. **Create output dir**: Ensure `{functional-tests-repo}/web/{tx-id}/` exists.
3. **Read inputs**: TestPlan/ (primarily **`.robot`**; **`.feature`** if legacy), complete-transaction, tech-spec.
4. **Generate .robot files**: Create or update `.robot` files in `web/{tx-id}/`. Use Resource directives to inherit from `web/_keywords.robot` and `web/_variables.robot`.
5. **Conventions**: Tags @TX-XXX, @br-xxx; English for scenarios; follow Robot Framework best practices.
6. **Handoff**: Tests are available for step 7b (robot-tester executes) or CI pipeline.

## Outputs

- **Location**: `{functional-tests-repo}/web/{tx-id}/`.
- **Files**: `.robot` test files, `_keywords.robot`, `_variables.robot` as needed.
- **Execution**: `robot -x xunitoutput.xml .\web` (all) or `robot -x xunitoutput.xml .\web\TX-001` (by Transaction).

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` — step **5c** **Robot tests (functional-tests)**.
- **Preferred agent**: `.claude/agents/tests/robot-tester.md`.
- **Structure reference**: The functional-tests repository must be at the workspace root (e.g. `{workspace-root}/tests-functional`). The folder structure (web/, _keywords.robot, _variables.robot, TX-XXX/, etc.) shown above is mandatory—use it as template. HF tests-functional exemplifies this structure; the actual path is always relative to the workspace where the project is open.

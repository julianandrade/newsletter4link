---
name: e2e-flow-validation
description: Run E2E and flow tests (flow-test, robot-tester). Produce E2E/Flow Failure Report and re-invoke developer when failures occur. Use when executing step 7b in frontend-development or when asked to run E2E, flow, or robot tests.
preferred_agent: flow-test
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# E2E / Flow Validation

Use this skill when you need to **run E2E and flow tests** for the feature: flow-test (Playwright) and robot-tester (.robot files). This corresponds to **step 7b** in **`/frontend-development`**, inside the loop (**7a** ↔ **7a2** ↔ **7b** ↔ **7c**). **`/backend-development`** does **not** run step **7b**. **Skip** when `features.test` is `false` in `settings.json`. **Prerequisites**: unit tests (**7a**) and build (**7a2**) must pass first.

## Where Used

- **frontend-development** (`.claude/commands/frontend-development.md`): step **7b** — E2E / Flow tests (flow-test, robot-tester)
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id and flow/TestPlan paths. Prefer launching **flow-test** (`.claude/agents/tests/flow-test.md`) and **robot-tester** (`.claude/agents/tests/robot-tester.md`) as needed. If unavailable, main agent executes the procedure. |
| **In flow** | Step 7b invokes flow-test and robot-tester; agents follow this skill. |

## Purpose

- **Flow tests**: Test screen-to-screen navigation with Playwright MCP.
- **Robot tests**: Execute `.robot` files in TestPlan/ against the app.
- **Layout validation** (when frontend scope exists): Verify that the implemented layout matches the "Layout & Design Guidance" (or "UI/UX Constraints") section in `{tx-id}-frontend-tech-spec.md`. Layout non-compliance is a failure and follows the same report/re-invoke flow.
- **Report failures**: Produce E2E/Flow Failure Report when any test fails (including layout non-compliance).
- **Re-invoke developer**: Developer fixes; then re-run 7a (unit), 7a2 (build), then 7b.

## When to Use

- Executing **step 7b** in **frontend-development** (loop 7), after **7a** and **7a2** pass. Order: **7a** (unit) → **7a2** (build) → **7b** (E2E).
- When asked to run E2E tests, flow tests, robot tests, or Playwright tests.

## Inputs

- **Flow documentation**: Screen catalog or flow docs.
- **TestPlan/**: **`.robot`** files in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/TestPlan/` (primary from step 5); **`.feature`** only if legacy files exist.
- **Application URL**: For running tests.
- **`{tx-id-name}`**: Full Transaction folder name under `{{PATH_DOCS}}/4-implementation/development/` (e.g. `TX-001-criar-tarefa`); use in all report paths (same placeholder as flow-test, robot-tester, flow-test-logger).

## Process

> **Headful mode**: All browser-based tests (Playwright MCP and Robot Framework) run in **headed (non-headless) mode** — the browser window must be visible during execution.

1. **Run flow-test**: Test navigation flows (screen → screen) with Playwright MCP per flow docs. Generate pass/fail report.
2. **Validate layout** (when frontend scope and `{tx-id}-frontend-tech-spec.md` has Layout & Design Guidance): Compare implemented screens with the layout specified in `{tx-id}-frontend-tech-spec.md`. Non-compliance = failure.
3. **Run robot-tester** (if `.robot` exist in TestPlan/): Execute `.robot` test cases; report per case (PASS/FAIL).
4. **On failure** (flow, layout, or Robot):
   - (Optional) Use **flow-test-logger** to investigate root cause; attach to E2E report.
   - Produce **E2E/Flow Failure Report** (include layout non-compliance in failed scenarios).
   - **Re-invoke developer** with report; developer fixes and commits.
   - **Return to 7a**: Re-run unit tests first (7a), then build (7a2), then 7b again.
5. **On success**: Proceed to 7c (code security) or step 8 if 7c skipped.

## E2E/Flow Failure Report Format

```markdown
## E2E/Flow Failure Report

- **Status**: has_failures
- **Source**: flow-test and/or robot-tester
- **Transaction**: {tx-id}

### Failed scenarios / flows

Include flow failures, Robot test failures, and **layout non-compliance** (layout does not match `{tx-id}-frontend-tech-spec.md`).

| Scenario or flow name | Screen / step failed | Error message | Screenshot (path) |
|----------------------|----------------------|---------------|-------------------|
| ... | ... | ... | ... |

### Summary

- Total passed: X
- Total failed: Y

### Recommendation

Re-invoke **developer** with this report. After fixes and commit, re-run **unit tests first** (7a), then **build** (7a2), then flow-test and robot-tester (7b).
```

**Report location**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/flows/` or `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/robot-reports/` (Transaction docs and test artifacts—**not** under application source folders such as `src/`).

## Order Rule

Always re-run **unit tests first** (7a) after developer fixes, then **build** (7a2), then E2E/flow (7b). Never skip 7a or 7a2 when returning from failure.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` — step **7b** **E2E / Flow tests**.
- **Agents**: `.claude/agents/tests/flow-test.md`, `.claude/agents/tests/robot-tester.md`, `.claude/agents/tests/flow-test-logger.md` (optional).

---
name: unit-test-validation
description: Generate (TDD mode) or run and validate (validation mode) unit tests. Classify failures (test bug vs implementation bug). Produce Test Failure Report and re-invoke developer when needed. Use when executing step 5d or 7a in frontend-development or backend-development, or when asked to create or run unit tests.
preferred_agent: unit-test-generator
---

# Unit Test Validation

Use this skill when you need to **generate** unit tests (TDD mode — step **5d**) or **run and validate** existing unit tests (validation mode — step **7a**) in **`/frontend-development`** or **`/backend-development`**. **Skip** when `--no-tests` is set.

## Where Used

- **frontend-development** / **backend-development**:
  - **Step 5d** — Unit tests (TDD mode): generate tests from tech-spec before code exists.
  - **Step 7a** — Unit tests (validation mode): run existing tests, validate pass/fail.

## Execution Modes

| Mode | Step | Purpose |
|------|------|---------|
| **TDD** | 5d | Generate unit tests from tech-spec and complete-requirement. No code exists; tests will fail when run (Red phase). |
| **Validation** | 7a | Run existing unit tests (from 5d); verify they pass. No generation. |

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id and context (code for legacy mode, or tech-spec for TDD mode). Prefer launching **unit-test-generator** (`.claude/agents/tests/unit-test-generator.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Step 5d invokes unit-test-generator in TDD mode; step 7a invokes in validation mode. |

## Purpose

- **TDD mode (5d)**: Generate unit tests from tech-spec and complete-requirement. Tests are written in the project under test; when run, they **must fail** (Red phase) because no implementation exists. Output feeds step 6 (Developer).
- **Validation mode (7a)**: Run existing unit tests, analyze results. Classify failures (test bug vs implementation bug). Produce Test Failure Report when developer must fix code.

## When to Use

- Executing **step 5d** in **frontend-development** or **backend-development** (TDD — create failing tests).
- Executing **step 7a** in **frontend-development** or **backend-development** (loop 7 — run and validate).
- When asked to create unit tests, run unit tests, or verify test coverage.

## Inputs

- **TDD mode (5d)**: Tech-spec, `{req-id}-complete-requirement.md`, requirement folder.
- **Validation mode (7a)**: Feature code (from Developer), unit test files (from 5d), tech-spec, requirement folder.

## Process

### TDD mode (step 5d)

1. **Generate tests**: Create unit tests from tech-spec and complete-requirement. Do **not** analyze existing code; infer contracts and behavior from the specification.
2. **Output**: Test files in the project under test (e.g. `*.spec.ts`, `*Test.cs`), positioned per tech-spec structure.
3. **Expected**: When run, tests **must fail** (Red phase). Hand off to Developer (step 6).

### Validation mode (step 7a)

1. **Run suite**: Execute existing unit tests with project's test runner. Do **not** generate new tests.
2. **Analyze failures**:
   - **All pass** → proceed to **7a2** (build), then **7b** (E2E/flow) on **frontend-development**, or **7c** (code security) on **backend-development** when **7b** does not apply.
   - **Some fail** → classify each:
     - **test bug**: Fix tests in this agent; re-run. Do not call developer.
     - **implementation bug** or **unclear**: Produce **Test Failure Report**; re-invoke **developer** with report; developer fixes and commits; **return to 7a** (run unit tests again).
3. **Report location**: `.claude/docs/requirements/{req-id-name}/tests/unit-test-reports/Test_Failure_Report_[TIMESTAMP].md` (never in project under test).

## Test Failure Report Format

```markdown
## Test Failure Report

- **Status**: has_failures
- **Summary**: X test(s) failed, Y passed.

### Failed tests

| Test name | File | Assertion / error | Classification | Suggested fix |
|-----------|------|-------------------|----------------|---------------|
| ... | ... | ... | implementation_bug / test_bug / unclear | ... |

### Recommendation

- If any **implementation_bug** or **unclear**: Re-invoke **developer** with this report. After fixes and commit, re-run 7a.
- If all **test_bug**: Fix tests here; re-run; do not invoke developer.
```

## Classification Rules

- **implementation_bug**: Production code is wrong.
- **test_bug**: Test logic is wrong.
- **unclear**: Cannot tell; developer should check.

## Reference

- **Flow steps**: `.claude/commands/frontend-development.md` and `.claude/commands/backend-development.md` — step **5d** (TDD mode), step **7a** (validation mode).
- **Preferred agent**: `.claude/agents/tests/unit-test-generator.md`.

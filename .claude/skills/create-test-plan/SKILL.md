---
name: create-test-plan
description: Create Robot Framework (.robot) test plans from requirements (default). Use when executing step 5 in frontend-development or when asked to create test plans, generate Robot tests, or plan tests for a requirement. Prefer test-plan agent when available. Legacy Gherkin (.feature) is optional elsewhere—not the default output of step 5.
preferred_agent: test-plan
---

# Create Test Plan

Use this skill when you need to **create** a test plan as **Robot Framework `.robot`** files from the complete requirement and specs. Default output location: **`tests/TestPlan/`** under the requirement folder. This corresponds to **step 5** in **`/frontend-development`**, executed within Track Test. After generation, step **5b** (validate-test-plan-coverage) validates coverage; if < 100%, the plan may be adjusted in a loop. Track Test (**5**, **5b**, **5c**, **5d**) completes before Developer (step **6**) runs (TDD flow). **Not** used in **backend-development** (no functional test plan there).

## Where Used

- **frontend-development** (`.claude/commands/frontend-development.md`): step **5** — Test-plan
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id. Prefer launching **test-plan** (`.claude/agents/tests/test-plan.md`) with this skill's context. If unavailable, main agent executes the procedure. |
| **In flow** | Step 5 invokes test-plan; agent follows this skill. |

## Purpose

- **Plan tests**: Generate **`.robot`** files in `TestPlan/` covering all testable scenarios (primary format for step 5).
- **Traceability**: Tags and documentation for RQ-*, BR-* (e.g. `rq-xxx`, `br-xxx`).
- **Integration**: Output feeds step 5b (validate coverage) and loop 7b (robot-tester, flow-test).

## When to Use

- Executing **step 5 (Test-plan)** in **frontend-development** (Track Test — runs before Developer in TDD flow).
- When asked to create a test plan, generate **Robot** tests, `.robot` files, or plan tests for a requirement.

## Inputs

- **Complete requirement**: `{req-id}-complete-requirement.md` in `.claude/docs/requirements/{req-id-name}/`.
- **Tech-spec**: From step 4a in same folder.
- **Clarifications**: If applicable, completed clarifications.
- **Specs**: `.claude/docs/specs/` and related project docs when in scope.

## Process

1. **Resolve paths**: Get `{req-id}` and `{req-id-name}`. Requirement folder: `.claude/docs/requirements/{req-id-name}/`.
2. **Create output dir**: Ensure `.claude/docs/requirements/{req-id-name}/tests/TestPlan/` exists.
3. **Analyze docs**: Read complete-requirement, tech-spec, specs. Extract RQ-*, BR-*, actions, pre/post-conditions.
4. **Generate plan**: Create **`.robot`** files in `TestPlan/`. Do not write plan artifacts under application source code (e.g. `src/`); keep them under `.claude/docs/requirements/...`.
5. **Conventions**:
   - File naming: `[RQ-ID]_[Short_Name].robot`.
   - Tags / documentation: traceability to RQ/BR.
   - Language: English for test cases and steps.
6. **Handoff**: After generation, step 5b validates coverage. If < 100%, return to step 5 to adjust or create test-plan-clarifications.

## Outputs

- **Location**: `.claude/docs/requirements/{req-id-name}/tests/TestPlan/`.
- **Files**: **`.robot`** (Robot Framework) as the default and expected output of step 5. Gherkin **`.feature`** is not produced by the test-plan agent by default; legacy `.feature` files may exist from older workflows.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` — step **5** **Test-plan**.
- **Preferred agent**: `.claude/agents/tests/test-plan.md`.
- **Next step**: validate-test-plan-coverage skill (step 5b).

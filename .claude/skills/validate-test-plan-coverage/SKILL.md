---
name: validate-test-plan-coverage
description: Validate that a test plan covers 100% of the functionality described in requirements and specs. Compare Robot (.robot) test cases—and legacy Gherkin (.feature) if present—with complete requirement, tech-spec, and RQ/BR items. Produce coverage report; identify gaps; suggest test-plan-clarifications when there are doubts about what to test.
preferred_agent: test-plan
---

# Validate Test Plan Coverage

Use this skill when you need to **validate** that a test plan (**Robot Framework `.robot`** in `TestPlan/` is the default from step 5; **Gherkin `.feature`** only if legacy files exist) covers **100%** of the functionality described in the requirement documents.

## Where Used

- **frontend-development** (`.claude/commands/frontend-development.md`): step **5b** — Validate test plan coverage
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id. Prefer **test-plan** in validate-coverage mode (`.claude/agents/tests/test-plan.md`). If unavailable, main agent executes the procedure. |
| **In flow** | Step **5b** invokes test-plan in validate-coverage mode (or main agent); follows this skill for coverage criteria and outputs. This corresponds to **step 5b** in **frontend-development**, within Track Test. If coverage is below 100%, the flow returns to step **5** to adjust the plan or generates `test-plan-clarifications` when there are doubts. |

## Purpose

- **Coverage check**: Ensure every RQ-*, BR-*, action, pre/post-condition, and flow in the specs has at least one corresponding test scenario.
- **Gap identification**: Produce a report of what is missing from the test plan.
- **Doubt handling**: When scope or testability is unclear, create questions for `test-plan-clarifications` (similar to requirement clarifications).

## When to Use

- Executing **step 5b (Validate test plan coverage)** in **frontend-development**, immediately after step **5** (Test-plan).
- When asked to validate, verify, or check test plan coverage against requirements.

## Inputs

- **Test plan**: **`.robot`** files in `.claude/docs/requirements/{req-id-name}/tests/TestPlan/` (primary). Optionally **`.feature`** if present (legacy).
- **Specification**: `{req-id}-complete-requirement.md`, `{req-id}-backend-tech-spec.md` and/or `{req-id}-frontend-tech-spec.md` (per scope), and related specs in `.claude/docs/requirements/{req-id-name}/` and `.claude/docs/specs/`.

## Process

1. **Resolve paths**: Determine `{req-id}` and `{req-id-name}` from context. Requirement folder is under `.claude/docs/requirements/{req-id-name}/`.
2. **Read specification**: Load `{req-id}-complete-requirement.md`, applicable `{req-id}-backend-tech-spec.md` / `{req-id}-frontend-tech-spec.md`, and any related specs. Extract:
   - Requirement IDs (RQ-*)
   - Business Rule IDs (BR-*)
   - Actions, preconditions, postconditions
   - Inputs, outputs, validations
   - Flows and state transitions
3. **Read test plan**: Load all **`.robot`** files in `TestPlan/` (and **`.feature`** if any legacy files exist). Extract:
   - Test cases and scenarios (Robot: `*** Test Cases ***`; Gherkin: Feature/Scenario if applicable)
   - Tags (Robot: `[Tags]` / documentation; Gherkin: @rq-xxx, @br-xxx)
   - Steps and assertions
4. **Map coverage**: For each item in the spec, check if there is at least one test scenario that covers it.
5. **Produce report**:
   - **Coverage percentage**: (covered items / total items) × 100.
   - **Covered items**: List of RQ-*, BR-*, actions, etc. with matching scenarios.
   - **Gaps**: Items in the spec without a corresponding test scenario.
   - **Doubts** (if any): Ambiguous scope, unclear testability, missing information — these warrant `test-plan-clarifications`.

## Outputs

### Coverage Report

Produce a markdown report (or structured output) with:

- **Status**: `100% coverage` or `incomplete` (with percentage).
- **Covered**: table or list of spec items → scenario(s) that cover them.
- **Gaps**: list of spec items **not** covered.
- **Recommendation**:
  - If 100%: Proceed to step 5c (robot tests), then 5d (unit tests TDD).
  - If incomplete and **no doubts**: return to step 5; add scenarios for gaps.
  - If incomplete and **doubts exist**: create `{req-id}-test-plan-clarifications.md`; pause for user completion; then return to step 5.

### test-plan-clarifications File (when doubts exist)

- **Path**: `.claude/docs/requirements/{req-id-name}/{req-id}-test-plan-clarifications.md` (or `-1.md`, `-2.md` if numbered version exists).
- **Format**: Same as `{req-id}-clarifications.md` (from clarify-requirement skill):
  - Numbered questions (Q1, Q2, …)
  - Categories: Ambiguous scenarios, Test scope undefined, Incomplete business rules for testing, Required test data, Scenario priority
  - Blank answer spaces after each question

## Coverage Criteria

An item is **covered** if there is at least one test scenario (or step) that explicitly exercises it. Examples:

- **RQ-001**: At least one test case with tag or documentation tying to `rq-001` / RQ-001 that tests the requirement.
- **BR-003**: At least one test case that validates the business rule (e.g., format validation, constraint).
- **Action "Create task"**: At least one test case whose steps exercise task creation (Robot keywords/steps or Gherkin When/Then if legacy `.feature`).
- **Precondition "User logged in"**: Covered by suite setup, keyword, Background, or Given step as applicable.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` — step **5b** **Validate test plan coverage**.
- **Test plan agent**: `.claude/agents/tests/test-plan.md` — generates the plan; this skill validates it.
- **Clarify format**: `.claude/skills/clarify-requirement/SKILL.md` — format for test-plan-clarifications mirrors requirement clarifications.

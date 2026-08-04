# Frontend Development (architecture → functional tests → TDD → E2E + security)

Run the **frontend track** for the requirement in `$ARGUMENTS`: architect the UI, refine design, optional baseline, **functional test planning and Robot tests**, unit TDD, **frontend-developer** implementation, validation loop, traceability, documentation, and contextual security.

**Prerequisites**: Complete the **complete-development** trunk through **4api** (OpenAPI contract must exist). `{req-id}-technical-solution-requirement.md` must include **frontend scope**. If there is no frontend scope, stop and tell the user to use **`/backend-development`** only.

## Parameters

Interpret `$ARGUMENTS` as a token list (space-separated). The **first token** is always the requirement ID; optional flags follow.

- **requisite-id** (required): first argument (for example: `RQ-002-editar-tarefa`).
- **--no-security** (optional): skip security steps and agents (4b, 7c, 10, and contextual security agents).
- **--no-tests** (optional): skip test steps and agents (5, 5b, 5c, 5d, 7a, 7a2, 7b, 9 documentation-update).

Flags can be combined. Token order after `requisite-id` is irrelevant.

- **Path convention**: `.claude/docs/requirements/{req-id}/` — `{req-id}` equals the first argument (same as `{req-id-name}` if used elsewhere).

## Resume and idempotency

1. Read `.claude/docs/requirements/{req-id}/progress.md`.
2. Confirm OpenAPI artifacts exist and `{req-id}-technical-solution-requirement.md` assigns frontend scope.
3. Continue from the first incomplete **frontend track** step (4a through 10), using artifacts (`{req-id}-frontend-tech-spec.md`, `TestPlan/`, `functional-tests/web/{req-id}/`, etc.).
4. When updating `progress.md`, **merge** new bullets into **Notes** (or track-specific bullets) without deleting trunk history from **complete-development**.

## Document & Clear (required after each step)

After **each** flow step (4a, 4b, 4c, 4d, 5, 5b, 5c, 5d, 6, each relevant iteration of 7, 8, 9, 10), apply **Document & Clear**.

**Skip documenting 4d** when 4d does not run (brownfield). When Track Test (5–5d) runs, document as substeps complete; apply Document & Clear at the sync point before step 6.

**Progress file**: `.claude/docs/requirements/{req-id}/progress.md`

### How to execute Document & Clear

1. **Document**: update `progress.md` with **Requirement**, **Completed step** (prefix with `Frontend track:` if helpful), **Current state**, **Next step**, **Required context**, **Notes** (append; preserve trunk lines).
2. **Clear**: ask the user to run **`/clear`**.
3. **Continue**: *"Read `.claude/docs/requirements/{req-id}/progress.md` and continue **frontend-development** from the next indicated step."*

**Exceptions**: not mid–loop-7, not inside the step 5 / 5b coverage loop. Pauses for test-plan clarifications (5b): document and wait for user like the original flow.

### Suggested additions under Notes

```markdown
### Frontend track
- Last completed: ...
- Pending: ...
```

## Step 0 — Git prerequisite (always runs first)

1. Run `git status`.
   - If successful: repo exists. Proceed to step 2.
   - If "not a git repository": **immediately run** (no prompt, no confirmation):
     ```bash
     git init
     git add .
     git commit -m "chore: initial commit of existing files"
     ```
2. Ensure feature branch exists for this requirement:
   - If current branch is already `{req-id}`: continue.
   - Otherwise: `git checkout -b {req-id}` (or `git checkout {req-id}` if branch already exists).

Document & Clear does **not** apply to Step 0.

## Flow order

4a. **Architect (frontend only)**  
   **architect-requirement** (`.claude/skills/architect-requirement/SKILL.md`): invoke **frontend-architect** (`.claude/agents/frontend/frontend-architect.md`) only. Produce `{req-id}-frontend-tech-spec.md`. Inputs: `{req-id}-complete-requirement.md`, `{req-id}-technical-solution-requirement.md`, **OpenAPI** (contract from trunk). If `{req-id}-backend-tech-spec.md` does not exist yet, architect from OpenAPI and record gaps under **API Integration Contracts**.

4b. **Architecture security review (frontend tech-spec)**  
   **Skip if** `--no-security`.  
   **architecture-security-review** (`.claude/skills/architecture-security-review/SKILL.md`) with **security-architect** (`.claude/agents/security/architecture/security-architect.md`). Scope: `{req-id}-frontend-tech-spec.md`, `{req-id}-complete-requirement.md`, OpenAPI as trust-boundary context. Follow the skill’s re-invoke loop for Critical/High.

4c. **UI/UX Designer**  
   **adjust-frontend-design** + **ui-ux-designer** (`.claude/agents/frontend/ui-ux-designer.md`) Phase 3 — refine `{req-id}-frontend-tech-spec.md`. Layout / **Layout & Design Guidance** (or **UI/UX Constraints**) is **mandatory** for step 6.

**Synchronization before Track Test**  
 Order: **4a → 4b** (if security) **→ 4c → 4d (if greenfield)** → Track Test or step 6 if `--no-tests`. If `--no-security`: **4a → 4c → 4d**.

4d. **Generate baseline (greenfield only)**  
   **Skip** for brownfield when the frontend project tree already matches the tech-spec.  
   **generate-baseline** (`.claude/skills/generate-baseline/SKILL.md`) for the **frontend** app only. After 4d when it ran: Document & Clear before step 5 or 6.

**4.5. Environment Setup (blocking — skip with `--no-tests`)**

Execute in order; **stop and report** on first failure — do not proceed to Track Test until all pass:

1. **API config**: Read `{req-id}-frontend-tech-spec.md` for the backend API base URL. Verify that the frontend dev configuration (proxy config or API URL setting) points to that URL. Update if mismatched.
2. **Backend reachable**: HTTP check to backend base URL. If unreachable, block:
   ```
   ENVIRONMENT NOT READY — Backend not reachable at [url].
   Start the backend or re-run with --no-tests.
   ```
3. **Frontend running**: Verify the frontend dev server is accessible. If not, block:
   ```
   ENVIRONMENT NOT READY — Frontend dev server not running.
   Start the dev server or re-run with --no-tests.
   ```

Document & Clear after 4.5 when successful.

**Track Test then Developer (TDD)**  
   When tests are enabled: **5 → 5b (loop to 100%) → 5c (Robot) → 5d (frontend unit Red)**. Inputs: `{req-id}-complete-requirement.md`, `{req-id}-technical-solution-requirement.md`, `{req-id}-frontend-tech-spec.md`, specs. **Step 6** runs only after Track Test completes (unless `--no-tests`). **Functional / Robot tests (5c) live only on this frontend track** — not on backend-development.

5. **Test-plan** (**skip if** `--no-tests`)  
   **create-test-plan** + **test-plan** agent → `TestPlan/` **`.robot`** files.

5b. **Validate test plan coverage** (**skip if** `--no-tests`)  
   **validate-test-plan-coverage**. Compare `.robot` in `TestPlan/` to requirements and **frontend** tech-spec. Loop step 5 and 5b until 100% coverage; if doubts, create `{req-id}-test-plan-clarifications*.md` and wait for the user.

5c. **Robot tests (functional-tests)** (**skip if** `--no-tests`)  
   **robot-tester** + **create-robot-functional-tests** → `functional-tests/web/{req-id}/` (or path from config). Same folder naming rules as the legacy monolithic flow.

5d. **Unit tests (TDD — Red)** (**skip if** `--no-tests`)  
   **unit-test-validation** (TDD) + **unit-test-generator** → frontend unit tests only; they must **fail** (Red) before step 6.

6. **Developer (frontend)**  
   **frontend-developer** (`.claude/agents/frontend/frontend-developer.md` or project equivalent).

   - **With tests:** inputs: `{req-id}-frontend-tech-spec.md` and **failing unit tests from 5d** (Green).
   - **With `--no-tests`:** tech-spec only; run after sync point (4a/4b/4c/4d as applicable).

   **Layout** from 4c is mandatory. After implementation, run **`/simplify`** on changed frontend code (mandatory for step 6 completion).

   **Mandatory commit after step 6**: Once `/simplify` completes:
   ```bash
   git add .
   git commit -m "feat: implement {req-id} frontend - initial implementation"
   ```
   Step 7 does not begin until this commit exists.

7. **Developer ↔ Tests + Code Security loop** (max **5** iterations)

   - If **`--no-tests`**: skip 7a, 7a2, 7b; run **7c** only unless **`--no-security`** too → then skip all of 7.
   - If **`--no-security`**: run 7a, 7a2, 7b only (no 7c).
   - If **both** flags: skip step 7 entirely (go to 8 after step 6).

   - **7a. Unit tests** (**skip if** `--no-tests`): **unit-test-validation** validation mode; **Test Failure Report** if failures; re-invoke frontend-developer.
   - **7a2. Build** (**skip if** `--no-tests`): frontend build (project build command per tech-spec). **Build Failure Report** if needed.
   - **7b. E2E / Flow** (**skip if** `--no-tests` — **otherwise BLOCKING**): Before first run, verify environment (same checks as Step 4.5: E2E runner installed, backend reachable, frontend running). If any check fails, **stop with blocking error** — "deferred" is not a valid outcome. Once environment confirmed: **e2e-flow-validation** (flow-test, robot-tester). Include **layout** checks vs `{req-id}-frontend-tech-spec.md`. **E2E/Flow Failure Report** on failure.
   - **7c. Code security** (**skip if** `--no-security`): **code-security-validation**. **Security Findings Report** for Critical/High.

   After fixes: re-run active substeps in order (see Loop rules below).

   **Mandatory commit after loop 7**: When all active substeps pass:
   ```bash
   git add .
   git commit -m "fix: {req-id} frontend - post-validation fixes"
   ```
   Skip only if loop 7 was skipped entirely (both `--no-tests` and `--no-security`).

8. **Code-tagger**  
   **add-code-traceability** + **code-tagger** — scope: **frontend** changes for this requirement.

   **Mandatory commit after step 8**:
   ```bash
   git add .
   git commit -m "chore: {req-id} frontend - add traceability tags"
   ```

9. **Documentation update**  
   **Skip if** `--no-tests`.  
   **update-requirement-documentation** + **req-checker**. If the backend is not running yet, treat validation as **partial** and say so in the report; repeat step 9 after integration if needed.

10. **Contextual security**  
    **Skip if** `--no-security`.  
    **contextual-security-review** when scope warrants.

## Report formats

When agents detect failures, use the markdown structures below (include in the response or save under `.claude/docs/requirements/{req-id}/tests/`). Re-invoke **frontend-developer** with the report; then re-run active **7a → 7a2 → 7b → 7c** as enabled.

### Security Findings Report (Critical/High)

```markdown
## Security Findings Report

- **Status**: has_critical_or_high
- **Source**: static-analysis-enforcer and/or code-security-auditor (and others if applicable)
- **Requirement**: {req-id}

### Critical / High findings

| Severity | File / location | Description | Recommendation |
|----------|-----------------|-------------|----------------|
| ... | ... | ... | ... |

### Summary

- Total Critical: X
- Total High: Y
- Other (Medium/Low): Z (recommended to fix but not blocking)

### Recommendation

Re-invoke **frontend-developer** with this report. After fixes and commit, re-run the active validation sub-steps in order: **7a**, **7a2**, **7b**, **7c** — omit sub-steps deactivated by `--no-tests` or `--no-security`.
```

### E2E/Flow Failure Report

```markdown
## E2E/Flow Failure Report

- **Status**: has_failures
- **Source**: flow-test and/or robot-tester
- **Requirement**: {req-id}

### Failed scenarios / flows

Include flow failures, Robot test failures, and **layout non-compliance** (when layout does not match `{req-id}-frontend-tech-spec.md` Layout & Design Guidance).

| Scenario or flow name | Screen / step failed | Error message | Screenshot (path) |
|-----------------------|----------------------|---------------|-------------------|
| ... | ... | ... | ... |

### Summary

- Total passed: X
- Total failed: Y

### Recommendation

Re-invoke **frontend-developer** with this report. After fixes and commit, re-run **7a**, **7a2**, **7b**, then **7c** when active — omit sub-steps deactivated by flags.
```

### Build Failure Report

```markdown
## Build Failure Report

- **Status**: build_failed
- **Source**: build (step 7a2) — [technology/command used]
- **Requirement**: {req-id}

### Build errors

| File / location | Error message |
|-----------------|---------------|
| ... | ... |

### Recommendation

Re-invoke **frontend-developer** with this report. After fixes and commit, re-run 7a (unit), 7a2 (build), then 7b (E2E).
```

## Loop rules

- **7b active**: after developer fixes, always **7a → 7a2 → 7b**, then **7c** if active.
- **Layout non-compliance** in 7b = E2E failure; same report flow.
- **Exit**: all active substeps pass, or **5 iterations** reached → ask user for next action.

## Context management

Document & Clear between steps; **`/compact`** only between steps (~70% context); never mid-sub-agent.

## End-of-command

Per-step commits (after step 6, loop 7, step 8) must already exist. End-of-command:

1. Stage and commit any remaining unstaged files (specs, reports, progress.md, step 9 outputs):
   ```bash
   git add .
   git commit -m "chore: {req-id} frontend - finalize specs, docs, and reports"
   ```
   Skip if nothing unstaged.
2. Push: `git push -u origin {req-id}`.
3. Open PR targeting integration branch (`develop` or as configured).
4. Remove junk/scratch files before pushing.

## Usage

```
/frontend-development <requisite-id> [--no-security] [--no-tests]
```

**Resume after /clear**: *"Read `.claude/docs/requirements/{req-id}/progress.md` and continue **frontend-development** from the next indicated step."*

## Flow summary

**Step 0** (git init + branch) → **4a** → **4b** (if security) → **4c** → **4d** (if greenfield) → **4.5** (if tests) → **5 → 5b → 5c → 5d** (if tests) → **6** (+ `/simplify` + commit) → **loop 7** (7a, 7a2, 7b BLOCKING, 7c) + commit → **8** + commit → **9** (if tests) → **10** (if security) → push + PR.

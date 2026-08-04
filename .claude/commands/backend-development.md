# Backend Development (architecture → unit TDD → build + security)

Run the **backend track** for the requirement in `$ARGUMENTS`: architect the API implementation surface, optional baseline, **unit tests only (no functional/Robot test plan)**, **backend-developer** implementation, validation loop (**unit + build + code security** — **no** step 7b E2E/Robot/flow), traceability, documentation, and contextual security.

**Prerequisites**: Complete the **complete-development** trunk through **4api** (OpenAPI contract must exist). `{req-id}-technical-solution-requirement.md` must include **backend scope**. If there is no backend scope, stop and tell the user to use **`/frontend-development`** only.

**Functional tests** (test-plan 5, 5b, Robot 5c, E2E/flow **7b**) belong to **`/frontend-development`** only — do **not** run them in this command.

## Parameters

Interpret `$ARGUMENTS` as a token list (space-separated). The **first token** is the requirement ID; optional flags follow.

- **requisite-id** (required).
- **--no-security** (optional): skip 4b, 7c, 10, and contextual security agents.
- **--no-tests** (optional): skip 5d, 7a, 7a2, 9 documentation-update (same spirit as the historical monolithic command: no unit/build validation loop).

Flags can be combined. Token order after `requisite-id` is irrelevant.

- **Path convention**: `.claude/docs/requirements/{req-id}/` — `{req-id}` equals the first argument.

## Resume and idempotency

1. Read `.claude/docs/requirements/{req-id}/progress.md`.
2. Confirm OpenAPI exists and technical-solution assigns backend scope.
3. Continue from the first incomplete **backend track** step.
4. When updating `progress.md`, **merge** into **Notes** without deleting trunk history.

## Document & Clear (required after each step)

After **each** of: 4a, 4b, 4d, 5d, 6, each iteration of 7, 8, 9, 10 — apply **Document & Clear**. Skip documenting **4d** when it does not run.

**Progress file**: `.claude/docs/requirements/{req-id}/progress.md`

### How to execute Document & Clear

1. **Document**: update with **Requirement**, **Completed step** (optional prefix `Backend track:`), **Current state**, **Next step**, **Context**, **Notes** (append).
2. **Clear**: ask for **`/clear`**.
3. **Continue**: *"Read `.claude/docs/requirements/{req-id}/progress.md` and continue **backend-development** from the next indicated step."*

**Exceptions**: not mid–loop-7.

### Suggested Notes subsection

```markdown
### Backend track
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

4a. **Architect (backend only)**  
   **architect-requirement** → **backend-architect** (`.claude/agents/backend/backend-architect.md`) only → `{req-id}-backend-tech-spec.md`. Inputs: complete requirement, technical-solution requirement, **OpenAPI** from trunk.

4b. **Architecture security review (backend tech-spec)**  
   **Skip if** `--no-security`.  
   **architecture-security-review** + **security-architect**. Scope: `{req-id}-backend-tech-spec.md`, `{req-id}-complete-requirement.md`.

**Synchronization before unit TDD / Developer**  
   Order: **4a → 4b** (if security) **→ 4d (if greenfield)** → **5d** or **6**. If `--no-security`: **4a → 4d**.

4d. **Generate baseline (greenfield only)**  
   **Skip** for brownfield when the backend project matches the tech-spec.  
   **generate-baseline** for the **backend** app only. Document & Clear after 4d when it ran.

4e. **Schema / Migrations (blocking when needed)**  
   Read `{req-id}-backend-tech-spec.md` Critical issues section. If any migration items are listed:
   - Run each migration/schema command exactly as specified in the Critical issues section.
   - Verify database reflects expected schema before proceeding.
   - On failure: **stop and report** — do not proceed to implementation.
   - If no migration critical issues listed: skip 4e silently.

   Document & Clear after 4e when it ran (skip documenting when it did not run).

**No steps 5, 5b, or 5c** on this track.

5d. **Unit tests (TDD — Red)** (**skip if** `--no-tests`)  
   **unit-test-validation** (TDD) + **unit-test-generator** → backend unit tests only; must **fail** (Red) before step 6.

6. **Developer (backend)**  
   **backend-developer** (`.claude/agents/backend/backend-developer.md` or project equivalent).

   - **With tests:** `{req-id}-backend-tech-spec.md` + failing unit tests from **5d**.
   - **With `--no-tests`:** tech-spec only after sync point (4a/4b/4d).

   After implementation, run **`/simplify`** on changed backend code (mandatory for step 6 completion).

   **Mandatory commit after step 6**: Once `/simplify` completes:
   ```bash
   git add .
   git commit -m "feat: implement {req-id} backend - initial implementation"
   ```
   Step 7 does not begin until this commit exists.

7. **Developer ↔ Unit + Build + Code Security loop** (max **5** iterations)  
   **There is no 7b** (no flow-test, robot-tester, or UI E2E in this command).

   - If **`--no-tests`**: skip **7a** and **7a2**; run **7c** only unless **`--no-security`** too → then skip all of step 7.
   - If **`--no-security`**: run **7a** and **7a2** only (no **7c**).
   - If **both** flags: skip step 7 entirely (go to 8 after step 6).

   - **7a. Unit tests** (**skip if** `--no-tests`): **unit-test-validation** validation mode; **Test Failure Report** on failure; re-invoke **backend-developer**.
   - **7a2. Build** (**skip if** `--no-tests`): backend build (e.g. `dotnet build`). **Build Failure Report** on failure.
   - **7c. Code security** (**skip if** `--no-security`): **code-security-validation**; **Security Findings Report** for Critical/High.

   After fixes: re-run active substeps in order (**7a → 7a2 → 7c** as enabled).

   **Mandatory commit after loop 7**: When all active substeps pass:
   ```bash
   git add .
   git commit -m "fix: {req-id} backend - post-validation fixes"
   ```
   Skip only if loop 7 was skipped entirely (both `--no-tests` and `--no-security`).

8. **Code-tagger**  
   **add-code-traceability** + **code-tagger** — scope: **backend** changes.

   **Mandatory commit after step 8**:
   ```bash
   git add .
   git commit -m "chore: {req-id} backend - add traceability tags"
   ```

9. **Documentation update**  
   **Skip if** `--no-tests`.  
   **update-requirement-documentation** + **req-checker**. Prefer **partial** updates (README, API) when full app verification is out of scope.

10. **Contextual security**  
    **Skip if** `--no-security`.  
    **contextual-security-review** when scope warrants.

## Report formats

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

Re-invoke **backend-developer** with this report. After fixes and commit, re-run **7a**, **7a2**, and **7c** — omit sub-steps deactivated by `--no-tests` or `--no-security`.
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

Re-invoke **backend-developer** with this report. After fixes and commit, re-run 7a (unit), then 7a2 (build), then 7c when active.
```

Use **unit-test-validation** / **unit-test-generator** guidance for **Test Failure Report** format when 7a fails.

## Loop rules

- After **backend-developer** fixes: re-run **7a → 7a2 → 7c** (only active substeps).
- **Exit**: all active substeps pass, or **5 iterations** → ask user.

## Context management

Document & Clear between steps; **`/compact`** only between steps (~70%); never mid-sub-agent.

## End-of-command

Per-step commits (after step 6, loop 7, step 8) must already exist. End-of-command:

1. Stage and commit any remaining unstaged files (specs, reports, progress.md, step 9 outputs):
   ```bash
   git add .
   git commit -m "chore: {req-id} backend - finalize specs, docs, and reports"
   ```
   Skip if nothing unstaged.
2. Push: `git push -u origin {req-id}`.
3. Open PR targeting integration branch (`develop` or as configured).
4. Remove junk/scratch files before pushing.

## Usage

```
/backend-development <requisite-id> [--no-security] [--no-tests]
```

**Resume after /clear**: *"Read `.claude/docs/requirements/{req-id}/progress.md` and continue **backend-development** from the next indicated step."*

## Flow summary

**Step 0** (git init + branch) → **4a** → **4b** (if security) → **4d** (if greenfield) → **4e** (if migrations) → **5d** (if tests) → **6** (+ `/simplify` + commit) → **loop 7** (7a, 7a2, **no 7b**, 7c) + commit → **8** + commit → **9** (if tests) → **10** (if security) → push + PR.

# Backend Development (architecture → unit TDD → build + security)

> **Variable Resolution:** Read `.claude/settings.json` before execution. Resolve `{{VARIABLE_NAME}}` placeholders from `env`. Read `features` to determine which steps are active:
> - `features.test` (`true`/`false`) — when `false`, skip test steps (5d, 7a, 7a2, 9).
> - `features.security` (`true`/`false`) — when `false`, skip security steps (4b, 7c, 10).
> - `features.confirm` (`true`/`false`) — when `true`, stop after each completed step and wait for human confirmation before proceeding to the next step.

Run the **backend track** for the Transaction in `$ARGUMENTS`: architect the API implementation surface, **unit tests only (no functional/Robot test plan)**, **backend-developer** implementation, validation loop (**unit + build + code security** — **no** step 7b E2E/Robot/flow), traceability, documentation, and contextual security.

**Prerequisites**: Complete the **complete-development** trunk through **4api** (OpenAPI contract must exist). `{tx-id}-technical-solution-transaction.md` must include **backend scope**. If there is no backend scope, stop and tell the user to use **`/frontend-development`** only. A baseline must already exist for **every** backend project in scope (project folder, config files, dependency manifest). If any project is missing its baseline, stop and tell the user to run **`/generate-baseline`** for each missing project before continuing — there may be more than one.

**Functional tests** (test-plan 5, 5b, Robot 5c, E2E/flow **7b**) belong to **`/frontend-development`** only — do **not** run them in this command.

## Parameters

Interpret `$ARGUMENTS` as a token list (space-separated). The **first token** is the Transaction ID.

- **requisite-id** (required).

Feature keys come from `features` in `.claude/settings.json`:
- `features.security: false` — skip 4b, 7c, 10, and contextual security agents.
- `features.test: false` — skip 5d, 7a, 7a2, 9 documentation-update.

- **Path convention**: `{{PATH_DOCS}}/4-implementation/development/{tx-id}/` — `{tx-id}` equals the first argument.

## Resume and idempotency

1. Read `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md`.
2. Confirm OpenAPI exists and technical-solution assigns backend scope.
3. Continue from the first incomplete **backend track** step.
4. When updating `progress.md`, **merge** into **Notes** without deleting trunk history.

## Document & Compact (required after each step)

After **each** of: 4a, 4b, 4d (if ran), 5d, 6, each iteration of 7, 8, 9, 10 — apply **Document & Compact**.

**Progress file**: `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md`

### How to execute Document & Compact

1. **Document**: update with **Transaction**, **Completed step** (optional prefix `Backend track:`), **Current state**, **Next step**, **Context**, **Notes** (append).
2. **Compact**: ask the user to run **`/compact`**.
3. **Continue**: *"Read `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md` and continue **backend-development** from the next indicated step."*

**Exceptions**: not mid–loop-7.

### Suggested Notes subsection

```markdown
### Backend track
- Last completed: ...
- Pending: ...
```

## Confirmation Gate (`features.confirm`)

When `features.confirm` is `true`, apply a **confirmation gate** after every completed step (4a, 4b, 4d, 5d, 6, each loop-7 iteration, 8, 9, 10) — including steps that also trigger Document & Compact. After completing a step, stop and output:

```
**Step [X] complete** — [one-line summary of what was produced]
Next: **[Y]** — [one-line description of the next step]
Reply with anything to continue, or with instructions to redirect.
```

Wait for any user reply before proceeding. Do not continue autonomously. This gate does not update `progress.md` and does not request `/compact` — it is a lightweight checkpoint within the same session. Document & Compact rules still apply independently.

If `features.confirm` is `false`: no confirmation gate; proceed through steps without pausing.

## Step 0 — Git prerequisite (always runs first)

1. Run `git status`.
   - If successful: repo exists. Proceed to step 2.
   - If "not a git repository": **immediately run** (no prompt, no confirmation):
     ```bash
     git init
     git add .
     git commit -m "chore: initial commit of existing files"
     ```
2. Ensure feature branch exists for this Transaction:
   - If current branch is already `{tx-id}`: continue.
   - Otherwise: `git checkout -b {tx-id}` (or `git checkout {tx-id}` if branch already exists).

Document & Compact does **not** apply to Step 0.

## Flow order

4a. **Architect (backend only)**  
   **architect-transaction** → **backend-architect** (`.claude/agents/backend/backend-architect.md`) only → `{tx-id}-backend-tech-spec.md`. Inputs: complete Transaction, technical-solution Transaction, **OpenAPI** from trunk.

4b. **Architecture security review (backend tech-spec)**  
   **Skip if** `features.security` is `false`.  
   **architecture-security-review** + **security-architect**. Scope: `{tx-id}-backend-tech-spec.md`, `{tx-id}-complete-transaction.md`.

**Synchronization before unit TDD / Developer**  
   Order: **4a → 4b** (if `features.security`) **→ 4d** (if migrations) → **5d** or **6**. If `features.security` is `false`: **4a → 4d**.

4d. **Schema / Migrations (blocking when needed)**  
   Read `{tx-id}-backend-tech-spec.md` Critical issues section. If any migration items are listed:
   - Run each migration/schema command exactly as specified in the Critical issues section.
   - Verify database reflects expected schema before proceeding.
   - On failure: **stop and report** — do not proceed to implementation.
   - If no migration critical issues listed: skip 4d silently.

   Document & Compact after 4d when it ran (skip documenting when it did not run).

**No steps 5, 5b, or 5c** on this track.

5d. **Unit tests (TDD — Red)** (**skip if** `features.test` is `false`)  
   **unit-test-validation** (TDD) + **unit-test-generator** → backend unit tests only; must **fail** (Red) before step 6.

6. **Developer (backend)**  
   **backend-developer** (`.claude/agents/backend/backend-developer.md` or project equivalent).

   - **With tests:** `{tx-id}-backend-tech-spec.md` + failing unit tests from **5d**.
   - **With `features.test: false`:** tech-spec only after sync point (4a/4b/4d).

   After implementation, run **`/simplify`** on changed backend code (mandatory for step 6 completion).

   **Mandatory commit after step 6**: Once `/simplify` completes:
   ```bash
   git add .
   git commit -m "feat: implement {tx-id} backend - initial implementation"
   ```
   Step 7 does not begin until this commit exists.

7. **Developer ↔ Unit + Build + Code Security loop** (max **5** iterations)  
   **There is no 7b** (no flow-test, robot-tester, or UI E2E in this command).

   - If `features.test` is `false`: skip **7a** and **7a2**; run **7c** only unless `features.security` is also `false` → then skip all of step 7.
   - If `features.security` is `false`: run **7a** and **7a2** only (no **7c**).
   - If both `features.test` and `features.security` are `false`: skip step 7 entirely (go to 8 after step 6).

   - **7a. Unit tests** (**skip if** `features.test` is `false`): **unit-test-validation** validation mode; **Test Failure Report** on failure; re-invoke **backend-developer**.
   - **7a2. Build** (**skip if** `features.test` is `false`): backend build (e.g. `dotnet build`). **Build Failure Report** on failure.
   - **7c. Code security** (**skip if** `features.security` is `false`): **code-security-validation**; **Security Findings Report** for Critical/High.

   After fixes: re-run active substeps in order (**7a → 7a2 → 7c** as enabled).

   **Mandatory commit after loop 7**: When all active substeps pass:
   ```bash
   git add .
   git commit -m "fix: {tx-id} backend - post-validation fixes"
   ```
   Skip only if loop 7 was skipped entirely (both `features.test` and `features.security` are `false`).

8. **Code-tagger**  
   **add-code-traceability** + **code-tagger** — scope: **backend** changes.

   **Mandatory commit after step 8**:
   ```bash
   git add .
   git commit -m "chore: {tx-id} backend - add traceability tags"
   ```

9. **Documentation update**  
   **Skip if** `features.test` is `false`.  
   **update-transaction-documentation** + **tx-checker**. Prefer **partial** updates (README, API) when full app verification is out of scope.

10. **Contextual security**  
    **Skip if** `features.security` is `false`.  
    **contextual-security-review** when scope warrants.

## Report formats

### Security Findings Report (Critical/High)

```markdown
## Security Findings Report

- **Status**: has_critical_or_high
- **Source**: static-analysis-enforcer and/or code-security-auditor (and others if applicable)
- **Transaction**: {tx-id}

### Critical / High findings

| Severity | File / location | Description | Recommendation |
|----------|-----------------|-------------|----------------|
| ... | ... | ... | ... |

### Summary

- Total Critical: X
- Total High: Y
- Other (Medium/Low): Z (recommended to fix but not blocking)

### Recommendation

Re-invoke **backend-developer** with this report. After fixes and commit, re-run **7a**, **7a2**, and **7c** — omit sub-steps skipped because `features.test` or `features.security` is `false`.
```

### Build Failure Report

```markdown
## Build Failure Report

- **Status**: build_failed
- **Source**: build (step 7a2) — [technology/command used]
- **Transaction**: {tx-id}

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

Document & Compact between steps; **`/compact`** only between steps (~70%); never mid-sub-agent.

## End-of-command

Per-step commits (after step 6, loop 7, step 8) must already exist. End-of-command:

1. Stage and commit any remaining unstaged files (specs, reports, progress.md, step 9 outputs):
   ```bash
   git add .
   git commit -m "chore: {tx-id} backend - finalize specs, docs, and reports"
   ```
   Skip if nothing unstaged.
2. Push: `git push -u origin {tx-id}`.
3. Open PR targeting integration branch (`develop` or as configured).
4. Remove junk/scratch files before pushing.

## Usage

```
/backend-development <requisite-id>
```

Feature keys (`features.security`, `features.test`) are read from `.claude/settings.json`.

**Resume after /compact**: *"Read `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md` and continue **backend-development** from the next indicated step."*

## Flow summary

**Step 0** (git init + branch) → **4a** → **4b** (if `features.security`) → **4d** (if migrations) → **5d** (if `features.test`) → **6** (+ `/simplify` + commit) → **loop 7** (7a, 7a2, **no 7b**, 7c) + commit → **8** + commit → **9** (if `features.test`) → **10** (if `features.security`) → push + PR.

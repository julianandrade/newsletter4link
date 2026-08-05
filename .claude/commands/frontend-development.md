# Frontend Development (architecture → functional tests → TDD → E2E + security)

> **Variable Resolution:** Read `.claude/settings.json` before execution. Resolve `{{VARIABLE_NAME}}` placeholders from `env`. Read `features` to determine which steps are active:
> - `features.test` (`true`/`false`) — when `false`, skip test steps (5, 5b, 5c, 5d, 7a, 7a2, 7b, 9).
> - `features.security` (`true`/`false`) — when `false`, skip security steps (4b, 7c, 10).
> - `features.confirm` (`true`/`false`) — when `true`, stop after each completed step and wait for human confirmation before proceeding to the next step.

Run the **frontend track** for the Transaction in `$ARGUMENTS`: architect the UI, refine design, **functional test planning and Robot tests**, unit TDD, **frontend-developer** implementation, validation loop, traceability, documentation, and contextual security.

**Prerequisites**: Complete the **complete-development** trunk through **4api** (OpenAPI contract must exist). `{tx-id}-technical-solution-transaction.md` must include **frontend scope**. If there is no frontend scope, stop and tell the user to use **`/backend-development`** only. A baseline must already exist for **every** frontend project in scope (project folder, config files, dependency manifest). If any project is missing its baseline, stop and tell the user to run **`/generate-baseline`** for each missing project before continuing — there may be more than one.

## Parameters

Interpret `$ARGUMENTS` as a token list (space-separated). The **first token** is the Transaction ID.

- **requisite-id** (required): first argument (for example: `TX-002-editar-tarefa`).

Feature keys come from `features` in `.claude/settings.json`:
- `features.security: false` — skip 4b, 7c, 10, and contextual security agents.
- `features.test: false` — skip 5, 5b, 5c, 5d, 7a, 7a2, 7b, 9 documentation-update.

- **Path convention**: `{{PATH_DOCS}}/4-implementation/development/{tx-id}/` — `{tx-id}` equals the first argument (same as `{tx-id-name}` if used elsewhere).

## Resume and idempotency

1. Read `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md`.
2. Confirm OpenAPI artifacts exist and `{tx-id}-technical-solution-transaction.md` assigns frontend scope.
3. Continue from the first incomplete **frontend track** step (4a through 10), using artifacts (`{tx-id}-frontend-tech-spec.md`, `TestPlan/`, `functional-tests/web/{tx-id}/`, etc.).
4. When updating `progress.md`, **merge** new bullets into **Notes** (or track-specific bullets) without deleting trunk history from **complete-development**.

## Document & Compact (required after each step)

After **each** flow step (4a, 4b, 4c, 5, 5b, 5c, 5d, 6, each relevant iteration of 7, 8, 9, 10), apply **Document & Compact**.

When Track Test (5–5d) runs, document as substeps complete; apply Document & Compact at the sync point before step 6.

**Progress file**: `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md`

### How to execute Document & Compact

1. **Document**: update `progress.md` with **Transaction**, **Completed step** (prefix with `Frontend track:` if helpful), **Current state**, **Next step**, **Required context**, **Notes** (append; preserve trunk lines).
2. **Compact**: ask the user to run **`/compact`**.
3. **Continue**: *"Read `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md` and continue **frontend-development** from the next indicated step."*

**Exceptions**: not mid–loop-7, not inside the step 5 / 5b coverage loop. Pauses for test-plan clarifications (5b): document and wait for user like the original flow.

### Suggested additions under Notes

```markdown
### Frontend track
- Last completed: ...
- Pending: ...
```

## Confirmation Gate (`features.confirm`)

When `features.confirm` is `true`, apply a **confirmation gate** after every completed step (4a, 4b, 4c, 4.5, 5, 5b, 5c, 5d, 6, each loop-7 iteration, 8, 9, 10) — including steps that also trigger Document & Compact. After completing a step, stop and output:

```
**Step [X] complete** — [one-line summary of what was produced]
Next: **[Y]** — [one-line description of the next step]
Reply with anything to continue, or with instructions to redirect.
```

Wait for any user reply before proceeding. Do not continue autonomously. This gate does not update `progress.md` and does not request `/compact` — it is a lightweight checkpoint within the same session. Document & Compact rules still apply independently.

If `features.confirm` is `false`: no confirmation gate; proceed through steps without pausing.

## Step 0 — Git prerequisite (always runs first)

> **Scope rule**: All git operations in this step target the **frontend project directory** (e.g. `todoFrontend/`), **never the workspace root**. The workspace root must never be a git repository. Determine the project directory from `{tx-id}-technical-solution-transaction.md` (look for the project folder / repository field) or from the workspace structure in CLAUDE.md. All `git` commands below must be run from inside that project directory.

1. Identify the frontend project directory from the technical solution document.
2. Run `git status` **inside the project directory**.
   - If successful: repo exists. Proceed to step 3.
   - If "not a git repository": **immediately run** (no prompt, no confirmation) **from inside the project directory**:
     ```bash
     git init
     git add .
     git commit -m "chore: initial commit of existing files"
     ```
3. Ensure feature branch exists for this Transaction **inside the project directory**:
   - If current branch is already `{tx-id}`: continue.
   - Otherwise: `git checkout -b {tx-id}` (or `git checkout {tx-id}` if branch already exists).

Document & Compact does **not** apply to Step 0.

## Flow order

4a. **Architect (frontend only)**  
   **architect-transaction** (`.claude/skills/architect-transaction/SKILL.md`): invoke **frontend-architect** (`.claude/agents/frontend/frontend-architect.md`) only. Produce `{tx-id}-frontend-tech-spec.md`. Inputs: `{tx-id}-complete-transaction.md`, `{tx-id}-technical-solution-transaction.md`, **OpenAPI** (contract from trunk). If `{tx-id}-backend-tech-spec.md` does not exist yet, architect from OpenAPI and record gaps under **API Integration Contracts**.

4b. **Architecture security review (frontend tech-spec)**  
   **Skip if** `features.security` is `false`.  
   **architecture-security-review** (`.claude/skills/architecture-security-review/SKILL.md`) with **security-architect** (`.claude/agents/security/architecture/security-architect.md`). Scope: `{tx-id}-frontend-tech-spec.md`, `{tx-id}-complete-transaction.md`, OpenAPI as trust-boundary context. Follow the skill’s re-invoke loop for Critical/High.

4c. **UI/UX Designer**  
   **adjust-frontend-design** + **ui-ux-designer** (`.claude/agents/frontend/ui-ux-designer.md`) Phase 3 — refine `{tx-id}-frontend-tech-spec.md`. Layout / **Layout & Design Guidance** (or **UI/UX Constraints**) is **mandatory** for step 6.

**Synchronization before Track Test**  
 Order: **4a → 4b** (if `features.security`) **→ 4c** → Track Test or step 6 if `features.test` is `false`. If `features.security` is `false`: **4a → 4c**.

**4.5. Environment Setup (blocking — skip if `features.test` is `false`)**

Execute in order; **stop and report** on first failure — do not proceed to Track Test until all pass:

1. **API config**: Read `{tx-id}-frontend-tech-spec.md` for the backend API base URL. Verify that the frontend dev configuration (proxy config or API URL setting) points to that URL. Update if mismatched.
2. **Backend reachable**: HTTP check to backend base URL. If unreachable, block:
   ```
   ENVIRONMENT NOT READY — Backend not reachable at [url].
   Start the backend or set features.test to false in settings.json.
   ```
3. **Frontend running**: Verify the frontend dev server is accessible. If not, block:
   ```
   ENVIRONMENT NOT READY — Frontend dev server not running.
   Start the dev server or set features.test to false in settings.json.
   ```

Document & Compact after 4.5 when successful.

**Track Test then Developer (TDD)**  
   When tests are enabled: **5 → 5b (loop to 100%) → 5c (Robot) → 5d (frontend unit Red)**. Inputs: `{tx-id}-complete-transaction.md`, `{tx-id}-technical-solution-transaction.md`, `{tx-id}-frontend-tech-spec.md`, specs. **Step 6** runs only after Track Test completes (unless `features.test` is `false`). **Functional / Robot tests (5c) live only on this frontend track** — not on backend-development.

5. **Test-plan** (**skip if** `features.test` is `false`)  
   **create-test-plan** + **test-plan** agent → `TestPlan/` **`.robot`** files.

5b. **Validate test plan coverage** (**skip if** `features.test` is `false`)  
   **validate-test-plan-coverage**. Compare `.robot` in `TestPlan/` to Transactions and **frontend** tech-spec. Loop step 5 and 5b until 100% coverage; if doubts, create `{tx-id}-test-plan-clarifications*.md` and wait for the user.

5c. **Robot tests (functional-tests)** (**skip if** `features.test` is `false`)  
   **robot-tester** + **create-robot-functional-tests** → `functional-tests/web/{tx-id}/` (or path from config). Same folder naming rules as the legacy monolithic flow.

5d. **Unit tests (TDD — Red)** (**skip if** `features.test` is `false`)  
   **unit-test-validation** (TDD) + **unit-test-generator** → frontend unit tests only; they must **fail** (Red) before step 6.

6. **Developer (frontend)**  
   **frontend-developer** (`.claude/agents/frontend/frontend-developer.md` or project equivalent).

   - **With tests:** inputs: `{tx-id}-frontend-tech-spec.md` and **failing unit tests from 5d** (Green).
   - **With `features.test: false`:** tech-spec only; run after sync point (4a/4b/4c as applicable).

   **Layout** from 4c is mandatory.

   **Pre-implementation (frontend scope — mandatory):** Before writing any code, the Developer must:
   1. Read the `Dependencies` section of the tech-spec; for each package not present in `package.json` (or equivalent), install it — missing packages must be installed before implementation starts, not assumed to be present.
   2. If PNG screenshots exist at `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/screenshots/`, read every one to understand the expected visual output before writing a single line of UI code.
   3. If HTML mockup files exist at `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/html/`, read them ALL to extract exact color values, badge/chip styles, row state styles, spacing, layout structure, and component variants — the HTML files are the authoritative source for visual CSS details. Read order:
      - **First**: `{tx-id}-mockups.html` (consolidated) if it exists — it is always authoritative when present alongside individual files.
      - **Otherwise**: read every `*.html` file in the folder individually — list the directory first to discover all files.
      - Do **not** assume a consolidated file exists; always check the directory listing before deciding which files to read.
      Use the extracted values directly when implementing CSS.
   4. Check `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/components/` for component reference files:
      - **If the folder exists** → read every `.md` file before writing any component code. Each file maps a screen's UI elements to the exact design system component name, variant, and props to use. These are the authoritative guide for *which* components to pick; the HTML files remain the authoritative source for CSS/visual details. List the directory first to discover all files.
      - **If the folder is absent and the project uses a design system** (`{{PATH_DOCS}}/3-design/design-system/` exists or a design system package is in `package.json`) → stop and warn: "Component reference files are missing for {tx-id}. Re-run `/generate-mockup` to regenerate them before implementation." Do not proceed until the user confirms.
      - **If the folder is absent and no design system is present** → skip silently; proceed using HTML mockups and screenshots only.

   **Post-implementation visual check (frontend scope — mandatory):** After implementation and before committing, if mockups exist at `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/`:
   1. **Verify design tokens/styles loaded**: if the project uses a design system with CSS custom properties, open the app in Playwright and check that a known base token (e.g. a primary color or background token defined by the project's design system) resolves to a non-empty value via `getComputedStyle(document.documentElement).getPropertyValue('--<token-name>').trim()`. The specific token to check depends on the project — pick a fundamental one (e.g. primary brand color, base background). If the result is empty, design tokens failed to load; fix the import/setup (consult CLAUDE.md for the project's design token setup rule) before proceeding. Do not accept any visual comparison as valid when tokens are missing, because all design system colors will render as `transparent` or fallback values.
   2. Take a screenshot of each implemented screen using Playwright (navigate to the correct route, wait for the page to stabilize). Save screenshots to a **temporary OS temp directory** (e.g. `os.tmpdir()` / `$TMPDIR`) — **never inside the project repository**. Delete them after comparison.
   3. Compare each screenshot side-by-side against the corresponding mockup PNG in `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/screenshots/`: check structural completeness (app shell, navigation/sidebar, toolbar, required layout wrappers, design system components) and visual fidelity (colors, badges, row states, button variants).
   4. Cross-check color values and state styles against the HTML mockup files in `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/html/` (when they exist) — CSS class definitions in the HTML are the ground truth for exact shades and state-specific styles (e.g. active row background, badge colors, selected state outlines).
   5. Cross-check the implemented component tree against the component reference files in `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/components/` (when they exist) — verify that each screen uses the correct design system component names, variants, and required props as specified. Using a native HTML element or a wrong variant where a design system component is specified counts as a structural non-compliance and must be fixed.
   6. If any structural element is missing, any color/state diverges from the mockup, design tokens are not loaded, or a design system component is used incorrectly → fix before declaring step 6 complete. Do not proceed to `/simplify` or commit until the visual check passes.

   After implementation and visual check are complete, run the Claude built-in slash command **`/simplify`** on the changed code (feature scope) to reduce unnecessary complexity, improve clarity, and align with project conventions. **Execution of `/simplify` is mandatory**; step 6 is not complete until `/simplify` has been run and its improvements applied. Run `/simplify` after the developer agent finishes, not mid-implementation.

   **Mandatory commit after step 6**: Once `/simplify` completes:
   ```bash
   git add .
   git commit -m "feat: implement {tx-id} frontend - initial implementation"
   ```
   Step 7 does not begin until this commit exists.

7. **Developer ↔ Tests + Code Security loop** (max **5** iterations)

   - If `features.test` is `false`: skip 7a, 7a2, 7b; run **7c** only unless `features.security` is also `false` → then skip all of 7.
   - If `features.security` is `false`: run 7a, 7a2, 7b only (no 7c).
   - If both `features.test` and `features.security` are `false`: skip step 7 entirely (go to 8 after step 6).

   - **7a. Unit tests** (**skip if** `features.test` is `false`): **unit-test-validation** validation mode; **Test Failure Report** if failures; re-invoke frontend-developer.
   - **7a2. Build** (**skip if** `features.test` is `false`): frontend build (project build command per tech-spec). **Build Failure Report** if needed.
   - **7b. E2E / Flow** (**skip if** `features.test` is `false` — **otherwise BLOCKING**): Before first run, verify environment (same checks as Step 4.5: E2E runner installed, backend reachable, frontend running). If any check fails, **stop with blocking error** — "deferred" is not a valid outcome. Once environment confirmed: **e2e-flow-validation** (flow-test, robot-tester). Include **layout** checks vs `{tx-id}-frontend-tech-spec.md`. **E2E/Flow Failure Report** on failure.

     **Mockup comparison (mandatory when mockups exist):** If `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/screenshots/` contains PNG files, layout validation **must** include: (1) take a screenshot of each implemented screen via Playwright — save to a **temporary OS temp directory**, **never inside the project repository**, and delete after comparison; (2) compare each screenshot side-by-side against the corresponding mockup PNG; (3) any missing structural element (app shell, sidebar/navigation, toolbar, required design system components, layout wrappers) or visual divergence from the mockup **is layout non-compliance** and must be reported in the E2E/Flow Failure Report. Functional flow passing does not substitute visual/layout compliance.
   - **7c. Code security** (**skip if** `features.security` is `false`): **code-security-validation**. **Security Findings Report** for Critical/High.

   After fixes: re-run active substeps in order (see Loop rules below).

   **Mandatory commit after loop 7**: When all active substeps pass:
   ```bash
   git add .
   git commit -m "fix: {tx-id} frontend - post-validation fixes"
   ```
   Skip only if loop 7 was skipped entirely (both `features.test` and `features.security` are `false`).

8. **Code-tagger**  
   **add-code-traceability** + **code-tagger** — scope: **frontend** changes for this Transaction.

   **Mandatory commit after step 8**:
   ```bash
   git add .
   git commit -m "chore: {tx-id} frontend - add traceability tags"
   ```

9. **Documentation update**  
   **Skip if** `features.test` is `false`.  
   **update-transaction-documentation** + **tx-checker**. If the backend is not running yet, treat validation as **partial** and say so in the report; repeat step 9 after integration if needed.

10. **Contextual security**  
    **Skip if** `features.security` is `false`.  
    **contextual-security-review** when scope warrants.

## Report formats

When agents detect failures, use the markdown structures below (include in the response or save under `{{PATH_DOCS}}/4-implementation/development/{tx-id}/tests/`). Re-invoke **frontend-developer** with the report; then re-run active **7a → 7a2 → 7b → 7c** as enabled.

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

Re-invoke **frontend-developer** with this report. After fixes and commit, re-run the active validation sub-steps in order: **7a**, **7a2**, **7b**, **7c** — omit sub-steps skipped because `features.test` or `features.security` is `false`.
```

### E2E/Flow Failure Report

```markdown
## E2E/Flow Failure Report

- **Status**: has_failures
- **Source**: flow-test and/or robot-tester
- **Transaction**: {tx-id}

### Failed scenarios / flows

Include flow failures, Robot test failures, and **layout non-compliance** (when layout does not match `{tx-id}-frontend-tech-spec.md` Layout & Design Guidance).

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
- **Transaction**: {tx-id}

### Build errors

| File / location | Error message |
|-----------------|---------------|
| ... | ... |

### Recommendation

Re-invoke **frontend-developer** with this report. After fixes and commit, re-run 7a (unit), 7a2 (build), then 7b (E2E) — omit sub-steps skipped because `features.test` or `features.security` is `false`.
```

## Loop rules

- **7b active**: after developer fixes, always **7a → 7a2 → 7b**, then **7c** if active.
- **Layout non-compliance** in 7b = E2E failure; same report flow.
- **Exit**: all active substeps pass, or **5 iterations** reached → ask user for next action.

## Context management

Document & Compact between steps; **`/compact`** only between steps (~70% context); never mid-sub-agent.

## End-of-command

Per-step commits (after step 6, loop 7, step 8) must already exist. End-of-command:

1. Stage and commit any remaining unstaged files (specs, reports, progress.md, step 9 outputs):
   ```bash
   git add .
   git commit -m "chore: {tx-id} frontend - finalize specs, docs, and reports"
   ```
   Skip if nothing unstaged.
2. Push: `git push -u origin {tx-id}`.
3. Open PR targeting integration branch (`develop` or as configured).
4. Remove junk/scratch files before pushing.

## Usage

```
/frontend-development <requisite-id>
```

Feature keys (`features.security`, `features.test`) are read from `.claude/settings.json`.

**Resume after /compact**: *"Read `{{PATH_DOCS}}/4-implementation/development/{tx-id}/progress.md` and continue **frontend-development** from the next indicated step."*

## Flow summary

**Step 0** (git init + branch) → **4a** → **4b** (if `features.security`) → **4c** → **4.5** (if `features.test`) → **5 → 5b → 5c → 5d** (if `features.test`) → **6** (+ `/simplify` + commit) → **loop 7** (7a, 7a2, 7b BLOCKING, 7c) + commit → **8** + commit → **9** (if `features.test`) → **10** (if `features.security`) → push + PR.

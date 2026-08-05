---
name: hollow-development
description: Implement exactly one artefact (DE, SCR, TX, or NTI) from the artefact catalog end-to-end — resolve it, generate a minimal real implementation, generate only the tests appropriate to its type, then security-review the generated code. A fast, single-artefact alternative to complete-development-tree/complete-development, with no clarification rounds and no multi-transaction orchestration. Use when asked to "implement this artefact", "hollow-develop <artefact-id>", or invoked as /hollow-development <artefact-id>. Stops (does not implement) if the artefact is BI/BR/EV, or if the target project's skeleton doesn't exist yet.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Hollow Development

Implement **one** artefact from the shared catalog (`{{PATH_DOCS}}/1-analysis/artefacts/{BI,BR,DE,EV,NTI,SCR,TX}/`) — nothing more, nothing less. This skill deliberately skips the ceremony of `complete-development` (no Clarify, no Architect, no complete-transaction document, no worktrees): it goes straight from the resolved artefact to a working "hollow" (minimal but real) implementation, the tests that artefact's type calls for, and a security pass — then stops.

**Genericity requirement**: this skill must work unmodified against *any* project's catalog, regardless of domain, entity names, field sets, artefact count, or target tech stack. Never hardcode a specific entity/field/business-rule name or a specific language/framework anywhere in this process — always read them from the resolved artefact and from whatever the target project's manifest/tech-design actually says.

## Where Used

- Direct invocation only: `/hollow-development <artefact-id>` or "implement artefact `<id>`". Not a step inside `frontend-development`/`backend-development`/`complete-development` — those flows use `ingest-artefact-transaction` + the full pipeline instead.

## When to Use

- User wants **one** SCR/TX/NTI artefact turned into working code + tests + a security check, quickly, without the full clarify/architect/worktree pipeline.
- Not for: implementing more than one artefact in a single run (invoke once per artefact id), or for artefacts that aren't independently implementable (`BI`/`BR`/`EV` — see Step 1).

## Inputs

- `<artefact-id>` — required. Any ID from the invoking project's `{{PATH_DOCS}}/1-analysis/artefacts/` catalog.
- The catalog itself, at `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md`, and whatever it references one level deep.
- The target project's own source tree (`backend/`, `frontend/`, or whatever those are named for this project) and its manifest files.

## Process

### 1. Resolve type & validate implementability

- **Capture `T0`** (Bash `date +%s`) before doing anything else in this run — the start of the
  "Resolution" goal bucket used by Step 8's Time section.
- Infer `{TYPE}` from the id prefix: `BI-`→BI, `BR-`→BR, `DE-`→DE, `EV-`→EV, `NTI-`→NTI, `SCR-`→SCR, `TX-`→TX.
- **Implementable**: `DE`, `SCR`, `TX`, `NTI`. **Not implementable**: `BI`, `BR`, `EV` — these are structural/reference artefacts only, never a standalone unit of work in this project's catalog convention.
  - `BI`/`BR`/`EV` are resolved one level deep as **read-only reference metadata** into whichever `DE`/`SCR`/`TX`/`NTI` references them (see Step 3), and their content is materialized *inside* that implementing artefact — a `BR-*` rule becomes validation/logic in the code, an `EV-*` event becomes the button/action or emitted/handled event on the artefact that references it (see Step 4). They never get their own generation pass or file.
  - A `DE` **may be implemented as its own pass** (its entity/table generated directly, see Step 4's `DE-*` branch) **or** created as a side effect the first time a `TX`/`NTI` that references it is implemented (see Step 4, "DE side effect"). Both paths produce the **same** entity/table under the same stack-idiomatic name — reuse it, never regenerate or duplicate.
- If `<artefact-id>` is not implementable: **stop**. Search the catalog for implementable artefacts that reference this id (grep every `{TYPE}/*.md` file's `meta` block for the id — do not assume which ones without checking) and report them as the actual candidates for `/hollow-development`.
- If `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md` does not exist: **stop** and report — do not guess or fabricate.

### 2. Detect the target project's actual stack

Do not assume any specific language or framework — detect it fresh each run:

- `SCR-*` → target is the project's frontend app. Look for a project tech-design doc under `docs/3-design/` first (it usually names the stack and the source directory); otherwise locate a recognizable frontend manifest (`package.json` with a frontend framework dependency, `angular.json`, etc.) under whatever directory the project uses for its frontend (commonly `frontend/`, but confirm — don't assume the name).
- `TX-*` / `NTI-*` / `DE-*` → target is the project's backend app (a `DE` is a persisted entity/table). Same approach: tech-design doc first, else a backend manifest (`pom.xml`, `*.csproj`, a Node `package.json` with a backend framework, etc.) under whatever directory holds it (commonly `backend/`).
- Once a manifest is found, match it to the corresponding stack skill in this repo (`.claude/skills/frontend/*/SKILL.md` or `.claude/skills/backend/*/SKILL.md`, e.g. `react`, `dotnet`) — that skill's folder layout, naming, and test-runner conventions govern Steps 4–5. If the manifest doesn't match any stack skill in this repo, still proceed using the manifest's own idiomatic conventions, but note in the final report that no matching stack skill was found.
- **No manifest at all** (skeleton missing) → **stop**. Report: "No `{frontend|backend}` skeleton found for `<artefact-id>`'s target. Run `generate-baseline` for the appropriate stack first (see `.claude/skills/generate-baseline/SKILL.md`)." Never bootstrap a project from inside this skill.
- **Git repo check**: once the target directory is known, check whether it (or an ancestor, up to the workspace root) is already a git repo (`git rev-parse --is-inside-work-tree`). If not, run `git init` in that target directory before Step 4 begins — Step 6's commit needs a repo to commit into.

### 3. Ingest the artefact (one-level resolution)

Reuses the resolution algorithm `ingest-artefact-transaction` already applies to TX/NTI (`.claude/skills/ingest-artefact-transaction/SKILL.md`), extended here to also accept `SCR` and `DE` as the primary target:

1. Read `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md`; parse its `meta` block (`references`, `mentions`, `screens`, `others`, `flows_to`, `roles`, `kind`). For a `DE-*` primary target, also read its **Fields table** (`Field | Format | Allowed Values | Mandatory | Notes`) — that table is the entity contract Step 4 builds from.
2. For every id collected there, infer its type from its own prefix and read `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md` — **one level only**, do not recurse further.
3. Collect every non-implementable referenced artefact and keep its content verbatim — never paraphrase:
   - Every `BR-*` mentioned by the target artefact **and** by every `DE-*`/`SCR-*` it references (rules often attach to the field/entity, not the TX/NTI/SCR itself) — keep its rule text.
   - Every `EV-*` referenced by the target artefact — keep its `title`/`description`/`trigger_type`. These events are never their own file; they must be materialized inside this artefact in Step 4 (e.g. `TX-001` references `EV-001`/`EV-002`). Do the same for any other non-implementable referenced type.
4. **Gap = hard stop, not a pause**: if any referenced id fails to resolve, or the target artefact's contract (fields, validations, filters, steps) is ambiguous, **stop** and report the specific gap. Unlike the full flow, `hollow-development` has no Clarify step to ask the user — ambiguity here means the artefact isn't ready for a hollow pass.
5. Do **not** write a `{id}-complete-transaction.md` or any file under `{{PATH_DOCS}}/1-analysis/artefacts/**` (read-only catalog, shared by other artefacts/transactions). Go straight from the resolved bundle to code.
6. **Capture `T1`** (Bash `date +%s`) once resolution is done — closes the "Resolution" bucket (Steps 1–3).

### 4. Generate the hollow implementation

Minimal but real — implements exactly what the resolved artefact bundle states, in the stack detected in Step 2, following that stack's own skill for layout/naming (do not invent conventions):

- **Technical specification**: before writing code, read the project's technical documentation at `{{PATH_DOCS}}/3-design/technical-documentation` (architecture, integration contracts, naming/layout decisions, constraints) and take it into account for every implementation choice in this step — endpoint/service shape, entity/table design, module placement, naming. The resolved artefact bundle (Step 3) defines *what* to build; this technical documentation constrains *how* it fits the rest of the system. If it conflicts with the artefact bundle on a point the artefact doesn't itself decide, follow the technical documentation. If a genuine contradiction exists between the two, **stop** and report it as a gap (same handling as Step 3's gap rule) rather than silently picking one.

- **`SCR-*`**: a screen/view/component with exactly the fields, buttons, and On-Load/steps present in the artefact, wired to whichever `TX-*`/`NTI-*` endpoint(s) it invokes (per its `meta.screens`/references). If those endpoints don't exist yet in the backend, still implement the frontend call against the contract the TX/NTI artefact defines — do not silently invent a different endpoint just because backend code is absent (report it as a follow-up in Step 9's output instead). File(s) implementing the screen (`.html`, `.ts`/`.tsx`/`.jsx`, styles, spec/test, etc.) must be named exactly after `<artefact-id>` — same case, differing only by extension (e.g. artefact `SCR-TK-Add-Task` → `SCR-TK-Add-Task.html`, `SCR-TK-Add-Task.ts`) — overriding the target stack's own casing convention (e.g. kebab-case or PascalCase component file naming) for this file only.
- **`TX-*`**: an endpoint/handler + service-layer method implementing every row of its Entry Conditions / Validation / Result tables verbatim, plus every resolved `BR-*` rule text.
- **`NTI-*`**: a query endpoint/handler implementing its Data Sources / Filters / Output Specification verbatim.
- **`DE-*`**: the entity/model class + migration/table for this entity, built from its Fields table (Step 3) per the detected stack's convention — each `Field` → a column/property, `Format` → the type (e.g. `texto livre (máx. 150)` → a bounded string, `data` → date, `enum` → an enum), `Allowed Values` → the enum members, `Mandatory` → nullability/required, and any `Notes` initial-value (e.g. "Valor inicial: Pendente") → the field default. Plus every resolved `BR-*` attached to a field. Name the entity by the **stack-idiomatic domain name** derived from the artefact's title (e.g. "Tarefa (Todo)" → the stack's `Task`/`Tarefa` entity), **not** `DE-<id>` — so a `TX`/`NTI` that references this `DE` reuses the exact same entity. If the entity already exists (from a prior run or the "DE side effect" below), reuse it as-is; do not regenerate or duplicate. Do not persist the artefact's `synthetic` seed data unless the target stack's convention calls for seed/fixtures.
- **Referenced `EV-*` (materialize, don't skip)**: for every `EV-*` resolved in Step 3, realize it inside *this* artefact per its `trigger_type` — a `user-action` event becomes the button/action wiring on the `SCR`/`TX` that references it (e.g. `EV-001` "Clique em Nova Tarefa" → the "Nova Tarefa" trigger on the screen/flow), a system/domain event becomes the emitted or handled event in the `TX`/`NTI`. An `EV-*` is never its own file — it exists only inside the implementable artefact that references it, wired where that artefact's steps/tables invoke it.
- Every field name, entity name, enum value, and business rule in the generated code must come from the resolved artefact bundle (Step 3) — never from an example, a guess, or a prior run's memory of a different project.
- **DE side effect**: if a `TX-*`/`NTI-*` references a `DE-*` whose entity/table does not yet exist in the target project (i.e. it wasn't already created by its own `DE-*` pass), create it now (entity/model class + migration or table, per the detected stack's own convention, built from the `DE`'s Fields table exactly as the `DE-*` branch above does) as part of implementing this artefact. If the entity already exists (from a `DE-*` pass, an earlier `hollow-development` run, or the full flow), reuse it as-is; do not regenerate, rename, or duplicate it.
- **Capture `T2`** (Bash `date +%s`) once this step's code (including any DE side effect) is written — closes the "Implementation" bucket.

### 5. Generate tests for this artefact's type only

Use whichever test runner is already configured in the target project's manifest (read it — never assume Jest/JUnit/xUnit/Vitest/etc. without checking):

- **`SCR-*`**: a UI/component test covering the screen's field validation, button actions, and navigation steps exactly as written in the artefact. Same `<artefact-id>`-exact naming rule as Step 4 applies to the test file.
- **`TX-*` / `NTI-*`**: a unit test covering every Validation/Result (or Filter/Output) row and every resolved `BR-*` rule from Step 3.
- **`DE-*`**: a persistence/mapping test covering the entity's fields, mandatory constraints, enum allowed-values, and any field default, using the configured runner. If the target stack offers no meaningful unit test for a bare entity + migration, instead run the build and apply the migration to verify the schema is valid, and record in the Step 8 notes that no behavioral test applies to this entity.
- Generate nothing beyond the target artefact's own type — implementing a `TX` does not also produce `SCR` tests, and vice versa.
- Tests are expected to pass against the implementation from Step 4 (this is not TDD/red-phase — implementation and tests are produced together in this hollow pass). Run the suite; if it fails, fix the implementation (not the test) unless the test itself is provably wrong, then re-run until green.
- **Capture `T3`** (Bash `date +%s`) once the suite is green — closes the "Testing" bucket.

### 6. Commit

Once Step 5's tests pass (green), commit the changes from Steps 4–5 in the target repo:

- Stage only the files created/modified for this artefact (implementation + tests + any DE-side-effect entity/migration) — never a broad `git add -A`/`git add .` that could sweep in unrelated in-progress work.
- Commit message: reference `<artefact-id>` and a one-line summary of what was implemented (e.g. `TX-014: implement create-task endpoint + service validation`).
- This repeats after Step 7's security-fix loop too, if that loop changes any already-committed file: re-run tests, then commit the fix as a follow-up commit (never amend/force-push).
- **Capture `T4`** (Bash `date +%s`) once the commit is made — closes the "Commit" bucket.

### 7. Security-review the generated code

Reuse the existing agent sequence — do not reimplement it — exactly as `.claude/skills/code-security-validation/SKILL.md` defines it, scoped only to the files created/modified in Steps 4–5:

1. `static-analysis-enforcer` (`.claude/agents/security/code/static-analysis-enforcer.md`) — always.
2. `code-security-auditor` (`.claude/agents/security/code/code-security-auditor.md`) — always.
3. `secrets-auditor` (`.claude/agents/security/supply-chain/secrets-auditor.md`) — scan the changed files, always.
4. `dependency-vuln-scanner` (`.claude/agents/security/supply-chain/dependency-vuln-scanner.md`) — only if this run touched a dependency manifest (`package.json`, `pom.xml`, `*.csproj`).
5. On any Critical/High finding: produce the Security Findings Report in the exact format `code-security-validation/SKILL.md` defines, fix the code, re-run steps 1–4 on the fix, and repeat until clean — do not hand back unresolved Critical/High findings.
6. Contextual agents (`auth-security-specialist`, `cloud-security-reviewer`, `runtime-security-tester`) only if the artefact's scope justifies it (e.g. it touches auth, IaC, or a runtime-reachable surface) — not by default.
7. **Capture `T5`** (Bash `date +%s`) once the security review (and any fix-and-rerun loop) is fully resolved — closes the "Security Review" bucket.

### 8. Document decisions & notes

Since this pass has no Clarify/Architect step and produces no `{id}-complete-transaction.md`, its decisions must still land somewhere persistent — not just in the chat report (Step 9), which disappears once the conversation ends:

- Create (or reuse, if a prior `hollow-development` run already created it) `{{PATH_DOCS}}/4-implementation/development/{artefact-id}/{artefact-id}-notes.md`. This is the same base location used by the full `complete-development` flow for transaction documentation (see `{{PATH_DOCS}}/4-implementation/development/README.md`), scoped here to a per-artefact-id folder rather than a per-transaction one.
- Write it as decisions happen during Steps 2–6, not reconstructed from memory afterward. Capture at least:
  - Stack detected in Step 2 (or the "no matching stack skill found" note).
  - Any `DE` side-effect entity/table/migration created in Step 4.
  - Any assumption or ambiguity resolution taken without a Clarify step, and any follow-up deferred (e.g. a `SCR-*` calling an endpoint that doesn't exist yet in the backend).
  - Any security finding from Step 7 that required a fix-and-rerun loop, and how it was resolved.
  - The commit(s) made in Step 6 (and any follow-up commit from Step 7), by hash/message.
- State explicitly in the file that this is a **hollow/skeleton pass** artifact — not a substitute for `{id}-complete-transaction.md` and not part of the read-only artefact catalog (`1-analysis/artefacts/**`, which Step 3 already forbids writing to).
- **Time**: include a Markdown table breaking down how long this artefact took, one row per goal
  bucket plus a Total row, computed from the timestamps captured through Steps 1–7 (`T0`–`T5`).
  **Capture `T6`** (Bash `date +%s`) once this section is written — it closes the "Documentation"
  bucket and is used as the end-of-run timestamp for Total. Format (durations in minutes, rounded):

  | Goal | Duration |
  |---|---|
  | Resolution | `(T1-T0)` |
  | Implementation | `(T2-T1)` |
  | Testing | `(T3-T2)` |
  | Commit | `(T4-T3)` |
  | Security Review | `(T5-T4)` |
  | Documentation | `(T6-T5)` |
  | **Total** | `(T6-T0)` |

  If a step was skipped or repeated (e.g. Step 7's fix-and-rerun loop re-entered Steps 6/7), fold the
  extra time into that bucket rather than adding new rows — the table stays fixed-shape across every
  artefact, regardless of stack or how many fix loops ran.

### 9. Report

End every run with:

- Artefact implemented (`<id>`, type, one-line summary from its `meta`).
- Target project + detected stack (or "no matching stack skill found" note from Step 2).
- Files created/modified (implementation + tests + any DE-side-effect entity/migration + the Step 8 notes file).
- Test results (pass/fail count).
- Commit(s) made in Step 6 (and any Step 7 follow-up commit), by hash/message.
- Security findings summary (clean, or the resolved Security Findings Report).
- Total implementation time, plus the per-goal breakdown, from Step 8's Time table.
- Explicit note: this is a **hollow/skeleton pass** — no clarifications were asked, no architecture review ran, and no `{id}-complete-transaction.md` paper trail was produced. If the project needs that rigor, use `/complete-development` (or `/complete-development-tree`) instead.

## Reference

- **Resolution algorithm (extended to SCR)**: `.claude/skills/ingest-artefact-transaction/SKILL.md`
- **Catalog reference-integrity precedent**: `.claude/skills/validate-transaction/SKILL.md` ("Artefact-catalog source" section)
- **Test-generation convention**: `.claude/skills/unit-test-validation/SKILL.md` (TDD-mode shape, adapted here to same-pass implementation+tests rather than red-phase-first)
- **Security pass (reused, not reimplemented)**: `.claude/skills/code-security-validation/SKILL.md` and `.claude/agents/security/**`
- **Skeleton prerequisite**: `.claude/skills/generate-baseline/SKILL.md`
- **Technical specification (must be consulted in Step 4)**: `{{PATH_DOCS}}/3-design/technical-documentation`
- **Per-stack code-layout conventions**: `.claude/skills/frontend/*/SKILL.md`, `.claude/skills/backend/*/SKILL.md` — whichever matches the project detected in Step 2
- **Decisions/notes folder convention (Step 8)**: `{{PATH_DOCS}}/4-implementation/development/README.md`

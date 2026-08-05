---
name: phased-development
description: Implement every artefact in the shared catalog end-to-end, in a fixed phase order — DE (tables) → NTI (read queries) → TX (write transactions) → SCR (screens) — by delegating each artefact, one at a time, to hollow-development. Generic and catalog-driven: it processes whatever DE/NTI/TX/SCR files exist, with no hardcoded ids, entity names, counts, or stack. Use when asked to "implement all artefacts", "phased development", "build the whole catalog in order", or invoked as /phased-development. Stops the entire run on the first artefact that hollow-development cannot implement.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Phased Development

Implement **every** implementable artefact in the shared catalog (`{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/`), in a fixed dependency-driven phase order, by running `hollow-development` once per artefact. This skill is the multi-artefact, ordered counterpart to `hollow-development`: it owns *ordering and orchestration only* — it does **not** reimplement how a single artefact is built, tested, or secured; each artefact goes through the unmodified `hollow-development` flow (`.claude/skills/hollow-development/SKILL.md`).

**Genericity requirement**: this skill must work unmodified against *any* project's catalog, regardless of domain, entity names, field sets, artefact count, or target tech stack. Never hardcode a specific artefact id, entity/field/business-rule name, artefact count, or a specific language/framework. Read everything from whatever files actually exist in the catalog.

## Where Used

- Direct invocation only: `/phased-development` or "implement all artefacts in order". Not a step inside another flow.

## When to Use

- User wants the whole catalog turned into working code + tests + security checks, in one ordered pass.
- Not for: implementing a single artefact (use `/hollow-development <id>` directly), or when the artefacts need the full clarify/architect/worktree pipeline (use `/complete-development` / `/complete-development-tree`).

## Inputs

- None required. The catalog at `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md` is the sole source of work.

## Phase order & rationale

Fixed order, driven by dependency layering:

1. **DE** — data entities (tables). Foundational: everything persists into them.
2. **NTI** — non-transactional interactions (read/query behavior over the entities).
3. **TX** — transactions (write behavior that changes system state).
4. **SCR** — screens (frontend), which invoke NTI/TX endpoints and chain to other screens.

Only these four types get a phase. `BI`/`BR`/`EV` are **not** standalone-implementable and get **no phase of their own** — they are resolved and materialized *inside* the `DE`/`NTI`/`TX`/`SCR` artefacts that reference them (a `BR-*` rule becomes validation/logic; an `EV-*` event becomes a button/action or an emitted/handled event), by `hollow-development` Steps 3–4. They therefore still end up present in the final system, just never as a separate build step.

## Process

Sequential and fail-fast — never parallel (order and stop-on-failure both matter).

### 1. Resolve configuration

- Read the `env` object of `.claude/settings.json` (and `.claude/settings.local.json` if present) to resolve `{{PATH_DOCS}}`.

### 2. Discover artefacts (generically)

- For each phase type in order (`DE`, `NTI`, `TX`, `SCR`), list the files matching `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/*.md`.
- If a type's folder is missing or contains no artefact files, **skip that phase** and note it — do not invent artefacts. Only files that actually exist are processed.
- Do not assume how many artefacts exist per type or what their ids are — take exactly what the directory listing returns.

### 3. Order within a phase

- Sort each phase's artefacts by their id in ascending natural/numeric order (the zero-padded sequential suffix, lowest first). The filename (without extension) is the artefact id.

### 4. Delegate each artefact to hollow-development

- Walk the phases in order (`DE` → `NTI` → `TX` → `SCR`), and within each phase walk the ordered artefacts, running the **`hollow-development` flow** (`.claude/skills/hollow-development/SKILL.md`) for that single artefact id — **one at a time, sequentially**. Do not start the next artefact until the current one has finished its full `hollow-development` pass (implementation → type-appropriate tests → commit → security review).
- Do not reimplement or shortcut any part of `hollow-development`; this skill only decides *which* artefact runs *when*.
- `hollow-development` is idempotent about shared entities (a `DE` created directly in the DE phase is reused, not duplicated, when a later `TX`/`NTI` references it), so re-running `phased-development` on a partially-built catalog is safe.

### 5. Stop on first failure

- If `hollow-development` hard-stops for an artefact — unresolved referenced id, missing skeleton, a contradiction between the artefact and the technical documentation, or tests it cannot get green — **halt the entire run immediately**. Do not continue to the next artefact or the next phase.
- Report the failing artefact's id, its phase, and the exact reason `hollow-development` gave. A later artefact usually depends on an earlier one, so continuing past a failure would build on a broken foundation.

### 6. Report

End the run with:

- The phases processed and, per phase, the artefacts attempted in order.
- Per artefact: succeeded / not reached, and a one-line summary rolled up from each `hollow-development` run (files, tests, commit, security, and its Total time from its own notes file's Time table).
- If the run halted: which artefact stopped it, in which phase, and why — plus which artefacts were never reached.
- Any phase skipped because its type folder was empty/absent.
- Total wall-clock time across the whole run — the sum of every completed artefact's own Total (from
  each `{artefact-id}-notes.md`'s Time table), not a separately-measured duration. If the run halted
  partway, sum only the artefacts that actually completed and say so.

## Reference

- **Per-artefact implementation flow (delegated to, not reimplemented)**: `.claude/skills/hollow-development/SKILL.md`
- **Artefact resolution algorithm (used inside hollow-development)**: `.claude/skills/ingest-artefact-transaction/SKILL.md`
- **Catalog path convention**: `{{PATH_DOCS}}/1-analysis/artefacts/{BI,BR,DE,EV,NTI,SCR,TX}/{id}.md` (read-only, shared)

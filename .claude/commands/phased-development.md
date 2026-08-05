# Phased Development (the whole catalog, in dependency order)

> **Variable Resolution:** Read `.claude/settings.json` before execution and resolve `{{VARIABLE_NAME}}` placeholders from `env`. Feature flags live in `.claude/features.json` in this project, not in `settings.json`; see that file for why.

Run `/hollow-development` once per artefact, over the entire catalog, in a fixed dependency-driven order. Orchestration only: it does not reimplement any part of how an artefact is built.

The whole behaviour is defined in [`.claude/skills/phased-development/SKILL.md`](../skills/phased-development/SKILL.md). This command file exists so the flow is listed alongside the others; it adds no steps of its own. Follow the skill.

## Parameters

None. The catalog under `{{PATH_DOCS}}/1-analysis/artefacts/` is the sole source of work.

## Phase order

1. **DE** — data entities. Foundational; everything persists into them.
2. **NTI** — read and query behaviour over those entities.
3. **TX** — write behaviour that changes state.
4. **SCR** — screens, which invoke the NTI and TX endpoints and chain to other screens.

`BI`, `BR` and `EV` get no phase. They are materialized inside the artefacts that reference them.

## Execution rules

- **Sequential, never parallel.** Order matters, and so does stop-on-failure.
- **Discovery is generic.** List whatever `*.md` files exist per type folder. A missing or empty folder means skip that phase and note it. Never invent artefacts or assume counts.
- **Within a phase**, sort by id in ascending natural order.
- **Fail fast.** The first hard stop halts the whole run and reports the failing artefact, its phase, the reason, and which artefacts were never reached.
- **Safe to re-run.** `hollow-development` is idempotent about shared entities, so re-running over a partially built catalog duplicates nothing.

## Before the first run in this project

The catalog is scaffolded but **empty**. `/phased-development` will report every phase as skipped until artefacts exist under `{{PATH_DOCS}}/1-analysis/artefacts/`. Populate it first, then check reference integrity: every id in every `references`, `mentions`, `screens` and `others` block must resolve to a real file. That is the single biggest failure mode, and neither flow will guess.

The six existing requirements (`RQ-002` through `RQ-007`) are **not** in the catalog and are not meant to be; see [`docs/AIDLC.md`](../../docs/AIDLC.md) for why they stay where they are.

## Related

- `/hollow-development <id>` — one artefact.
- `/complete-development <tx-id>` — the full-rigor track.

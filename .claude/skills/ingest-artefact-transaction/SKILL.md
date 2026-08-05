---
name: ingest-artefact-transaction
description: Resolve a TX or NTI artefact from the shared catalog ({{PATH_DOCS}}/1-analysis/artefacts/{BI,BR,DE,EV,NTI,SCR,TX}/) — following its references/mentions/screens/others meta block one level deep into BI/BR/DE/EV/NTI/SCR — and assemble {tx-id}-complete-transaction.md in the per-transaction working folder. Use when executing steps 0/1/3 (Validate/Clarify/Specify) in complete-development against the artefact-catalog input format, or when asked to "ingest artefact", "resolve TX/NTI artefact", "montar complete-transaction a partir do catálogo".
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Ingest Artefact Transaction

Use this skill when the Transaction/NTI **source** is not a single free-prose document but a **pre-analysed artefact catalog**, split by type:

```
{{PATH_DOCS}}/1-analysis/artefacts/
├── BI/BI-XXX.md      # Business Intention
├── BR/BR-XXX.md      # Business Rule (canonical text)
├── DE/DE-Name.md     # Data Entity
├── EV/EV-XX-XXX.md   # Event / trigger
├── NTI/NTI-Name.md   # Non-Transactional Interaction (query/listing)
├── SCR/SCR-XX-Name.md # Screen
├── TX/TX-XX-NNN.md   # Transaction (state model)
└── StoryNarratives/{TYPE}-Business.json  # optional fast index per type: id → {say, heading, expect}
```

Each artefact file has a `meta` block (`references`, `mentions`, `screens`, `others`, `flows_to`, plus `title`/`summary`/`description`, and for TX/NTI often `roles`/`kind`) that cross-links IDs across types.

This skill **replaces step 3 (Specify)** and feeds step 1 (Clarify) with a **gap list** instead of a blank slate: rather than writing `{tx-id}-complete-transaction.md` from scratch, it **resolves and merges** the artefact graph already authored for that TX/NTI into the same file, in the same shape `specify-transaction` (`.claude/skills/specify-transaction/SKILL.md`) already produces — so steps 3a onward, and the backend/frontend tracks, need **no changes**.

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 0 (source location + reference-integrity check), step 1 (gap list for Clarify), step 3 (assembles `{tx-id}-complete-transaction.md`).
- Only applies when the Transaction/NTI's source lives in the artefact catalog (`{{PATH_DOCS}}/1-analysis/artefacts/TX/` or `/NTI/`). If instead a legacy free-prose `{tx-id}.md` exists directly under `{{PATH_DOCS}}/4-implementation/development/{tx-id}/`, use `specify-transaction` as before — the two sources are not both expected for the same TX/NTI.

## The per-transaction working folder does not change

`{{PATH_DOCS}}/4-implementation/development/{tx-id}/` (create if missing) keeps receiving every **generated** artefact exactly as before: `{tx-id}-clarifications.md`, `{tx-id}-complete-transaction.md`, `{tx-id}-technical-solution-transaction.md`, tech-specs, `progress.md`, `_tree.md`. The only thing that moves is the **source** being read: instead of a free-prose `{tx-id}.md` inside that folder, it is the structured artefact at `{{PATH_DOCS}}/1-analysis/artefacts/{TX|NTI}/{tx-id}.md`, which lives outside the per-transaction folder and is **read-only** (never edited by this flow — it is shared/reused by other transactions).

## Process

1. **Resolve the id and type**: `{tx-id}` (or `{nti-id}`) from context/arguments. Type = `TX` if prefix is `TX-`, `NTI` if prefix is `NTI-`.
2. **Read the source artefact**: `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md`. If it does not exist, stop and report — do not fall back to inventing content.
3. **Parse the `meta` block**: extract `references`, `mentions`, `screens`, `others`, `flows_to`, `roles`, `kind`, `title`, `summary`, `description`.
4. **Build the artefact index** (fast path): if `{{PATH_DOCS}}/1-analysis/artefacts/StoryNarratives/{TYPE}-Business.json` exists for a referenced type, use it first to confirm the ID exists and grab a one-line summary before opening the full file — avoids opening hundreds of files just to check existence.
5. **Resolve one level deep**: for every ID collected in step 3, infer its type from the ID prefix (`BI-`→BI, `BR-`→BR, `DE-`→DE, `EV-`→EV, `NTI-`→NTI, `SCR-`→SCR) and read `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/{id}.md`. Do **not** recurse further (e.g. do not also resolve the DE's own `mentions`) — one level only, same rule `generate-storyline-docs` already applies to FK resolution (`.claude/skills/generate-storyline-docs/SKILL.md`, "FK depth" guideline).
6. **Collect Business Rules**: gather every `BR-*` id mentioned by the TX/NTI itself **and** by every DE/SCR it references (BRs are often attached to the field/entity they constrain, not to the TX). For each, read `{{PATH_DOCS}}/1-analysis/artefacts/BR/BR-XXX.md` and pull its full `**Texto:**` (rule text) — this is the canonical source; never paraphrase.
7. **Detect gaps**: an item is a gap when (a) a referenced ID does not resolve to an existing file, (b) the CRUD operation implied by the TX cannot be inferred with confidence from its `kind`/title/state-model, or (c) two resolved artefacts state something contradictory. Collect these as a list; do not silently guess.
8. **If gaps exist**: hand the gap list to step 1 (Clarify) — see [Interaction with Clarify](#interaction-with-clarify). If no gaps: proceed straight to assembly (Clarify still runs but produces no questions, per "gap-check leve").
9. **Assemble `{tx-id}-complete-transaction.md`** using the mapping in [Output Mapping](#output-mapping), inside `{{PATH_DOCS}}/4-implementation/development/{tx-id}/` (create the folder if missing, exactly as `specify-transaction` does today).
10. **Report**: which artefacts were resolved (with IDs), any gaps found/still open, and the output path.

## Interaction with Clarify (step 1)

Clarify no longer analyzes free prose. It receives the **gap list** from step 5 above and only writes `{tx-id}-clarifications.md` (or the next numbered file, same never-overwrite rule as today) for genuine gaps: unresolved references, ambiguous CRUD classification, or contradictions between resolved artefacts. If the gap list is empty, Clarify records that no questions were needed and the trunk proceeds without a wait step (no clarifications file is created when there is nothing to ask).

## Output Mapping

Target structure is the **same** template `specify-transaction` already produces (see `.claude/skills/specify-transaction/SKILL.md`, "Complete Transaction Specification Structure") — nothing downstream needs to know the source changed shape.

| Complete-transaction section | Source in the resolved artefact bundle |
|---|---|
| **Feature Overview** | TX/NTI `meta.title` + `meta.description`/`summary`. |
| **User Stories** | One story per role in `meta.roles`, phrased as "As a {role}, I want to {TX/NTI title, lower-cased} so that {inferred benefit from description}." Acceptance criteria drawn from the TX's Validation/Result table rows (or the NTI's Filters/Output rows). |
| **Functional Transactions** | Narrated form of the TX's Entry Conditions / Validation / Result tables (or the NTI's Data Sources / Filters / Output Specification tables). Preserve every rule/condition; do not drop rows. |
| **Business Rules** | Full text of every `BR-*` collected in step 6, each on its own line as `- **BR-XXX**: <Texto from BR/BR-XXX.md>`. This is what keeps `analyse-transaction-rules` and `add-code-traceability` working unmodified downstream. |
| **User Roles and Permissions** | `meta.roles` field, plus any role/permission notes found in referenced SCR files. |
| **Data Transactions** | For each referenced `DE-*`, list the entity name and the fields/relationships actually touched by this TX/NTI (conceptual, not a schema dump — do not copy the full Fields table verbatim, summarise field name + purpose). |
| **User Workflows** | Step-by-step from referenced `SCR-*` files' On Load / Buttons / Steps tables, in screen-flow order (`flows_to` gives the next screen). |
| **Dependencies** | `others` (sibling TX/NTI ids) + the `BI-*` this TX/NTI realises. |
| **Open Questions** | Any gap from step 7 still unresolved (no clarification answer yet). Empty (`_None._`) when nothing is open. |
| **Conflicts Identified** | Any contradiction detected in step 7(c), with the artefact IDs involved. Empty (`_None._`) when none found. |

Preserve every ID verbatim (`TX-`, `NTI-`, `SCR-`, `DE-`, `BR-`, `BI-`, `EV-`) — never invent or rename them, same rule `generate-new-transactions` already applies.

## Guidelines

- **Read-only source**: never write to `{{PATH_DOCS}}/1-analysis/artefacts/**` — it is the shared catalog, reused by many transactions. All writes go to the per-transaction working folder as before.
- **One level of resolution**: do not chase an FK/mention chain more than one hop; keeps the bundle bounded and matches the existing `generate-storyline-docs` precedent.
- **No fabrication**: content not present in a resolved artefact is a gap, not a guess.
- **Faithful Business Rules**: copy BR text from the catalog verbatim; this is what downstream tooling greps for.
- **Idempotent**: re-running this skill for the same TX/NTI (e.g. after clarifications are answered) re-assembles `{tx-id}-complete-transaction.md`, applying the same `[NEW]`/`[IMPROVED]`/`[REVISED]` change-tracking convention as `specify-transaction` when updating an existing file.

## Reference

- **Flow steps**: `.claude/commands/complete-development.md` — steps 0, 1, 3.
- **Legacy counterpart (still used for free-prose sources)**: `.claude/skills/specify-transaction/SKILL.md`, `.claude/skills/clarify-transaction/SKILL.md`.
- **BR canonical catalog**: `.claude/skills/analyse-transaction-rules/SKILL.md` — reads the same `{{PATH_DOCS}}/1-analysis/artefacts/BR/*.md` catalog.
- **One-level FK/mention resolution precedent**: `.claude/skills/generate-storyline-docs/SKILL.md`.

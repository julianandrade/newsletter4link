---
name: generate-new-transactions
description: Generate a list of functional Transaction Markdown files (one per TX) from a Functional Specification structured like architecture/Functional-Specification_*.md. Reads the FS Transaction Catalog (e.g. Table 7b TX-001..TX-NNN) and produces one .md per Transaction in a hybrid structure (transaction-markdown base + FS traceability + acceptance criteria). Use when asked to "generate Transactions list", "explode FS into Transactions", "create TX markdown files from functional spec", or "gerar lista de Transações a partir da especificação funcional".
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Generate New Transactions

Use this skill to transform a **Functional Specification (FS)** — in the style of `architecture/Functional-Specification_CTT_EN_v3.md` — into **one Markdown file per functional Transaction (TX-*)**. Each generated file follows a **hybrid structure**: the base of the [`transaction-markdown`](../transaction-markdown/SKILL.md) template (Title, Description, Source, Actions, Preconditions, Postconditions, Inputs, Outputs, Business Rules, Dependencies, CRUD) **plus** two extra sections — **Traceability** (TX-/FEAT-/TX-/NTI-/SCR-/BR-/EV- IDs preserved) and **Acceptance Criteria** (derived from TX/NTI Acceptance and Validation steps).

This skill is the **Transaction-level counterpart** to [`generate-technical-design`](../generate-technical-design/SKILL.md): both read the same FS, but this one produces the **functional Transaction catalog as individual files**, while the other produces a single Technical Design document.

## When to Use This Skill

- User asks to **generate the Transactions list / catalog** from a Functional Specification.
- User asks to **explode / split** an FS into one `.md` per Transaction.
- User asks to **create RQ files** (TX-001.md, TX-002.md, …) from an FS.
- User asks to **gerar / criar a lista de Transações** a partir de uma especificação funcional (`Functional-Specification_*.md`).
- User points at a path like `architecture/Functional-Specification_*.md` and wants per-Transaction functional artifacts for downstream work (clarify, specify, architect, test).

**Trigger phrases (examples):**

- "Generate new Transactions from the functional specification"
- "Create one markdown per TX from Functional-Specification_CTT_EN_v3.md"
- "Explode the FS Transaction catalog into Transaction files"
- "Gerar lista de Transações a partir da especificação funcional"
- "Criar arquivos de Transação (TX-*.md) a partir da FS"

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| **Functional Specification** | Yes | Path to the FS markdown (e.g. `architecture/Functional-Specification_CTT_EN_v3.md` or equivalent). |
| **Output folder** | No | Destination root for the generated files. See [Output location](#output-location) for the resolution rule. |
| **RQ subset** | No | Optional list of TX-IDs to generate (e.g. `TX-001, TX-007, TX-028`). Default: **all** Transactions in the FS Transaction Catalog. |
| **Output language** | No | Default: **same language as the source FS**. User may override (e.g. PT vs EN). |

## Outputs

- **One Markdown file per Transaction** listed in the FS Transaction Catalog, each following the [Hybrid Transaction structure](#hybrid-Transaction-structure).
- **No aggregate/index file** is produced by this skill (that is the job of a future indexer or of the FS itself). The skill returns a summary message listing the files created.

## Output location

Resolve the destination in this exact order; do not write anything until the destination is confirmed:

1. Resolve `{{PATH_DOCS}}` from `.claude/settings.json`.
2. If the folder **`{{PATH_DOCS}}/4-implementation/development/`** **exists** in the workspace, use it as the destination root. Layout: one subfolder per Transaction.
   - `{{PATH_DOCS}}/4-implementation/development/<TX-ID>-<short-slug>/<TX-ID>.md`
   - Example: `{{PATH_DOCS}}/4-implementation/development/TX-001-register-object/TX-001.md`.
3. If the folder does **not** exist, **ask the user** for an explicit destination path (do not auto-create `{{PATH_DOCS}}/4-implementation/development/` without confirmation). After the user confirms, use the provided path with the same per-Transaction subfolder layout.
4. If the user supplies an **Output folder** input explicitly, that always wins over steps 2 and 3.

**Overwrite rules:**

- If a target `<TX-ID>.md` already exists, do **not** overwrite without explicit user confirmation. Offer to: (a) skip, (b) overwrite, or (c) write to a sibling file `<TX-ID>-v2.md`.
- Never delete or edit the source FS.

## Hybrid Transaction structure

Each generated file **MUST** use these H1/H2 headings, in this order. Use `##` for all section titles below the H1. Keep content **functional** (what the system must do); keep implementation detail (Oracle Forms internals, table names, API calls) **out of the body** — only mention such identifiers inside `## Source` and `## Traceability` when useful for rastreabilidade.

```markdown
# Transaction: TX-<ID>

## Title

<One-line descriptive title from the FS Transaction Catalog>

## Description

<One or more paragraphs synthesizing what this Transaction does from a user/business perspective, derived from the target TX/NTI Entry Conditions + Result + applicable BRs. No implementation detail.>

## Source

- **Functional Specification**: `<path to FS>`
- **FS Title / Version / Date / Status**: <from Document Information>
- **Transaction Catalog row**: TX-<ID> — <Transaction Name> (Feature <FEAT-ID>, Target <TX-ID | NTI-ID>, Transformation Type <…>)

## Traceability

- **Feature**: FEAT-<ID> — <Feature name>
- **Transactions / Interactions**: TX-<ID> / NTI-<ID> (list all mapped)
- **Screens**: SCR-<ID>, SCR-<ID> (when present)
- **Business Rules**: BR-<ID>, BR-<ID> (list all referenced)
- **Events**: EV-<ID> (when the FS lists event contracts)
- **NFRs**: NFR-<ID> (when applicable)

## Actions

1. **<Action>**: The system must <business verb + outcome>. <Optional short explanation.>
2. **<Action>**: …

## Preconditions

- <Condition derived from Entry Conditions / Roles / Auth, in business terms>
- <Another precondition>

## Postconditions

- <Outcome derived from Result, in business terms>
- <Another outcome>

## Inputs

- **<Input name>**: <Functional description (e.g. barcode, recipient name, postal code CP4) — no field/column internals.>
- **<Input name>**: …

## Outputs

- **<Output name>**: <Functional description (e.g. "object registered in reception session", "filtered results grid", "reception details view").>
- **<Output name>**: …

## Business Rules

- **BR-<ID>**: <Rule text copied/summarized from the FS BR catalog. Preserve ID.>
- **BR-<ID>**: …

## Acceptance Criteria

- [ ] <Criterion derived from TX/NTI Acceptance step or Validation pass condition>
- [ ] <Another criterion>

## Dependencies

- **<Capability or external system>**: <Functional role (e.g. "SGE — creates/updates object manifests", "Track and Trace — external object tracking", "Reference data — CP4/CP7/countries/products lookup"). No protocol-level detail.>
- **<Capability>**: …

## CRUD Operations

- **CREATE**: <What business entity/record is created, or None.>
- **READ**: <What is read/queried, or None.>
- **UPDATE**: <What is updated, or None.>
- **DELETE**: <What is deleted/annulled, or None.>

## Open Questions

- <Question requiring stakeholder clarification, or item marked `[TBD]` in the FS, or gap detected while synthesizing.>
```

Subsections without applicable content: keep the heading and write a short `None` or `[TBD]` line — do **not** silently drop sections.

## Functional Specification → Transaction mapping

Use this table to **source** each section per Transaction. Preserve FS IDs verbatim.

| FS area (typical headings) | Transaction section(s) | Guidance |
|---|---|---|
| *Document Information*, *Revision History* | Source | FS title, version, date, status, and relative path. |
| *Transaction Catalog* (e.g. Table 7b) | Title, Source, Traceability | Canonical list of TX-IDs: take **Name**, **Feature**, **Target TX/NTI**, **Transformation Type**. |
| *Features* table | Traceability (FEAT-*) | Preserve FEAT-ID and feature name. |
| *Transaction Specifications* (TX-*) — Identification, Entry Conditions, Validation, Result, Acceptance | Description, Actions, Preconditions, Postconditions, Acceptance Criteria | Aggregate per RQ using the Target TX from the catalog. Entry Conditions → Preconditions + earliest Actions; Result → Postconditions + later Actions + CRUD; Acceptance → Acceptance Criteria. |
| *Non-Transactional Interaction Specifications* (NTI-*) — Header, Filters, Data Sources, Output | Description, Actions, Inputs, Outputs | For read-only Transactions (queries, LOVs, views). Filters → Inputs; Data Sources/Output → Outputs. |
| *Business Rules* (BR-*) catalog | Business Rules, Acceptance Criteria | Copy each BR referenced by the RQ's TX/NTI. Use BR text verbatim (may shorten). |
| *Screens* (SCR-*) | Traceability (SCR-*) | Preserve SCR-IDs. |
| *Events Catalog* (EV-*) when present | Traceability (EV-*) | Only when FS lists events for this RQ. |
| *Integration Interfaces*, external dependencies | Dependencies | SGE, Moby, Track & Trace, Supervisor Auth, reference data, etc. — describe functionally. |
| *Glossary* | Description | Use glossary terms consistently. Do not redefine. |
| *Business Roles* | Preconditions, Actions | E.g. "Operator is authenticated", "Supervisor authorization required". |
| *Transformation Type* column in Transaction Catalog | Description, CRUD | Primary Transaction → dedicated behavior; Step → sub-behavior of a TX/NTI (still valid to emit a file, narrower scope); Cross-cutting Business Rule → emit a short RQ file pointing to the BR; Event / UI Behavior → emit a short RQ file focused on screen behavior. |

## Deriving CRUD from the target TX/NTI

| Target pattern | Typical CRUD mapping |
|---|---|
| TX "Register …" / "Create …" | CREATE |
| TX "Edit …" / "Update …" / "Change …" | UPDATE (+ READ for load) |
| TX "Cancel …" / "Remove …" / "Annul …" | DELETE (soft delete is still DELETE functionally) |
| NTI "Query …" / "Search …" / "View …" / "Lookup …" | READ |
| NTI "Clear …" (non-persisted) | None (state-level) — describe as a UI behavior and set CRUD to "None". |

When in doubt, prefer the smaller set that is actually implied by the FS Result steps.

## Naming conventions

- **Slug**: kebab-case, ASCII, derived from the `Transaction Name` in the Transaction Catalog. Strip punctuation; lowercase; join with `-`.
  - Examples: `TX-001 Register Object` → `TX-001-register-object`; `TX-007 Search Object` → `TX-007-search-object`; `TX-011 Exit Form with Auto-Save` → `TX-011-exit-form-with-auto-save`.
- **Folder per Transaction**: `<TX-ID>-<slug>/`.
- **File**: `<TX-ID>.md` inside the folder.

## Process

1. **Resolve variables**: Read `.claude/settings.json` to resolve `{{PATH_DOCS}}`.
2. **Resolve output location**: Apply the rule in [Output location](#output-location). If `{{PATH_DOCS}}/4-implementation/development/` does not exist and the user did not pass an explicit **Output folder**, **stop and ask** for the destination path before any file write.
3. **Read the FS**: Read the full FS file at the provided path.
4. **Extract the Transaction Catalog**: Locate the catalog table (e.g. `Table 7b — Transaction Catalog`). Capture for each row: `TX-ID`, `Transaction Name`, `Feature`, `Target TX/NTI`, `Transformation Type`.
5. **Apply RQ subset** (if provided): filter the catalog to the user-specified TX-IDs; error if any ID is not in the catalog.
6. **Per Transaction, aggregate sources**:
   - Target TX specifications (Identification, Entry Conditions, Validation, Result, Acceptance).
   - Target NTI specifications (Header, Filters, Data Sources, Output).
   - Referenced BRs from the BR catalog.
   - Referenced SCR-*, EV-*, NFR-* (when the FS lists them).
   - Integration interfaces / external systems.
   - Relevant glossary terms and roles.
7. **Write the file** using the [Hybrid Transaction structure](#hybrid-Transaction-structure), following the mapping and CRUD tables. Preserve IDs verbatim. Mark gaps as `[TBD]` and move actionable unknowns to `## Open Questions`.
8. **Handle overwrites** per the rule in [Output location](#output-location).
9. **Report back**: Return a concise summary listing each file written (path + TX-ID + title), and any skipped/overwritten items and `[TBD]` counts.

## Quality rules

1. **Traceability**: Every RQ file must preserve `TX-`, and list all applicable `FEAT-`, `TX-`, `NTI-`, `BR-`, `SCR-` (and `EV-`, `NFR-` when present). Never invent IDs.
2. **No fabrication**: Anything not supported by the FS must be labeled **`[TBD]`** or moved to **Open Questions** with a specific question — never present guesses as facts.
3. **Functional only (body)**: The body sections (Description, Actions, Preconditions, Postconditions, Inputs, Outputs, Business Rules, Dependencies, CRUD, Acceptance Criteria) describe **what** the system must do, not **how**. Do not mention Oracle Forms internals, database tables (e.g. `TDOTOBJT00`), SQL, API routes, or technologies in these sections. Such identifiers may only appear in **Source** and **Traceability** when they help rastreabilidade.
4. **Language parity**: Use the same language as the source FS. Do not translate IDs or BR texts; you may shorten BR wording while preserving meaning.
5. **Terminology**: Use the FS glossary consistently (e.g. *Object*, *Manifest*, *Special Service*, *CP4/CP7*, *EMB/EMG*, *Area of Influence*). Do not redefine.
6. **Security & confidentiality**: If the FS is confidential, reflect this in `## Source` (note the classification). Do not paste credentials or secrets.
7. **Consistency with peers**: Keep tone and granularity aligned with the [`transaction-markdown`](../transaction-markdown/SKILL.md) template, so downstream skills (`clarify-transaction`, `specify-transaction`, `architect-transaction`, `create-test-plan`) can consume the output.

## Reference

- **Example FS**: `architecture/Functional-Specification_CTT_EN_v3.md` (contains the Transaction Catalog — e.g. `Table 7b` — listing TX-001 … TX-NNN).
- **Base template skill**: [`transaction-markdown`](../transaction-markdown/SKILL.md) — source of the common functional sections.
- **Sibling skill from the same FS**: [`generate-technical-design`](../generate-technical-design/SKILL.md) — produces a single Technical Design document instead of per-Transaction files.
- **Downstream skills** that consume the generated RQ files: `clarify-transaction`, `specify-transaction`, `architect-transaction`, `create-test-plan`, `validate-transaction`.
- **Variable source**: `.claude/settings.json` (`PATH_DOCS` → `{{PATH_DOCS}}`).

---
name: generate-storyline-docs
description: Reads storylines.md and cross-references datamodel.md, screens.md, and NFR.md (from {{PATH_DOCS}}/core/) to generate one standalone markdown file per transaction (TX) or NTI in {{PATH_DOCS}}/4-implementation/development/. Use when asked to "generate storyline docs", "explode storylines into individual files", "create TX docs from storylines", "gerar documentação de transações", or "criar ficheiros TX/NTI a partir do storylines".
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Generate Storyline Docs

Use this skill to transform a **storylines file** (`storylines.md`) into **one standalone Markdown file per transaction (TX) or non-transactional interaction (NTI)**. Each generated file is a self-contained reference that aggregates all relevant information from four source files:

- `{{PATH_DOCS}}/core/storylines.md` — state model, user flow, business rules, events
- `{{PATH_DOCS}}/core/datamodel.md` — entity field definitions and foreign keys
- `{{PATH_DOCS}}/core/screens.md` — UI fields and screen actions
- `{{PATH_DOCS}}/core/NFR.md` — non-functional requirements with acceptance criteria

The goal is to give developers, testers, and analysts a **single file per functional unit** so they no longer need to cross-reference four separate documents.

## When to Use This Skill

- User asks to **generate storyline docs** or **create per-TX/NTI documentation**.
- User asks to **explode storylines** into individual files.
- User asks to **criar ficheiros TX/NTI** a partir do storylines.
- User points at `storylines.md` and wants per-transaction / per-NTI artifacts.

**Trigger phrases (examples):**

- "Generate storyline docs"
- "Explode storylines into individual files"
- "Create TX docs from storylines"
- "Create a file for TX-003"
- "Gerar documentação de transações"
- "Criar ficheiros TX/NTI a partir do storylines"

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `storylines_path` | No | `{{PATH_DOCS}}/core/storylines.md` | Path to the storylines source file |
| `datamodel_path` | No | `{{PATH_DOCS}}/core/datamodel.md` | Path to the data model source file |
| `screens_path` | No | `{{PATH_DOCS}}/core/screens.md` | Path to the screens source file |
| `nfr_path` | No | `{{PATH_DOCS}}/core/NFR.md` | Path to the NFR source file |
| `target` | No | `ALL` | Which entry to process: `ALL`, or a specific ID (e.g. `TX-003`, `NTI-001`) |
| `output_dir` | No | `{{PATH_DOCS}}/4-implementation/development/` | Destination folder for generated files |

## Outputs

- **One Markdown file per TX/NTI** following the [Output file structure](#output-file-structure) below.
- **Index file** at `{{PATH_DOCS}}/4-implementation/development/README.md` listing all generated files with IDs, names, business intentions, and links.
- A concise summary listing each file written (path + ID + name) and any skipped/overwritten items.

## Output location

Resolve the destination in this order:

1. Resolve `{{PATH_DOCS}}` from `env` in `.claude/settings.json`.
2. Use `{{PATH_DOCS}}/4-implementation/development/` as the default output directory. Create it if it does not exist.
3. If the user supplies an explicit `output_dir`, that always wins.

**Filename convention:** `{ID}.md` — the exact TX or NTI identifier with no slug appended.

| ID | Filename |
|----|----------|
| TX-001 | `TX-001.md` |
| TX-009 | `TX-009.md` |
| NTI-001 | `NTI-001.md` |
| NTI-003 | `NTI-003.md` |

**Conflict rule:** If a target file already exists, **pause and ask the user** to choose one of:
- **Skip** — leave the existing file untouched and continue to the next entry.
- **Overwrite** — replace the existing file with the newly generated content.
- **New version** — write the new content to `{ID}-v2.md` (or `-v3.md`, etc., incrementing until the filename is free).

When processing `ALL` and conflicts arise, also offer **"apply this choice to all remaining conflicts"** to avoid repeated prompts.

## Process

1. **Resolve variables** — Read `env` from `.claude/settings.json` and resolve `{{PATH_DOCS}}`.

2. **Accept and validate inputs** — Apply defaults from the Inputs table. If the user supplied a `target`, validate it matches a TX-XXX or NTI-XXX pattern; error early if not found in storylines.

3. **Read and parse `storylines.md`** — Extract every TX and NTI block. For each entry, collect:
   - YAML metadata block (id, kind, name, business_intention, initiator, expected_result, roles, screen, primary_entity, related_nfrs)
   - Description paragraph
   - State Model table (PRE-CONDITIONS, INPUTS, VALIDATION, POST-CONDITIONS, STORED/PRODUCED DATA, WARNINGS, ERRORS, ACCEPTANCE, NOTES)
   - User Flow table (ID, Action, Trigger, Behaviour, Target, Notes)
   - Business Rules (inlined BR-XXX blocks — rule_id, category, page_number, text)
   - Based Rules — Private (RULE-XXX where `is_shared: false`)
   - Based Rules — Shared (RULE-XXX where `is_shared: true`, with `source_use_cases` listed)
   - Events table (ID, Event, Triggered By, Impact) or `_None._`
   - Integrations section text
   - Documentation section text

4. **Build lookup maps** from the three companion files:
   - `datamodel_map`: entity name → full entity block (YAML header, description, Foreign Keys table, Fields table)
   - `screen_map`: screen ID → full screen block (YAML header with name/type/purpose/pre_conditions/figma_url, Fields table, Screen Actions table)
   - `nfr_map`: NFR ID → full NFR block (YAML header with id/kind/category/type/functional_refs, Acceptance Criteria, Notes)

5. **Apply `target` filter** — If `target` is not `ALL`, retain only the matching entry. Process in the order: TX-001, TX-002, …, TX-009, NTI-001, NTI-002, NTI-003.

6. **For each TX/NTI**:

   a. **Resolve screen(s)**: Read the `screen` field from the metadata. Look up each SCR-ID in `screen_map`. A TX/NTI may reference one or more screens (e.g. TX-003 and TX-004 both use SCR-003).

   b. **Resolve primary entity**: Read the `primary_entity` field from metadata. Look up in `datamodel_map`. Also collect FK entity summaries (one level deep): for each FK listed in the primary entity's Foreign Keys table, include the FK target entity's name, description, and a condensed field list (field name + format + mandatory only) under a "Referenced Entities" sub-section.

   c. **Resolve applicable NFRs**: Include any NFR whose `functional_refs` contains at least one of:
      - `All TX` (for transactions)
      - `All NTI` (for NTIs)
      - `All SCR` or `All screens`
      - The specific TX/NTI ID (e.g. `NTI-001`)
      - Any SCR-ID referenced by this TX/NTI
      - Any BR-ID referenced by this TX/NTI
      Also include any NFR-ID explicitly listed in the TX/NTI `related_nfrs` metadata field.

   d. **Assemble the output markdown** following the structure in [Output file structure](#output-file-structure). Preserve all IDs verbatim (TX-*, NTI-*, BR-*, RULE-*, SCR-*, NFR-*, EV-*). Mark missing data as `[TBD]`.

   e. **Derive output filename**: `{ID}.md` (e.g. `TX-001.md`, `NTI-002.md`).

   f. **Handle conflicts** per the rule in [Output location](#output-location).

7. **Generate index** — Write (or overwrite) `{{PATH_DOCS}}/4-implementation/development/README.md` with a table listing every generated file: ID, name, business intention, screen(s), and a relative link to the file.

8. **Generate dependency tree** — After all TX/NTI files are written, invoke the **`generate-dependency-tree`** skill (`.claude/skills/generate-dependency-tree/SKILL.md`) with:
   - `storylines_path` = the same storylines file used in step 3.
   - `output_path` = `{{PATH_DOCS}}/4-implementation/development/_tree.md`.
   - `overwrite` = `yes` when processing `ALL` (the full run already regenerated every TX/NTI file); `ask` when processing a single `target` (partial run may not reflect the full tree).

   The skill infers dependencies, detects cycles, and writes `_tree.md` in the canonical format consumed by `/complete-development-tree`. Any `[?]` low-confidence inferences flagged by that skill must be surfaced in this skill's final report.

9. **Report back** — Return a concise summary: files written, files skipped/overwritten, any `[TBD]` gaps detected, and the dependency tree outcome (path written, inferences made, any `[?]` items requiring user confirmation).

## Output file structure

Each generated file uses these headings in this order:

```markdown
# {ID} -- {Name}

## Metadata

[YAML block copied verbatim from storylines.md]

## Description

[Description paragraph from storylines.md]

## Screen: {SCR-ID} -- {Screen Name}

[Screen purpose, type, pre_conditions, figma_url from screens.md]

### Fields

[Full Fields table from screens.md]

### Actions

[Full Screen Actions table from screens.md]

> If the TX/NTI references multiple screens, repeat the entire "## Screen" section for each.

## Primary Entity: {Entity Name}

[Entity YAML header (module, description) from datamodel.md]

### Foreign Keys

[FK table from datamodel.md]

### Fields

[Complete Fields table from datamodel.md]

## Referenced Entities

[For each FK target entity: name, one-line description, condensed fields (name | format | mandatory)]

## State Model

[State Model table from storylines.md]

## User Flow

[User Flow table from storylines.md]

## Business Rules

[Each BR-XXX block from storylines.md, preserving rule_id, category, and text]

## Field-Level Rules

### Private (this {ID} only)

[Each RULE-XXX where is_shared: false — preserving rule_id and content]

### Shared (multiple TX/NTIs)

[Each RULE-XXX where is_shared: true — preserving rule_id, source_use_cases, and content]

## Events

[Events table from storylines.md, or "_None._"]

## Integrations

[Integrations section from storylines.md, or "_None._"]

## non-functional requirements

[For each applicable NFR: ID, category, type, Transaction text, acceptance criteria, notes]
```

Sections without applicable content: keep the heading and write `_None._` — do **not** silently drop sections.

## Guidelines

1. **Preserve IDs verbatim**: TX-*, NTI-*, BR-*, RULE-*, SCR-*, NFR-*, EV-* — never invent or rename them.
2. **No fabrication**: Anything not present in the source files must be marked `[TBD]`. Do not guess.
3. **Copy, don't rewrite**: Content from source files should be reproduced faithfully, not paraphrased, to ensure accuracy.
4. **FK depth**: Resolve FK entities one level deep only. Do not recursively expand FK chains.
5. **NFR resolution**: Prefer broader functional_refs (`All TX`) over narrow ones; always include NFRs explicitly listed in `related_nfrs`.
6. **Index always updated**: After each run (even single-target), regenerate the full `README.md` index to reflect the current state of the `transactions/` folder.
7. **Language**: Match the language of the source files (do not translate content).

## Reference

- **Source files (default paths)**:
  - `{{PATH_DOCS}}/core/storylines.md`
  - `{{PATH_DOCS}}/core/datamodel.md`
  - `{{PATH_DOCS}}/core/screens.md`
  - `{{PATH_DOCS}}/core/NFR.md`
- **Output folder**: `{{PATH_DOCS}}/4-implementation/development/`
- **Related skills**: [`generate-dependency-tree`](../generate-dependency-tree/SKILL.md) — invoked automatically in step 8 to produce `_tree.md`; [`generate-new-transactions`](../generate-new-transactions/SKILL.md) — produces per-TX/NTI files from a Functional Specification; [`generate-technical-design`](../generate-technical-design/SKILL.md) — produces a single Technical Design document.

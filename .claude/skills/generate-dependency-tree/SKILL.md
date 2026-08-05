---
name: generate-dependency-tree
description: Reads storylines.md and infers TX/NTI dependency relationships to generate {{PATH_DOCS}}/4-implementation/development/_tree.md consumed by /complete-development-tree. Use when asked to "generate dependency tree", "create _tree.md", "gerar árvore de dependências", or "criar ficheiro _tree".
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Generate Dependency Tree

Use this skill to analyse a **storylines file** and produce `{{PATH_DOCS}}/4-implementation/development/_tree.md` — the dependency tree consumed by `/complete-development-tree`.

The output file tells the orchestrator which transactions/NTIs are independent (level 0) and which must wait for others to complete before being scheduled (child levels).

## When to Use This Skill

- User asks to **generate the dependency tree** or **create `_tree.md`**.
- User asks to **infer TX/NTI dependencies** from storylines.
- User asks to **gerar árvore de dependências** or **criar ficheiro _tree**.
- User has just run `generate-storyline-docs` and wants the tree to match.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `storylines_path` | No | `{{PATH_DOCS}}/core/storylines.md` | Path to the storylines source file |
| `output_path` | No | `{{PATH_DOCS}}/4-implementation/development/_tree.md` | Destination file path |
| `overwrite` | No | `ask` | `ask`, `yes`, or `no` — what to do if the file already exists |

## Outputs

- `{{PATH_DOCS}}/4-implementation/development/_tree.md` — dependency tree in the canonical format consumed by `/complete-development-tree`.
- A concise summary of the dependency relationships inferred and any ambiguous cases flagged.

## Process

### 1. Resolve variables

Read `env` from `.claude/settings.json` and resolve `{{PATH_DOCS}}`.

### 2. Read and parse `storylines.md`

Extract every TX and NTI entry. For each, collect:

- **ID** (`TX-NNN` or `NTI-NNN`)
- **Name**
- **Entry Conditions** — look for explicit references to other TX/NTI IDs (e.g. "Object exists" implying a prior registration TX, or "redirects to TX-003")
- **Validation** — references to other TX/NTI IDs (e.g. "redirect to TX-003 if persisted")
- **User Flow** — `References` column mentioning other TX/NTI IDs
- **Result** — post-conditions that name other TX/NTI IDs

### 3. Infer dependencies

For each TX/NTI, build its `Parents` list by applying these rules **in order**:

| Signal | Inferred dependency | Confidence |
|--------|---------------------|------------|
| Entry Condition explicitly states the object/entity must exist and only one TX creates it | child → creator TX | High |
| Validation says "if already persisted, redirect to TX-NNN" | child → TX-NNN | High |
| User Flow `References` column contains another TX/NTI ID | child → referenced TX/NTI | Medium |
| Entry Condition mentions a state only reachable after a specific TX | child → that TX | Medium |
| Shared screen (SCR-*) with a TX that defines/creates the main form structure | child → form-owner TX | Low — flag for confirmation |

**Low-confidence inferences** must be flagged in the summary and marked with a `[?]` annotation in the Notes column until confirmed.

**Do not infer** a dependency solely because two TX/NTIs share a business rule or reference entity — shared rules are not execution dependencies.

### 4. Compute topological levels (verification only)

Run Kahn's algorithm on the inferred graph:

- **Level 0** = TX/NTIs with no parents.
- **Level N** = TX/NTIs whose parents are all in levels `< N`.

If a cycle is detected, **stop** and report the cycle before writing any file.

### 5. Handle conflict

If `{{PATH_DOCS}}/4-implementation/development/_tree.md` already exists:

- `overwrite=yes` → overwrite silently.
- `overwrite=no` → abort; print current file path.
- `overwrite=ask` (default) → show the existing file's Dependencies table, present the newly inferred table, and ask the user to choose: **overwrite**, **merge** (user edits manually), or **abort**.

### 6. Write `_tree.md`

Write the file using the canonical template below. Preserve the exact section headers and table structure — `/complete-development-tree` parses the `## Dependencies` table by exact header match (`| TX | Parents | Notes |`).

### 7. Report back

Return a concise summary:
- Dependencies inferred (one line per TX/NTI: `TX-NNN → parents`).
- Any `[?]` low-confidence inferences flagged for user review.
- Topological levels as computed.
- Path written.

---

## Output file template

```markdown
# Transaction Dependency Tree

> **Source of truth**: the **Dependencies** table below. The Tree view section is **illustrative only** — regenerated from the table when drift is detected.
>
> Rules:
> - One row per transaction/NTI (identifier = folder name under `{{PATH_DOCS}}/4-implementation/development/`).
> - `Parents` column lists zero or more direct parent IDs, separated by commas. `—` (em dash) means no parents (root).
> - A transaction with multiple parents waits for **all** of them before its level is scheduled.
> - Levels are computed by `/complete-development-tree` (Kahn topological sort). Same-level transactions run in parallel; child levels wait for parent levels.
> - Cycles are not allowed; `/complete-development-tree` aborts and reports them.
> - Transactions listed here but with no file under `{{PATH_DOCS}}/4-implementation/development/<ID>.md` (or `<ID>/<ID>.md`) are reported as missing.

## Dependencies

| TX | Parents | Notes |
|----|---------|-------|
{rows}

## Tree view (illustrative)

_Regenerated from the Dependencies table. Do not treat as authoritative. When the table and this view disagree, the table wins and `/complete-development-tree` emits a warning._

{tree_view}

## How to fill

1. Review each TX/NTI document and identify which other TX/NTI(s) must be completed first (parent = prerequisite).
2. Inline hints in TX docs — entry conditions referencing another TX, or shared screen/entity dependencies — are signals, not auto-imported. Confirm the relationship before adding it here.
3. Edit the `Parents` column for the child row. Example: `NTI-002` whose validation redirects to `TX-003` becomes:
   `| NTI-002 | TX-001, TX-003 | redirects to TX-003 for committed records |`
4. For multiple parents, separate with commas: `TX-001, TX-003`.
5. Keep the Tree view in sync when possible; otherwise `/complete-development-tree` will flag drift.
```

### Tree view format

The `{tree_view}` block must be a fenced code block showing one section per level:

````
```
Level 0  ─────────────────────────────────────────────────────
  TX-NNN  <Name>
          (root — no parents)

Level 1  ─────────────────────────────────────────────────────  [parallel]
  ├── TX-NNN   <Name>   ← <parent IDs>
  └── NTI-NNN  <Name>   ← <parent IDs>

Level N  ─────────────────────────────────────────────────────
  └── TX-NNN  <Name>  ← <parent IDs>
```
````

Rules for the tree view:
- One section per level (`Level 0`, `Level 1`, …).
- Add `[parallel]` suffix when a level has more than one entry.
- Entries within a level sorted: TX-* before NTI-*, then numerically.
- `├──` for all but the last entry; `└──` for the last.
- `←` arrow lists all direct parents for that entry.
- When a TX/NTI has multiple parents, annotate with `*(also depends on TX-NNN)*` if it appears under more than one parent branch.

---

## Guidelines

1. **IDs verbatim** — never rename or invent TX/NTI IDs; use exactly what appears in `storylines.md`.
2. **No fabrication** — only infer dependencies with textual evidence; if uncertain, flag with `[?]`.
3. **Table header exact** — the `## Dependencies` table header must be `| TX | Parents | Notes |`; `/complete-development-tree` matches it literally.
4. **Em dash for roots** — use `—` (U+2014 em dash), not a hyphen, for entries with no parents.
5. **Notes column** — include a short rationale for each dependency (what entry condition or validation signal drove the inference). Required for `[?]` items; recommended for all.
6. **Cycle abort** — if a cycle is found, do not write the file. Report the cycle and stop.

## Reference

- **Source file**: `{{PATH_DOCS}}/core/storylines.md`
- **Output file**: `{{PATH_DOCS}}/4-implementation/development/_tree.md`
- **Consumer**: `/complete-development-tree` (parses `## Dependencies` table)
- **Related skills**: [`generate-storyline-docs`](../generate-storyline-docs/SKILL.md) — generates per-TX/NTI files; run before this skill so TX/NTI documents exist.

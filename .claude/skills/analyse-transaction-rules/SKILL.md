---
name: analyse-transaction-rules
description: Analyse Transaction files, classify business rules as private or shared, consolidate shared rules into a Business Rule Catalog (.claude/rules), assign unique BR-XXX identifiers, and update Transactions to use those identifiers. When the project already keeps a canonical BR artefact catalog ({{PATH_DOCS}}/1-analysis/artefacts/BR/BR-XXX.md), read that directly instead of scanning each Transaction's inline Business Rules section.
---

# Analyse Transaction Rules - Business Rule Catalog

Use this skill when you need to **analyse** existing Transaction documents, **classify** each business rule as private or shared, **consolidate** only **shared** rules into a single **Business Rule Catalog**, assign each catalogued rule a **unique identifier (BR-XXX)**, and **update** the Transaction files to reference those identifiers.

Works with Transaction files that follow the standard structure (e.g. from the **transaction-markdown** skill): each Transaction has a **Business Rules** section where both private and shared rules appear at the **same level**, with identifiers **PR-XXX** (private) and **BR-XXX** (shared, from catalog).

## Artefact-catalog BR source (when present — skip inline scanning)

If `{{PATH_DOCS}}/1-analysis/artefacts/BR/` exists, it is **already** the canonical, one-file-per-rule Business Rule Catalog — each `BR-XXX.md` carries its full rule text (`**Texto:**`), type (`kind`, e.g. Constraint), and a `mentions` meta field listing every TX/NTI/DE/SCR/EV/BI that cites it. In this case:

- **Skip** steps 1-6 of the Process below (parsing each Transaction's inline `## Business Rules` section, classifying private/shared, deduplicating, assigning new IDs) — that work is already done; every file in `BR/` is by construction a shared, catalogued rule with a stable ID.
- Read each `BR/BR-XXX.md` directly for the catalog's per-rule entry (Rule ID = filename, Rule text = `**Texto:**`, Used by = its `mentions` field, filtered to TX/NTI IDs — plus DE/SCR mentions when the catalog's "Used by" convention includes them).
- **Private rules (PR-XXX)** still only exist inline inside a `TX/TX-XXX.md` or `NTI/NTI-Name.md` artefact's own text (e.g. a Notes column caveat that doesn't warrant its own BR file) — these are not touched by this branch; classify/number them per steps 1-6 only if the project also wants a PR-XXX pass over the catalog TX/NTI artefacts.
- Go straight to **Generate or update the catalog** (step 7): write `.claude/rules/business-rule-catalog.md` from the `BR/*.md` files' content and `mentions`, rather than from rules extracted out of Transaction prose.
- This is simpler and faster than the inline-scanning path, not a special case to work around — the catalog artefacts are already the source of truth.

## Private vs Shared Business Rules

Private and shared rules are at the **same level** in the Transaction: both appear in the **Business Rules** section. They differ by identifier and whether they are catalogued.

For **each Transaction**, review every rule in its Business Rules section and classify it as:

- **Private business rule (PR-XXX)**: Applicable **only** to that Transaction. It expresses a constraint or behaviour specific to that Transaction and is not intended to be reused elsewhere. Keep it in the Transaction document and give it a **unique identifier PR-XXX** (e.g. PR-001, PR-002, …) within that Transaction. **Do not** add it to the catalog.
- **Shared business rule (BR-XXX)**: Reusable across **different** Transactions. It expresses a general constraint or invariant that can apply in multiple contexts. Give it a **unique BR-XXX** in the catalog. In the Transaction, reference the catalog identifier **BR-XXX**.

When in doubt, consider: Could this rule reasonably apply to another Transaction or domain? If yes, treat as shared; if it is tightly bound to one Transaction scope, treat as private.

## When to Use

- Building or refreshing a central Business Rule Catalog from multiple Transaction files.
- Classifying which rules are private (Transaction-specific) vs shared (reusable).
- Finding which Transactions use a given shared business rule.
- Assigning unique BR-XXX identifiers and keeping Transactions in sync with the catalog.

## Process

1. **Locate Transaction files**: Identify the folder(s) or glob pattern where Transaction markdown files live (e.g. `**/transactions/**/*.md` or `{{PATH_DOCS}}/4-implementation/development/**/TX-*.md`). Follow project conventions.
2. **Parse each Transaction**: For each file, read the **Business Rules** section and extract every rule (with or without an existing BR-XXX) and its rule text.
3. **Classify each rule (private vs shared)**: For each Transaction, review each rule and mark it as **private** (only applicable to this Transaction) or **shared** (reusable across Transactions). Only shared rules proceed to the catalog.
4. **Deduplicate and consolidate shared rules**: Among shared rules, group by equivalent meaning (same or very similar rule text). For each distinct shared rule, store the canonical rule text and the list of Transaction identifiers that use it.
5. **Assign unique identifiers**: For each shared rule in the catalog, assign a **unique BR-XXX** identifier (e.g. BR-001, BR-002, …). Ensure no duplicate IDs; use a single numbering scheme for the whole catalog.
6. **Update Transactions**: In each Transaction file: (a) For shared rules, **replace** the rule entry (or local ID) with the **new unique BR-XXX** from the catalog. (b) For private rules, assign a **unique PR-XXX** identifier (e.g. PR-001, PR-002, …) within that Transaction and keep them in the same **Business Rules** section. The section will thus list both **BR-XXX** (shared, from catalog) and **PR-XXX** (private, Transaction-specific) at the same level.
7. **Generate or update the catalog**: Write or update the single Business Rule Catalog file in `.claude/rules` with one entry per shared rule, each with its unique BR-XXX, rule text, and **Used by** (Transactions that use it).

## Business Rule Catalog Structure

The catalog is a single Markdown file. Use the following structure. Adapt section levels and naming to project conventions.

### Catalog header and overview

```markdown
# Business Rule Catalog

This document consolidates **shared** business rules (BR-XXX) extracted from Transaction documents. Only rules that are reusable across different Transactions are listed here. Each rule has a unique BR-XXX identifier, its definition, and the Transactions that use it.

**Generated from**: <description of source, e.g. "Transaction files under {{PATH_DOCS}}/4-implementation/development/"  
**Last updated**: <date or "on demand">
```

### Per-rule entries

For each unique business rule ID, include:

| Element | Description |
|--------|-------------|
| **Rule ID** | The business rule identifier (e.g. BR-001, BR-002). |
| **Rule text** | The full definition or statement of the rule (as in the Transaction). |
| **Used by** | List of Transactions that reference this rule (e.g. links or IDs: TX-3845, TX-4367). |

Order entries by rule ID (e.g. BR-001, BR-002, …).

### Example catalog entry

```markdown
---

## BR-001

**Rule**: The system must retain all ingested positions for a minimum default period (e.g., 1 month).

**Used by**:
- [TX-3845 - Retention and Accessibility of Ingested Positions](path/to/TX-3845-abm-positioning/TX-3845.md)
```

If links are not used, a plain list is enough:

```markdown
**Used by**: TX-3845, TX-4367
```

### Optional sections

- **Summary table**: At the top, a table with columns Rule ID, Rule summary (short), Used by (Transaction IDs).
- **Transactions index**: A section that lists each Transaction and the **shared** rule IDs (BR-XXX) it references (inverse view). Include **only** Transactions that have at least one shared business rule (BR-XXX); omit Transactions that have only private rules (PR-XXX).
- **Conflicts / review**: If the same BR-XXX was found with different texts, list them and the source Transactions for manual consolidation.

## Catalog File Location

- Place the catalog **inside `.claude/rules`** (e.g. `.claude/rules/business-rule-catalog.md`). Adapt the filename to project conventions (e.g. `business-rule-catalog.md` or `rule-catalog.md`).
- Use a single file for the catalog so it remains the one place to look up rules and their Transaction references.

## Full Catalog Template (skeleton)

```markdown
# Business Rule Catalog

This document consolidates shared business rules extracted from Transaction documents. Each rule has a unique BR-XXX and lists the Transactions that use it.

**Generated from**: Transaction files under <path or pattern (e.g. {{PATH_DOCS}}/4-implementation/development/)>  
**Last updated**: <date>

---

## BR-001

**Rule**: <Full rule text.>

**Used by**:
- [TX-XXXX - Transaction title](path/to/Transaction-file.md)
- TX-YYYY

---

## BR-002

**Rule**: <Full rule text.>

**Used by**:
- TX-XXXX

---

<!-- Add one section per shared rule (unique BR-XXX), ordered by ID. -->
```

## Guidelines

- **Only shared rules in catalog**: Include in the catalog **only** business rules classified as **shared** (reusable across different Transactions). Private rules stay in their Transaction document with **PR-XXX** and are not in the catalog.
- **Identifiers**: **BR-XXX** = shared rule (catalog); **PR-XXX** = private rule (Transaction-only). Both appear at the same level in the Transaction’s **Business Rules** section.
- **Unique BR-XXX**: For each rule in the catalog, assign exactly one **unique BR-XXX** (e.g. BR-001, BR-002, …). Use a single numbering scheme for the whole catalog; no duplicate IDs.
- **Unique PR-XXX**: For each private rule in a Transaction, assign a **unique PR-XXX** (e.g. PR-001, PR-002, …) within that Transaction. PR-XXX is used only in the Transaction document.
- **Update Transactions**: After assigning or changing a BR-XXX in the catalog, **update every Transaction** that uses that rule so its Business Rules section references the **new unique BR-XXX**. Ensure private rules in each Transaction use **PR-XXX**.
- **Rule ID format**: Use **BR-XXX** for shared (catalog) and **PR-XXX** for private (Transaction); keep format consistent in the catalog and in Transaction files.
- **Canonical text**: When the same logical rule appears in more than one Transaction, use one canonical rule text in the catalog and list all Transactions under **Used by**. If texts differ, keep one version and add a note or **Conflicts** section for manual review.
- **Transaction reference**: In **Used by**, prefer Transaction ID and short title (e.g. TX-3845 - Retention and Accessibility of Ingested Positions). Add a link to the Transaction file when possible.
- **No technical details**: Keep rule text in the catalog at the same functional level as in the Transaction (business rules only, no implementation detail).

## Reference

- **Artefact-catalog BR source**: `{{PATH_DOCS}}/1-analysis/artefacts/BR/BR-XXX.md`, cross-linked via `.claude/skills/ingest-artefact-transaction/SKILL.md` (which pulls this same canonical text into each `{tx-id}-complete-transaction.md` it assembles — keeping `add-code-traceability` and this skill reading the same rule text).
- Transaction files are assumed to follow the structure described in the **transaction-markdown** skill, with a **Business Rules** section containing lines like `- **BR-XXX**: Rule text.` — this applies to the legacy inline-scanning path only.
- In each Transaction’s **Business Rules** section, **private** rules use **PR-XXX** (unique within the Transaction) and **shared** rules use **BR-XXX** (from the catalog); both are listed at the same level.
- **Private** rules (PR-XXX) remain only in the Transaction; **shared** rules (BR-XXX) are consolidated in the catalog, and each Transaction that uses a shared rule must reference that BR-XXX.
- The catalog in `.claude/rules` is the single consolidated view of all **shared** rules (BR-XXX), their unique identifiers, and the Transactions that use them.

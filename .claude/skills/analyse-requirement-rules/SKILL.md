---
name: analyse-requirement-rules
description: Analyse requirement files, classify business rules as private or shared, consolidate shared rules into a Business Rule Catalog (docs/rules), assign unique BR-XXX identifiers, and update requirements to use those identifiers.
---

# Analyse Requirement Rules - Business Rule Catalog

Use this skill when you need to **analyse** existing requirement documents, **classify** each business rule as private or shared, **consolidate** only **shared** rules into a single **Business Rule Catalog**, assign each catalogued rule a **unique identifier (BR-XXX)**, and **update** the requirement files to reference those identifiers.

Works with requirement files that follow the standard structure (e.g. from the **requirement-markdown** skill): each requirement has a **Business Rules** section where both private and shared rules appear at the **same level**, with identifiers **PR-XXX** (private) and **BR-XXX** (shared, from catalog).

## Private vs Shared Business Rules

Private and shared rules are at the **same level** in the requirement: both appear in the **Business Rules** section. They differ by identifier and whether they are catalogued.

For **each requirement**, review every rule in its Business Rules section and classify it as:

- **Private business rule (PR-XXX)**: Applicable **only** to that requirement. It expresses a constraint or behaviour specific to that requirement and is not intended to be reused elsewhere. Keep it in the requirement document and give it a **unique identifier PR-XXX** (e.g. PR-001, PR-002, …) within that requirement. **Do not** add it to the catalog.
- **Shared business rule (BR-XXX)**: Reusable across **different** requirements. It expresses a general constraint or invariant that can apply in multiple contexts. Give it a **unique BR-XXX** in the catalog. In the requirement, reference the catalog identifier **BR-XXX**.

When in doubt, consider: Could this rule reasonably apply to another requirement or domain? If yes, treat as shared; if it is tightly bound to one requirement scope, treat as private.

## When to Use

- Building or refreshing a central Business Rule Catalog from multiple requirement files.
- Classifying which rules are private (requirement-specific) vs shared (reusable).
- Finding which requirements use a given shared business rule.
- Assigning unique BR-XXX identifiers and keeping requirements in sync with the catalog.

## Process

1. **Locate requirement files**: Identify the folder(s) or glob pattern where requirement markdown files live (e.g. `**/requirements/**/*.md` or `docs/requirements/**/RQ-*.md`). Follow project conventions.
2. **Parse each requirement**: For each file, read the **Business Rules** section and extract every rule (with or without an existing BR-XXX) and its rule text.
3. **Classify each rule (private vs shared)**: For each requirement, review each rule and mark it as **private** (only applicable to this requirement) or **shared** (reusable across requirements). Only shared rules proceed to the catalog.
4. **Deduplicate and consolidate shared rules**: Among shared rules, group by equivalent meaning (same or very similar rule text). For each distinct shared rule, store the canonical rule text and the list of requirement identifiers that use it.
5. **Assign unique identifiers**: For each shared rule in the catalog, assign a **unique BR-XXX** identifier (e.g. BR-001, BR-002, …). Ensure no duplicate IDs; use a single numbering scheme for the whole catalog.
6. **Update requirements**: In each requirement file: (a) For shared rules, **replace** the rule entry (or local ID) with the **new unique BR-XXX** from the catalog. (b) For private rules, assign a **unique PR-XXX** identifier (e.g. PR-001, PR-002, …) within that requirement and keep them in the same **Business Rules** section. The section will thus list both **BR-XXX** (shared, from catalog) and **PR-XXX** (private, requirement-specific) at the same level.
7. **Generate or update the catalog**: Write or update the single Business Rule Catalog file in `docs/rules` with one entry per shared rule, each with its unique BR-XXX, rule text, and **Used by** (requirements that use it).

## Business Rule Catalog Structure

The catalog is a single Markdown file. Use the following structure. Adapt section levels and naming to project conventions.

### Catalog header and overview

```markdown
# Business Rule Catalog

This document consolidates **shared** business rules (BR-XXX) extracted from requirement documents. Only rules that are reusable across different requirements are listed here. Each rule has a unique BR-XXX identifier, its definition, and the requirements that use it.

**Generated from**: <description of source, e.g. "Requirement files under docs/requirements/"  
**Last updated**: <date or "on demand">
```

### Per-rule entries

For each unique business rule ID, include:

| Element | Description |
|--------|-------------|
| **Rule ID** | The business rule identifier (e.g. BR-001, BR-002). |
| **Rule text** | The full definition or statement of the rule (as in the requirement). |
| **Used by** | List of requirements that reference this rule (e.g. links or IDs: RQ-3845, RQ-4367). |

Order entries by rule ID (e.g. BR-001, BR-002, …).

### Example catalog entry

```markdown
---

## BR-001

**Rule**: The system must retain all ingested positions for a minimum default period (e.g., 1 month).

**Used by**:
- [RQ-3845 - Retention and Accessibility of Ingested Positions](path/to/RQ-3845-abm-positioning/RQ-3845.md)
```

If links are not used, a plain list is enough:

```markdown
**Used by**: RQ-3845, RQ-4367
```

### Optional sections

- **Summary table**: At the top, a table with columns Rule ID, Rule summary (short), Used by (requirement IDs).
- **Requirements index**: A section that lists each requirement and the **shared** rule IDs (BR-XXX) it references (inverse view). Include **only** requirements that have at least one shared business rule (BR-XXX); omit requirements that have only private rules (PR-XXX).
- **Conflicts / review**: If the same BR-XXX was found with different texts, list them and the source requirements for manual consolidation.

## Catalog File Location

- Place the catalog **inside `docs/rules`** (e.g. `docs/rules/business-rule-catalog.md`). Adapt the filename to project conventions (e.g. `business-rule-catalog.md` or `rule-catalog.md`).
- Use a single file for the catalog so it remains the one place to look up rules and their requirement references.

## Full Catalog Template (skeleton)

```markdown
# Business Rule Catalog

This document consolidates shared business rules extracted from requirement documents. Each rule has a unique BR-XXX and lists the requirements that use it.

**Generated from**: Requirement files under <path or pattern>  
**Last updated**: <date>

---

## BR-001

**Rule**: <Full rule text.>

**Used by**:
- [RQ-XXXX - Requirement title](path/to/requirement-file.md)
- RQ-YYYY

---

## BR-002

**Rule**: <Full rule text.>

**Used by**:
- RQ-XXXX

---

<!-- Add one section per shared rule (unique BR-XXX), ordered by ID. -->
```

## Guidelines

- **Only shared rules in catalog**: Include in the catalog **only** business rules classified as **shared** (reusable across different requirements). Private rules stay in their requirement document with **PR-XXX** and are not in the catalog.
- **Identifiers**: **BR-XXX** = shared rule (catalog); **PR-XXX** = private rule (requirement-only). Both appear at the same level in the requirement’s **Business Rules** section.
- **Unique BR-XXX**: For each rule in the catalog, assign exactly one **unique BR-XXX** (e.g. BR-001, BR-002, …). Use a single numbering scheme for the whole catalog; no duplicate IDs.
- **Unique PR-XXX**: For each private rule in a requirement, assign a **unique PR-XXX** (e.g. PR-001, PR-002, …) within that requirement. PR-XXX is used only in the requirement document.
- **Update requirements**: After assigning or changing a BR-XXX in the catalog, **update every requirement** that uses that rule so its Business Rules section references the **new unique BR-XXX**. Ensure private rules in each requirement use **PR-XXX**.
- **Rule ID format**: Use **BR-XXX** for shared (catalog) and **PR-XXX** for private (requirement); keep format consistent in the catalog and in requirement files.
- **Canonical text**: When the same logical rule appears in more than one requirement, use one canonical rule text in the catalog and list all requirements under **Used by**. If texts differ, keep one version and add a note or **Conflicts** section for manual review.
- **Requirement reference**: In **Used by**, prefer requirement ID and short title (e.g. RQ-3845 - Retention and Accessibility of Ingested Positions). Add a link to the requirement file when possible.
- **No technical details**: Keep rule text in the catalog at the same functional level as in the requirement (business rules only, no implementation detail).

## Reference

- Requirement files are assumed to follow the structure described in the **requirement-markdown** skill, with a **Business Rules** section containing lines like `- **BR-XXX**: Rule text.`
- In each requirement’s **Business Rules** section, **private** rules use **PR-XXX** (unique within the requirement) and **shared** rules use **BR-XXX** (from the catalog); both are listed at the same level.
- **Private** rules (PR-XXX) remain only in the requirement; **shared** rules (BR-XXX) are consolidated in the catalog, and each requirement that uses a shared rule must reference that BR-XXX.
- The catalog in `docs/rules` is the single consolidated view of all **shared** rules (BR-XXX), their unique identifiers, and the requirements that use them.

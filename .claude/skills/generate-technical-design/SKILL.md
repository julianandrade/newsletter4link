---
name: generate-technical-design
description: Generate a Technical Design document in Markdown from a Functional Design Document (FDD) — same section outline as the Technical Design Template (Overview, Background, Terminology, Goals, Design, System Architecture, Data Models, integrations, NFRs, test plan, risks, etc.). Use when asked to create a technical design, TDD, design doc, TD from a functional design document, or "gerar documento de design técnico" from an FDD.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `.claude/config/variables.md` to resolve all project variables before execution.

# Generate Technical Design

Use this skill to produce a **single Markdown Technical Design (TD)** whose **outline matches the Technical Design Template** (Notion-style index: context, goals, design, architecture, data, events, operations, quality, delivery, risk). The **primary source** is a **Functional Design Document (FDD)**: Markdown (or equivalent) with typical areas such as document control, system overview, glossary, roles, requirement catalog, transactions, integrations, business rules, and screens. The **path** is always the one the user provides; there is no fixed repository filename.

## When to Use This Skill

- User asks for a **technical design**, **Technical Design Document**, **TDD** (in the architecture sense), **design doc**, or **TD** derived from an FDD.
- User asks to **gerar documento de design técnico** a partir do documento de design funcional.
- User points at a **Markdown path** to their functional design document and wants an engineering-facing design artifact.

**Trigger phrases (examples):**

- "Generate technical design from the functional design document"
- "Create TD from my FDD at `docs/initiative/functional-design.md`"
- "Write the technical design document using the FDD"
- "Produce a design doc in the Notion technical design template structure"
- "Gerar design técnico a partir do documento de design funcional"

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| **Functional Design Document** | Yes | Path to the FDD markdown (user-supplied; e.g. `<path-to-fdd>.md`). |
| **Complementary docs** | No | NFR-only annexes, ADRs, existing OpenAPI/AsyncAPI, diagrams, security notes — use only to fill sections; cite paths. |
| **Output language** | No | Default: **same language as the source FDD**. User may override (e.g. PT vs EN). |
| **Output path** | No | Default: see **Default output path** below. User may specify an explicit file path. |

## Outputs

- **One Markdown file** containing:
  - **H1**: System or initiative title from *Document Information* / *Scope and Objective* (or best available FDD title).
  - **Mandatory table of contents** with links to every **H2** listed under [Required document outline](#required-document-outline). Include **H3** where specified.
  - **Section "Document control & provenance"** instead of a personal "About the author": FDD title, version, date, status, classification (if present), and relative path or name of the source FDD.
  - Tables where they improve clarity (consistent with FDD style when the FDD uses tables).

Do **not** omit a top-level section from the outline: if there is no source material, keep the heading and use a short paragraph plus `[TBD]` or move actionable unknowns to **Open Issues**.

## Default output path

1. Resolve the directory of the input FDD file.
2. Derive `<InitiativeSlug>` from *System / Initiative* or *Document Title* in the FDD (kebab-case, ASCII, remove confidential markers from the slug if needed).
3. Write: `{fdd-directory}/Technical-Design_<InitiativeSlug>_v1.md` unless the user specifies another path or version suffix.

If multiple FDD versions exist, prefer the path the user gave; do not overwrite without confirmation unless the user asked to replace.

## Required document outline

Use these **exact H2 titles** (order preserved) so tooling and readers get a stable structure:

1. `## Document control & provenance`
2. `## Overview`
3. `## Background`
4. `## Terminology`
5. `## Goals`
6. `### Non-goals (or out-of-scope)`
7. `### Future Goals`
8. `## Stakeholders`
9. `## Design`
10. `### System Architecture`
11. `### Data Models`
12. `### Event System`
13. `### Projected Data`
14. `### Resource Considerations`
15. `### Rate Limits`
16. `### Staging Environment Support`
17. `### Performance`
18. `### Error Handling`
19. `### Test Plan`
20. `### Open Issues`
21. `## Best Practices`
22. `## Impact`
23. `## Usage Measurements`
24. `## Development Phases`
25. `## Risks`
26. `## Cost Analysis`
27. `## Alternatives`

Under each heading, write content derived from the FDD mapping below. Subsections **without** H3 wrappers in the list above are free-form paragraphs or bullet lists under the parent H2.

## Functional Design Document → Technical Design mapping

Use this table to **source** each section. When the FDD uses identifiers (RQ-, TX-, BR-, NTI-, SCR-, FEAT-, EV-, NFR-), **preserve them** in parentheses or a reference column where useful.

| FDD area (typical headings) | TD section(s) | Guidance |
|----------------------------|---------------|----------|
| *Document Information*, *Revision History* | Document control & provenance | Summarize title, version, date, status, classification; link to source file; note this TD is derived from the FDD. |
| *Scope and Objective*, *System Overview* | Overview, Background, Goals, Non-goals | Overview = short executive summary. Background = context, legacy vs target, dependencies. Goals = in-scope outcomes; Non-goals = explicit out-of-scope from FDD tables. |
| *Glossary* | Terminology | Reuse definitions; do not invent new terms without `[TBD]`. |
| *Business Roles* | Stakeholders | Map roles to consumers/operators of the system; note auth boundaries (e.g. supervisor). |
| *Features*, *Requirement Catalog*, *Functional Requirements* | Goals, Design, Test Plan | Goals tie to measurable outcomes; Design summarizes capability areas; Test Plan lists traceability to RQ/TX/NTI acceptance. |
| *Transaction Specifications* (TX), *Non-Transactional* (NTI), *Screens* (SCR) | Design, System Architecture | Describe flows, components, and boundaries; sequence at a high level. |
| *Business Rules* (BR), cross-cutting RQ/NFR | Design, Error Handling, Best Practices | Centralize validation and messaging expectations. |
| *Integration Interfaces*, external dependencies, APIs | System Architecture, Resource Considerations, Rate Limits, Staging | Document upstream/downstream systems; capacity and limits if stated or `[TBD]`. |
| Events catalog (EV-*), Kafka/async mentions | Event System | If the FDD is message-driven or lists events, specify topics/contracts at high level; else state "not applicable" or `[TBD]`. |
| Persistence, tables (e.g. TDOT*, TRF*), entities | Data Models | Present **logical** model for the **target** solution; note legacy table names as mapping from Oracle/legacy when the FDD cites them. |
| Read models, reporting, CQRS-style projections (if any) | Projected Data | If absent in the FDD, state N/A or future `[TBD]`. |
| NFR sections, performance, scale | Performance | Only concrete numbers from the FDD; else hypotheses + Open Issues. |
| Test acceptance, validation criteria in TX steps | Test Plan | Table or list: ID → scope → acceptance reference. |
| Unclear integrations, pending validations | Open Issues | Actionable questions, each traceable to a gap in the FDD. |
| Operational rollout, phases (if in the FDD) | Development Phases | Otherwise outline sensible phases from scope. |
| Business value, KPIs (if in the FDD) | Impact, Usage Measurements | If missing, `[TBD]` with suggested metrics. |
| Options considered, legacy vs modern stack | Alternatives | Especially when the FDD states POC boundaries or replacement strategy. |
| Cost, licensing, infra (if in the FDD) | Cost Analysis | Otherwise short note + `[TBD]`. |

## Quality rules

1. **Traceability**: When a statement comes from the FDD, attach the relevant **RQ-, TX-, BR-, NTI-, SCR-, FEAT-** (and **EV-, NFR-** when present) in the same bullet or in a parenthetical.
2. **No fabrication**: Anything not supported by the FDD or user-supplied complementary docs must be labeled **`[TBD]`** or moved to **Open Issues** with a specific question — never present guesses as facts.
3. **Legacy vs target**: When the FDD contrasts Oracle Forms / legacy with React + .NET (or other target), keep that distinction in **Background**, **System Architecture**, and **Data Models** (mapping tables).
4. **Terminology**: Use the FDD glossary terms consistently; do not redefine established terms differently without flagging a conflict in Open Issues.
5. **Security & confidentiality**: If the FDD is confidential, do not strip classification from **Document control & provenance**; avoid pasting secrets or credentials.

## Process

1. **Resolve variables**: Read `.claude/config/variables.md` for `{{CLAUDE_DOC_PATH}}` if the user stores docs there; still honor explicit FDD paths outside that tree.
2. **Read the FDD** (and optional complementary docs) completely enough to extract scope, glossary, roles, catalog, transactions, integrations, and NFRs.
3. **Draft Document control & provenance** from FDD metadata and source path.
4. **Fill sections in outline order**, using the mapping table; for each section, scan the FDD for the relevant subsections and tables.
5. **Build Test Plan** from RQ/TX/NTI acceptance language where it exists; mark gaps.
6. **Consolidate Open Issues** from all `[TBD]` items and explicit FDD "to be confirmed" notes.
7. **Review** for traceability IDs and consistent terminology.
8. **Write** the Markdown file to the **default or user-specified output path**.

## Reference

- Expected shape: metadata, glossary, RQ catalog, transaction specs, integrations — always at the **path the user provides** (no fixed filename).
- Peer procedural skills: `architect-requirement` (per-requirement tech spec), `generate-mockup` (visuals from requirements).

---
name: tx-checker
description: Navigate the application website and validate if business rules, Transactions, and specs documentation are accurate and complete. Use Playwright MCP to explore the app and cross-check with {{PATH_DOCS}}.
model: sonnet
color: orange
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

## Where Used

- **frontend-development** / **backend-development** (`.claude/commands/frontend-development.md`, `.claude/commands/backend-development.md`): step **9** — Documentation Update; follow `.claude/skills/update-transaction-documentation/SKILL.md`
- *(futuros usos podem ser adicionados aqui)*

## Core Responsibilities

1. **Website Navigation & Analysis**: Use Playwright MCP to thoroughly navigate the application, take page snapshots, and systematically explore all key functionalities and user flows.
2. **Documentation Cross-Validation**: Analyze and validate the accuracy and completeness of:
   - Business Rules (BR-*) documented in the complete Transaction files (`{tx-id}-complete-transaction.md`) in `{{PATH_DOCS}}/4-implementation/development/`
   - Transactions (TX-*) catalog in `{{PATH_DOCS}}/4-implementation/development/`
   - Specs (`{tx-id}-complete-transaction.md`, `{tx-id}-backend-tech-spec.md` / `{tx-id}-frontend-tech-spec.md` when present) in `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/`
   - Screens and navigation flows described in those specs
3. **Gap Analysis**: Identify missing, incorrect, or incomplete documentation elements.
4. **Comprehensive Reporting**: Generate detailed validation reports with findings and recommendations.

# Validation Instructions

## Phase 1: Website Exploration and Setup
1. Navigate to the provided website URL using Playwright MCP.
2. Take initial page snapshot and identify main navigation structure.
3. Systematically explore all screens, menus, forms, and user flows.
4. Document discovered functionalities, screens, and business logic.
5. Capture screenshots of key screens for reference; save all screenshots in **`{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/screenshots/`** (do not place under application source code).
6. **Identify `{tx-id-name}`**: Determine which Transaction(s) are being validated. The full folder name under `{{PATH_DOCS}}/4-implementation/development/` (e.g. `TX-001-criar-tarefa`); use it in all paths. The short **Transaction ID** (e.g. `TX-001`) is used in docs and report content where applicable. If not clear, extract from the documentation path or ask the user.
7. **Create Directory Structure**: Ensure the following directory structure exists under `{{PATH_DOCS}}/` (use this path for artifacts—not under application source), creating it if necessary:
   - `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/`
   - `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/screenshots/`

## Phase 2: Documentation Analysis
Read and analyze the project documentation:
- **Transactions**: `{{PATH_DOCS}}/4-implementation/development/` (TX-* folders/files).
- **Specs (complete Transaction + business rules)**: `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/` (`{tx-id}-complete-transaction.md` and related `{tx-id}-backend-tech-spec.md` / `{tx-id}-frontend-tech-spec.md` when present). Business rules (BR-*) are defined inside the complete Transaction file.
- **Screen / flows**: Screens and navigation are described in the specs; if there is no separate Screen Catalog file, use the specs as the source of truth.

## Phase 3: Cross-Validation Process
1. **Business Rules Validation**: Verify each BR-* rule (from `{tx-id}-complete-transaction.md`) against observed app behavior; check if rules are implemented correctly; identify missing business logic not documented.
2. **Transactions Validation**: Test each TX-* Transaction against actual implementation; verify pre-conditions, actions, and post-conditions; identify missing or incorrect Transaction specifications.
3. **Screen / Flow Validation**: Compare documented screens and flows (from specs) with the actual app; verify navigation and component behavior; check for missing or incorrect details.

## Phase 4: Comprehensive Reporting
Generate detailed validation report covering:

### Accuracy Assessment
- **Correctly Documented**: Items that match app implementation.
- **Incorrectly Documented**: Discrepancies between docs and reality.
- **Missing from Documentation**: App features/behaviors not documented.
- **Documentation Orphans**: Documented items not found in the app.

### Completeness Analysis
- **Coverage Percentage**: How much of the app is documented.
- **Critical Gaps**: Important missing documentation.
- **Recommendation Priority**: High/Medium/Low priority fixes.

### Report Structure
```markdown
# Website Documentation Validation Report

## Executive Summary
- Overall accuracy percentage
- Critical findings summary
- Recommendation priorities

## Business Rules Analysis (BR-*)
- [BR-ID]: Status, Findings, Recommendations

## Transactions Analysis (TX-*)
- [TX-ID]: Status, Findings, Recommendations

## Screens / Flows Analysis
- [Screen/flow]: Status, Findings, Recommendations

## Missing Documentation
- Undocumented features/screens/rules found

## Recommendations
- High Priority fixes
- Medium Priority improvements
- Low Priority enhancements
```

Generate the report as a .md file in **`{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/`**. Use file name `Documentation_Validation_Report_[TIMESTAMP].md`. All report content, section titles, and artifact names must be in **English**.

## Mandatory completion output (handoff)

At the end of every substantive run, you **must** emit this structured handoff in **English**. Full BR/RQ analysis belongs in **Documentation_Validation_Report_[TIMESTAMP].md**; the handoff **references paths** under `{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/` and `reqs-check/screenshots/` instead of duplicating the full report.

Use **`None`** explicitly as a single bullet under **Critical issues**, **Minor issues**, **Recommendations**, or **Obstacles encountered** when there is nothing to report. Omit the **Files modified** subsection entirely if no existing files were changed.

**Test artifacts / execution summary** here means **exploratory validation via Playwright** (not a unit/E2E runner): list the validation report path, screenshot folder, and a one-line outcome (e.g. accuracy summary from the executive summary).

```
## Summary
- <site explored; docs cross-checked; report written>

## Files created
- <{{PATH_DOCS}}/4-implementation/development/{tx-id-name}/tests/reqs-check/Documentation_Validation_Report_*.md>
- <reqs-check/screenshots/* as applicable>
- ...

## Files modified
- <repo-relative path>
- ...
<!-- omit this whole subsection if none -->

## Test artifacts / execution summary
- Playwright exploratory validation (not automated unit/E2E suite).
- Documentation validation report: <path>
- Screenshots: <tests/reqs-check/screenshots/>

## Critical issues
- <critical doc gaps or blocking discrepancies>
- or: None

## Minor issues
- <non-blocking>
- or: None

## Recommendations
- <priority fixes for documentation>
- or: None

## Obstacles encountered
- <URL missing, partial navigation>
- or: None
```

Close the browser after completing the comprehensive validation.

**Note**: Use the **full** folder name (`tx-id-name`, e.g. `TX-001-criar-tarefa`), not the short ID alone (e.g. `TX-001`). Replace `{tx-id-name}` with the actual folder under `{{PATH_DOCS}}/4-implementation/development/`. If the directory structure does not exist, create it before saving files. If validating multiple Transactions, you may create separate reports or a consolidated report in a general location (ask the user for preference).

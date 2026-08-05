---
name: validate-transaction
description: Validate whether a transaction document qualifies as one transaction before starting Clarify or other flow steps. Use when checking transaction definition (bounded, implementable, testable, traceable), split criteria (one user goal, size, dependencies), and when suggesting splits with folder structure TX-XXX/TX-XXX_01/, TX-XXX/TX-XXX_02/, etc.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Validate Transaction

Use this skill when you need to **validate** whether the content of a transaction document qualifies as **one** transaction before proceeding (for example before step 1 Clarify in complete-development).

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 0 — Validate transaction

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id. Main agent executes the validation procedure (no dedicated sub-agent). |
| **In flow** | Step 0: the **product-owner** subagent (VALIDATE mode) executes this validation before step 1 and **reports** the verdict. The validation checks the **definition** of a transaction and **split criteria**; if the content does not qualify or should be split, product-owner returns justification and a split suggestion (no structure created). The **main orchestrator** presents this to the user; if the user agrees, the **orchestrator** generates the folder structure and split documents and, for each new transaction, asks permission before Clarify. |

Reference: `{{PATH_DOCS}}/4-implementation/development/README.md` defines the transaction definition and split criteria. Transaction documents typically live under `{{PATH_DOCS}}/4-implementation/development/{tx-id}/` (e.g. `{tx-id}.md` or `{tx-id}-revised.md`).

## Artefact-catalog source (alternative to free prose)

If `{{PATH_DOCS}}/1-analysis/artefacts/TX/{tx-id}.md` or `{{PATH_DOCS}}/1-analysis/artefacts/NTI/{tx-id}.md` exists, that structured artefact — not a free-prose `{tx-id}.md` — is the source to validate. See `.claude/skills/ingest-artefact-transaction/SKILL.md` for the full catalog layout. In this case:

- **Definition check** (below) still applies, but a catalog TX/NTI is atomic by construction — each is a single Entry Conditions / Validation / Result table (or, for an NTI, a single Data Sources / Filters / Output Specification set) — so this check is a fallback, not the primary gate.
- **Add a reference-integrity check**: every ID listed in the artefact's `references`, `mentions`, `screens`, and `others` meta fields must resolve to an existing file under `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/` (infer `{TYPE}` from the ID prefix: `BI-`, `BR-`, `DE-`, `EV-`, `NTI-`, `SCR-`, `TX-`). Use `{{PATH_DOCS}}/1-analysis/artefacts/StoryNarratives/{TYPE}-Business.json` as a fast existence index when present. Treat any unresolved ID as a blocking gap — report it the same way an invalid/split verdict is reported (see Process step 5), but it is a **data problem** (missing or mis-typed artefact), not a scope/split problem.
- The per-transaction working folder (`{{PATH_DOCS}}/4-implementation/development/{tx-id}/`) is still created here exactly as in the free-prose case — only the **source location** for step 1 below differs.

## Transaction Definition (must hold for one transaction)

A **transaction** is a clearly scoped **value delivery** that:

1. **Can be implemented and tested independently** (with explicit dependencies on other transactions, when applicable).
2. **Corresponds to observable behavior** by the user or by the system (e.g. create task, edit task, list and filter tasks).
3. **Is traceable**: it is possible to point to code, PR, and tests that satisfy it.
4. **Is documented** in the project format — either the legacy `{tx-id}.md` in the transaction folder, or the artefact-catalog `{{PATH_DOCS}}/1-analysis/artefacts/{TX|NTI}/{tx-id}.md` — with clarifications and `{tx-id}-complete-transaction.md` when applicable.

**Summary**: The text must be a **bounded value delivery**, independently implementable and testable, with **observable and traceable** behavior.

**Validation**: If the text describes a broad topic (e.g. "task system") or multiple distinct deliveries with no clear boundary, it is **not** a single transaction and should be split or rewritten.

## Criteria for Splitting into Multiple Transactions

Verify whether the content **should be split** into two or more transactions. Use the following criteria. **Do not** use stack layer (backend vs frontend) as a split criterion; that belongs to architects in **frontend-development** / **backend-development** (step **4a**).

### 1. One user goal per transaction

- If the text describes **two or more distinct user goals** (e.g. "create task" and "send notification to creator"), consider **two or more transactions**.
- Each transaction should answer one unique question of the form: "Can the user do X?"

### 2. Testability and complete-development cycle

- If a single transaction would generate **too many scenarios** (e.g. `.feature`), a **very long test loop**, or **disproportionate security scope**, consider splitting into smaller transactions.
- A transaction should be sized so that the development and test cycle is feasible (e.g. within iteration limits).

### 3. Reuse and explicit dependency

- If part of the text is **foundational** (e.g. "list tasks") and another part is an **action on top of that base** (e.g. "filter tasks"), it may be one transaction ("list and filter") or two transactions with **explicit dependency** (e.g. TX-003 list, TX-004 filter; TX-004 depends on TX-003).
- When there is dependency between transactions, it must be recorded in **Dependencies** (or **System Dependencies**) in the transaction document.

### 4. Size and deliverability

- A transaction should be **deliverable** within one full cycle (clarify → specify → architect → develop → test → security) without becoming a "mega-transaction".
- If it is not possible to define **testable, bounded acceptance criteria** for the current text, consider splitting until each part has clear acceptance.

### What not to use as split criteria

- **Stack layers (backend vs frontend)**: layer split is an architect decision at the appropriate step. A transaction may span multiple layers; do **not** split by stack here.

## Anti-patterns (content does not qualify when)

- **Multiple deliveries in one TX**: the content maps to multiple PRs or multiple independent features with no clear boundary.
- **Topic instead of delivery**: the text describes a topic/area (e.g. "improvements in the task module") instead of observable and testable behavior.
- **Refactor + feature mixed without focus**: the feature is not clearly described and testable; the transaction becomes a mix of "do several things".
- **No acceptance criteria**: it is not possible to list testable acceptance criteria for what is written.

## Process

> **Who does what:** Below, "report to the user" and structure-generation are split by context (see **Execution**). **In flow** (complete-development step 0), the **product-owner** subagent runs steps 1–5 and **reports only**; the **main orchestrator** handles user agreement and generates the split structure (step 5 onward). **Direct/manual** runs: the main agent does both.

0. **Ensure reference file exists**: Check whether `{{PATH_DOCS}}/4-implementation/development/README.md` exists. If it does not, copy `.claude/skills/validate-transaction/templates/README.md` to `{{PATH_DOCS}}/4-implementation/development/README.md` before proceeding.
1. **Locate the transaction document**: First check whether `{{PATH_DOCS}}/1-analysis/artefacts/TX/{tx-id}.md` or `{{PATH_DOCS}}/1-analysis/artefacts/NTI/{tx-id}.md` exists (artefact-catalog source — see above). If not, fall back to the legacy location `{{PATH_DOCS}}/4-implementation/development/{tx-id}/` (e.g. `{tx-id}.md` or `{tx-id}-revised.md`). Use the transaction ID from context or command arguments.
2. **Read the content**: Read the transaction document (from whichever location resolved in step 1) and `{{PATH_DOCS}}/4-implementation/development/README.md` for the full definition and split criteria.
3. **Check the definition**: Verify that the content is a bounded value delivery, independently implementable and testable, with observable and traceable behavior. If it violates the definition (e.g. broad topic, multiple unbounded deliveries), treat as **does not qualify**.
4. **Check split criteria and reference integrity**: Verify whether the content should be split (one user goal per TX; size/deliverability; explicit dependencies; testability). Do **not** use stack layer as split criterion. For an **artefact-catalog source**, also run the reference-integrity check described above.
5. **Decide outcome**:
   - **If valid (one transaction, no split needed)**: Proceed to the next step (e.g. step 1 Clarify). Do not stop.
   - **If it does not qualify or should be split**: Report to the user with **justification** and a **split suggestion** including the **folder structure** (see "Transaction split naming convention and folder structure" below): `TX-XXX/TX-XXX_01/TX-XXX_01.md`, `TX-XXX/TX-XXX_02/TX-XXX_02.md`, etc. **If the user agrees** to the split, the agent must **generate the structure**: create the subfolders and split the content into the appropriate transaction documents for each TX-XXX_NN. After creating the structure, also generate `_tree.md` at `{{PATH_DOCS}}/4-implementation/development/{tx-id}/_tree.md` (see "_tree.md generation" below). Then proceed to step 6. **If the user does not agree**, stop the flow.
6. **When split structure is created** (by agent, after user agreement): For **each** resulting transaction (TX-XXX_01, TX-XXX_02, …), the agent must **ask the user for permission** before clarification (or before the next flow step). Only after user authorization execute that step for that transaction. After all structure and `_tree.md` are written, output:
   ```
   _tree.md created at: {{PATH_DOCS}}/4-implementation/development/{tx-id}/_tree.md
   To develop all sub-transactions in dependency order: /complete-development-tree --tree {{PATH_DOCS}}/4-implementation/development/{tx-id}/_tree.md
   ```

## _tree.md generation

When the split structure is created (after user agreement), generate `{{PATH_DOCS}}/4-implementation/development/{tx-id}/_tree.md`.

**Dependency inference**: analyze the transaction content and the proposed split to determine which sub-transactions are foundational (no parents) and which logically depend on prior ones. The dependency must be based on functional dependency (a sub-transaction that builds on the result of another), not stack layer. Explain the reasoning in each `Notes` cell.

**Format**:

```markdown
# Transaction Tree — {tx-id}

## Dependencies

| TX | Parents | Notes |
|----|---------|-------|
| {tx-id}_01 | — | Foundation: [reason why this is the base] |
| {tx-id}_02 | {tx-id}_01 | Depends on _01: [reason] |
| {tx-id}_03 | {tx-id}_02 | Depends on _02: [reason] |

## Tree view (illustrative)

{tx-id}_01
└── {tx-id}_02
    └── {tx-id}_03
```

- Use `—` (em dash) in Parents for sub-transactions with no dependencies.
- Sub-transactions that can run in parallel (no functional dependency between them) both use `—` in Parents; note "Parallel — no dependency on sibling" in Notes.
- This file is consumed by `/complete-development-tree --tree <path>` to schedule development in dependency order.

## Transaction Split Naming Convention and Folder Structure

When the content **must be split** into more than one transaction, suggest new identifiers and the folder structure as follows:

- **Identifiers**: `TX-XXX_01`, `TX-XXX_02`, …, `TX-XXX_NN` (hyphen in base; underscore before sub-number; leading zero when needed; e.g. TX-001_01, TX-001_02).
- **Folder structure**: The parent folder keeps the original transaction ID. Each split transaction is a subfolder with its identifier, containing its transaction document:
  ```
  {{PATH_DOCS}}/4-implementation/development/
  └── TX-001/
      ├── TX-001_01/
      │   └── TX-001_01.md
      ├── TX-001_02/
      │   └── TX-001_02.md
      └── TX-001_0N/
          └── TX-001_0N.md
  ```
- **Report to user**: When suggesting a split, explicitly indicate this structure. **If the user agrees**, the agent must **generate the structure**: create the subfolders and split the content into the appropriate transaction documents.
- **Permission**: Before proceeding with clarification (or the next step) for **each** split transaction, the agent must **ask the user for permission**. Only after user authorization should it execute that step for that transaction.

## Outcomes Summary

| Outcome | Action |
|--------|--------|
| **Valid** (one transaction, no split) | Proceed to the next step (e.g. step 1 Clarify). |
| **Does not qualify** or **should be split** | Report to the user with justification. Suggest split with folder structure `TX-XXX/TX-XXX_01/TX-XXX_01.md`, `TX-XXX/TX-XXX_02/TX-XXX_02.md`, etc. **If user agrees**: agent generates the structure (subfolders and split documents) AND `_tree.md` inside the parent folder; for each new transaction, ask permission before proceeding with Clarify (or next step); output the `/complete-development-tree --tree <path>` offer. **If user does not agree**: stop the flow. |

## Guidelines

- **Always validate before Clarify**: In flows that include "Validate transaction" (e.g. complete-development step 0), run this validation **before** step 1 (Clarify). Do not skip validation when the flow specifies it.
- **One transaction per document**: The validation answers: "Does this document describe exactly **one** transaction?" If the answer is no, stop and suggest split or rewrite.
- **No stack-based split**: Do not suggest splitting by backend vs frontend; that is an architect concern.
- **Explicit dependency**: When suggesting multiple transactions that depend on each other, indicate that dependencies must be recorded in the transaction documents (Dependencies / System Dependencies).
- **Folder structure**: When suggesting split, report the exact folder structure: `TX-XXX/TX-XXX_01/TX-XXX_01.md`, `TX-XXX/TX-XXX_02/TX-XXX_02.md`, etc.
- **Permission per split**: When split transactions are created (TX-XXX_01, TX-XXX_02, …), for **each one** ask user permission before running Clarify (or the next step); only after authorization execute that step for that transaction.
- **Who generates the structure**: When the user agrees to a suggested split, the structure must be created automatically (subfolders + split documents); do not require the user to create it manually. **In flow** (complete-development step 0) the validating subagent (product-owner) only **reports**; the **main orchestrator** generates the structure after user agreement. **Direct/manual** runs: the main agent generates it.

## Reference

- **Artefact-catalog source and reference resolution**: `.claude/skills/ingest-artefact-transaction/SKILL.md`
- **Definition and split criteria**: `{{PATH_DOCS}}/4-implementation/development/README.md`
- **Flow that uses validation**: `.claude/commands/complete-development.md` (step 0 — Validate transaction). Before starting Clarify, the **product-owner** subagent (VALIDATE mode) validates using this skill and **reports**; if the transaction does not qualify or should be split, it returns a split suggestion (format TX_XXX_01, TX_XXX_NN). If the user agrees, the **main orchestrator** generates the structure; otherwise, stop.

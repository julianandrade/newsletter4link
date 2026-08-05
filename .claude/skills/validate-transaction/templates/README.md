# Transactions — Definition and Criteria

This document defines **what a transaction is** in this repository and **when a transaction should be split into several**, to validate scope before and during the development flow (**complete-development** trunk, **frontend-development** / **backend-development**, product-owner).

## Transaction definition

A **transaction** is a clearly scoped **value delivery** that:

1. **Can be implemented and tested independently** (with explicit dependencies on other transactions, when applicable).
2. **Corresponds to observable behavior** by the user or by the system (e.g. create task, edit task, list and filter tasks).
3. **Is traceable**: it is possible to point to code, PR, and tests that satisfy it.
4. **Is documented** in the project format: `{tx-id}.md` in the transaction folder, with clarifications and `{tx-id}-complete-transaction.md` when applicable.

**Validation**: If the text describes a broad topic (e.g. "task system") or multiple distinct deliveries with no clear boundary, it is **not** a single transaction — it should be split or rewritten.

---

## Criteria for splitting into multiple transactions

Use these criteria to decide whether the content of a `{tx-id}.md` should be **split into two or more transactions**. The decision about stack layers (backend/frontend) is made later by architects at the appropriate step; do **not** use technical layer as a split criterion here.

### 1. One user goal per transaction

- If the text describes **two or more distinct user goals** (e.g. "create task" and "send notification to creator"), consider **two or more transactions**.
- Each transaction should answer one unique question of the form: "Can the user do X?"

### 2. Testability and development cycle

- If a single transaction would generate **tracks** (frontend/backend) with **many scenarios** (.robot), a **very long loop 7**, or **disproportionate security scope (7c)**, consider splitting into smaller transactions.
- A transaction should be sized so that the Developer ↔ Tests ↔ Security loop is feasible (e.g. within the iteration limit defined in the command).

### 3. Reuse and explicit dependency

- If part of the text is **foundational** (e.g. "list tasks") and another part is an **action on top of that base** (e.g. "filter tasks"), it may be one transaction ("list and filter") or two transactions with **explicit dependency** (e.g. TX-003 list, TX-004 filter; TX-004 depends on TX-003).
- When there is a dependency between transactions, it must be recorded in **System Dependencies** / **Dependencies** in the transaction document.

### 4. Size and deliverability

- A transaction should be **deliverable** within one full cycle (clarify → specify → architect → develop → test → security) without becoming a "mega-transaction".
- If it is not possible to define **testable, bounded acceptance criteria** for the current text, consider splitting until each part has clear acceptance.

### What not to use as split criteria

- **Stack layers (backend vs frontend)**: layer split is a decision for architects (backend-architect, frontend-architect) at step **4a** of **frontend-development** / **backend-development**. A transaction may span multiple layers; stack split is not done here.

---

## Transaction split naming convention

When a transaction must be **split into more than one**, the new transactions should be identified as follows:

- **Identifiers**: `TX-XXX_01`, `TX-XXX_02`, …, `TX-XXX_NN` (hyphen in base id; underscore before sub-number; leading zero as needed; e.g. TX-001_01, TX-001_02).
- **Folder structure**: The parent folder keeps the original transaction ID. Each transaction resulting from the split is a subfolder with its identifier, containing the transaction document:

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

- **Report to user**: When suggesting a split, the agent must explicitly indicate this structure. **If the user agrees**, the agent creates the subfolders and split documents automatically — the user does not need to create them manually.
- **Permission to clarify**: before proceeding with clarification of **each** transaction resulting from the split, the agent must **ask the user for permission**. Only after the user authorizes should it execute the Clarify step (product-owner) for that transaction. This applies both in **complete-development** (step 0 → split suggestion; then, for each TX-XXX_NN, ask permission and execute step 1) and in product-owner when it suggests the split.

---

## Anti-patterns (content does not qualify when)

- **Multiple deliveries in one TX**: the content maps to multiple PRs or multiple independent features with no clear boundary.
- **Topic instead of delivery**: the text describes a topic or area (e.g. "improvements in the task module") instead of observable and testable behavior.
- **Refactor + feature mixed without focus**: the feature is not clearly described and testable; the transaction becomes a mix of "do several things".
- **No acceptance criteria**: it is not possible to list testable acceptance criteria for what is written.

---

## Use of the definition in the flow

- **Complete-development (step 0 — Validate transaction)**: Before step 1 (Clarify), the agent reads the transaction document and this README; verifies whether the content qualifies as **one** transaction according to the definition and whether it does **not** violate the split criteria (i.e. should not be split). If it does not qualify or should be split, the agent **stops** and reports to the user with a split suggestion and **folder structure** `TX-XXX/TX-XXX_01/TX-XXX_01.md`, `TX-XXX/TX-XXX_02/TX-XXX_02.md`, etc. (see "Transaction split naming convention" above). For each transaction resulting from the split, the agent must **ask the user for permission** before proceeding with clarification of that transaction.
- **Product-owner (CLARIFY)**: When analysing the transaction file, the product-owner verifies **scope**: does the content cover more than one user goal or violate size/deliverability criteria? If so, it must **suggest the split** in the format TX-XXX_01, TX-XXX_02, TX-XXX_NN with the indicated folder structure and note that **permission must be requested to proceed with clarification of each one** (and, if appropriate, include questions in the clarifications about how the stakeholder prefers to split).

Command references: `.claude/commands/complete-development.md` (trunk), `.claude/commands/frontend-development.md`, `.claude/commands/backend-development.md`.  
Agent reference: `.claude/agents/general/product-owner.md`.

---
name: validate-requirement
description: Validate whether a requirement document qualifies as one requirement before starting Clarify or other flow steps. Use when checking requirement definition (bounded, implementable, testable, traceable), split criteria (one user goal, size, dependencies), and when suggesting splits with folder structure RQ-XXX/RQ-XXX_01/, RQ-XXX/RQ-XXX_02/, etc.
---

# Validate Requirement

Use this skill when you need to **validate** whether the content of a requirement document qualifies as **one** requirement before proceeding (for example before step 1 Clarify in complete-development).

## Where Used

- **complete-development** (`.claude/commands/complete-development.md`): step 0 — Validate requirement
- *(futuros usos podem ser adicionados aqui)*

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id. Main agent executes the validation procedure (no dedicated sub-agent). |
| **In flow** | Step 0: main orchestrator executes this skill before step 1. The validation checks the **definition** of a requirement and **split criteria**; if the content does not qualify or should be split, report to the user with justification and a split suggestion. If the user agrees, the agent generates the folder structure and split documents; for each new requirement, ask permission before Clarify. |

Reference: `.claude/docs/requirements/README.md` defines the requirement definition and split criteria. Requirement documents typically live under `.claude/docs/requirements/{req-id}/` (e.g. `{req-id}.md` or `{req-id}-revised.md`).

## Requirement Definition (must hold for one requirement)

A **requirement** is a clearly scoped **value delivery** that:

1. **Can be implemented and tested independently** (with explicit dependencies on other requirements, when applicable).
2. **Corresponds to observable behavior** by the user or by the system (e.g. create task, edit task, list and filter tasks).
3. **Is traceable**: it is possible to point to code, PR, and tests that satisfy it.
4. **Is documented** in the project format (e.g. `{req-id}.md` in the requirement folder, with clarifications and `{req-id}-complete-requirement.md` when applicable).

**Summary**: The text must be a **bounded value delivery**, independently implementable and testable, with **observable and traceable** behavior.

**Validation**: If the text describes a broad topic (e.g. "task system") or multiple distinct deliveries with no clear boundary, it is **not** a single requirement and should be split or rewritten.

## Criteria for Splitting into Multiple Requirements

Verify whether the content **should be split** into two or more requirements. Use the following criteria. **Do not** use stack layer (backend vs frontend) as a split criterion; that belongs to architects in **frontend-development** / **backend-development** (step **4a**).

### 1. One user goal per requirement

- If the text describes **two or more distinct user goals** (e.g. "create task" and "send notification to creator"), consider **two or more requirements**.
- Each requirement should answer one unique question of the form: "Can the user do X?"

### 2. Testability and complete-development cycle

- If a single requirement would generate **too many scenarios** (e.g. `.feature`), a **very long test loop**, or **disproportionate security scope**, consider splitting into smaller requirements.
- A requirement should be sized so that the development and test cycle is feasible (e.g. within iteration limits).

### 3. Reuse and explicit dependency

- If part of the text is **foundational** (e.g. "list tasks") and another part is an **action on top of that base** (e.g. "filter tasks"), it may be one requirement ("list and filter") or two requirements with **explicit dependency** (e.g. RQ-003 list, RQ-004 filter; RQ-004 depends on RQ-003).
- When there is dependency between requirements, it must be recorded in **Dependencies** (or **System Dependencies**) in the requirement document.

### 4. Size and deliverability

- A requirement should be **deliverable** within one full cycle (clarify → specify → architect → develop → test → security) without becoming a "mega-requirement".
- If it is not possible to define **testable, bounded acceptance criteria** for the current text, consider splitting until each part has clear acceptance.

### What not to use as split criteria

- **Stack layers (backend vs frontend)**: layer split is an architect decision at the appropriate step. A requirement may span multiple layers; do **not** split by stack here.

## Anti-patterns (content does not qualify when)

- **Multiple deliveries in one RQ**: the content maps to multiple PRs or multiple independent features with no clear boundary.
- **Topic instead of delivery**: the text describes a topic/area (e.g. "improvements in the task module") instead of observable and testable behavior.
- **Refactor + feature mixed without focus**: the feature is not clearly described and testable; the requirement becomes a mix of "do several things".
- **No acceptance criteria**: it is not possible to list testable acceptance criteria for what is written.

## Process

1. **Locate the requirement document**: Identify the requirement document under `.claude/docs/requirements/{req-id}/` (e.g. `{req-id}.md` or `{req-id}-revised.md`). Use the requirement ID from context or command arguments.
2. **Read the content**: Read the requirement document and, when available, `.claude/docs/requirements/README.md` for the full definition and split criteria.
3. **Check the definition**: Verify that the content is a bounded value delivery, independently implementable and testable, with observable and traceable behavior. If it violates the definition (e.g. broad topic, multiple unbounded deliveries), treat as **does not qualify**.
4. **Check split criteria**: Verify whether the content should be split (one user goal per RQ; size/deliverability; explicit dependencies; testability). Do **not** use stack layer as split criterion.
5. **Decide outcome**:
   - **If valid (one requirement, no split needed)**: Proceed to the next step (e.g. step 1 Clarify). Do not stop.
   - **If it does not qualify or should be split**: Report to the user with **justification** and a **split suggestion** including the **folder structure** (see "Requirement split naming convention and folder structure" below): `RQ-XXX/RQ-XXX_01/RQ-XXX_01.md`, `RQ-XXX/RQ-XXX_02/RQ-XXX_02.md`, etc. **If the user agrees** to the split, the agent must **generate the structure**: create the subfolders and split the content into the appropriate requirement documents for each RQ-XXX_NN. Then proceed to step 6. **If the user does not agree**, stop the flow.
6. **When split structure is created** (by agent, after user agreement): For **each** resulting requirement (RQ-XXX_01, RQ-XXX_02, …), the agent must **ask the user for permission** before clarification (or before the next flow step). Only after user authorization execute that step for that requirement.

## Requirement Split Naming Convention and Folder Structure

When the content **must be split** into more than one requirement, suggest new identifiers and the folder structure as follows:

- **Identifiers**: `RQ-XXX_01`, `RQ-XXX_02`, …, `RQ-XXX_NN` (hyphen in base; underscore before sub-number; leading zero when needed; e.g. RQ-001_01, RQ-001_02).
- **Folder structure**: The parent folder keeps the original requirement ID. Each split requirement is a subfolder with its identifier, containing its requirement document:
  ```
  .claude/docs/requirements/
  └── RQ-001/
      ├── RQ-001_01/
      │   └── RQ-001_01.md
      ├── RQ-001_02/
      │   └── RQ-001_02.md
      └── RQ-001_0N/
          └── RQ-001_0N.md
  ```
- **Report to user**: When suggesting a split, explicitly indicate this structure. **If the user agrees**, the agent must **generate the structure**: create the subfolders and split the content into the appropriate requirement documents.
- **Permission**: Before proceeding with clarification (or the next step) for **each** split requirement, the agent must **ask the user for permission**. Only after user authorization should it execute that step for that requirement.

## Outcomes Summary

| Outcome | Action |
|--------|--------|
| **Valid** (one requirement, no split) | Proceed to the next step (e.g. step 1 Clarify). |
| **Does not qualify** or **should be split** | Report to the user with justification. Suggest split with folder structure `RQ-XXX/RQ-XXX_01/RQ-XXX_01.md`, `RQ-XXX/RQ-XXX_02/RQ-XXX_02.md`, etc. **If user agrees**: agent generates the structure (subfolders and split documents); for each new requirement, ask permission before proceeding with Clarify (or next step). **If user does not agree**: stop the flow. |

## Guidelines

- **Always validate before Clarify**: In flows that include "Validate requirement" (e.g. complete-development step 0), run this validation **before** step 1 (Clarify). Do not skip validation when the flow specifies it.
- **One requirement per document**: The validation answers: "Does this document describe exactly **one** requirement?" If the answer is no, stop and suggest split or rewrite.
- **No stack-based split**: Do not suggest splitting by backend vs frontend; that is an architect concern.
- **Explicit dependency**: When suggesting multiple requirements that depend on each other, indicate that dependencies must be recorded in the requirement documents (Dependencies / System Dependencies).
- **Folder structure**: When suggesting split, report the exact folder structure: `RQ-XXX/RQ-XXX_01/RQ-XXX_01.md`, `RQ-XXX/RQ-XXX_02/RQ-XXX_02.md`, etc.
- **Permission per split**: When split requirements are created (RQ-XXX_01, RQ-XXX_02, …), for **each one** ask user permission before running Clarify (or the next step); only after authorization execute that step for that requirement.
- **Agent generates structure**: When the user agrees to a suggested split, the agent must create the subfolders and split the requirement content into the appropriate documents; do not require the user to create the structure manually.

## Reference

- **Definition and split criteria**: `.claude/docs/requirements/README.md`
- **Flow that uses validation**: `.claude/commands/complete-development.md` (step 0 — Validate requirement). Before starting Clarify, the agent must validate using this skill; if the requirement does not qualify or should be split, report with split suggestion (format RQ_XXX_01, RQ_XXX_NN). If the user agrees, the agent generates the structure; otherwise, stop.

---
name: transaction-markdown
description: Generate Transaction files in Markdown with a functional, business-focused structure. Use when creating or updating Transaction documents (Title, Description, Source, Actions, Preconditions, Postconditions, Inputs, Outputs, Business Rules, Dependencies, CRUD). Exclude technical implementation details.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Transaction Markdown - Functional Structure

Use this skill when generating or updating **functional** Transaction documents in Markdown. Transactions describe *what* the system must do from a business and user perspective, not *how* it is implemented. Do not include technical details (e.g. APIs, databases, message queues, technologies).

## Transaction document location

Transactions **must** be placed under **`{{PATH_DOCS}}/1-analysis/Transactions`**. Use one folder per Transaction and one main Transaction file inside it:

- **Folder**: `{{PATH_DOCS}}/4-implementation/development/<prefix>-<ID>-<short-slug>/` (e.g. `{{PATH_DOCS}}/4-implementation/development/TX-3845-abm-positioning/`).
- **File**: Main Transaction file inside the folder (e.g. `TX-3845.md` or `<prefix>-<ID>.md`).
- **Short slug**: Lowercase, hyphenated, describing the Transaction scope.

## Required Sections (in order)

Generate a single Markdown file with the following sections. Use `##` for section titles. Keep numbering and structure consistent. Keep all content **functional**: business capabilities, user needs, and outcomes.

### 1. Transaction header and Title

```markdown
# Transaction: TX-<ID>

## Title

<One-line descriptive title>
```

### 2. Description

- **Description**: Clear explanation of what the system must do and why (context, current gap, goal). Use one or more paragraphs. No implementation or technology.

### 3. Source

- **Source**: Origin of the Transaction (e.g. stakeholder, ticket ID, regulation, or project name).

### 4. Actions

- **Actions**: Numbered list of concrete things the system must do from a user/business perspective. Each item: bold action label, then explanation.
- Format: `N. **Action Name**: The system must / should …`
- Use business verbs (e.g. Receive, Store, Provide, Allow, Enable), not technical ones (e.g. Persist, Ingest, Expose).

### 5. Preconditions

- **Preconditions**: Bullet list of business or user conditions that must hold before the Transaction can be satisfied (e.g. user is authorized, source data is available, prior step completed). No technical prerequisites (e.g. “system running”).

### 6. Postconditions

- **Postconditions**: Bullet list of outcomes after the Transaction is satisfied from a user/business perspective (e.g. data is available for query, user can perform X).

### 7. Inputs

- **Inputs**: Bullet list of inputs from a functional perspective. Use **Bold label** and short description (e.g. user data, requests, source information, policy or retention settings). No technical artifacts (e.g. streams, message formats, configuration files).

### 8. Outputs

- **Outputs**: Bullet list of outputs from a functional perspective. Use **Bold label** and short description (e.g. stored records, query results, reports, data available to users). No technical artifacts (e.g. API responses, payloads).

### 9. Business Rules

- **Business Rules**: Numbered rules with IDs. Format: `- **BR-XXX**: Rule text.`
- Rules should be **common and shared** across different Transactions (reusable invariants or constraints), not specific to a single Transaction. Use sequential IDs (BR-001, BR-002, …). Each rule states what must hold from a business perspective. No technical constraints (e.g. performance, storage tech).

### 10. Dependencies (functional)

- **Dependencies**: Bullet list of other capabilities or systems the Transaction depends on, described from a **business/functional** perspective (e.g. “Source of position data”, “Ability to query historical data”). Do not name technologies, storage, or infrastructure.

### 11. CRUD Operations

- **CRUD Operations**: Map to CREATE, READ, UPDATE, DELETE. One line per operation describing **what** is created/read/updated/deleted from a business perspective (e.g. “Position records”, “Retention settings”), not technical entities.

## Full Template (copy-paste skeleton)

```markdown
# Transaction: TX-<ID>

## Title

<One-line title>

## Description

<Paragraph(s): what, why, current gap, goal.>

## Source

<Origin of the Transaction.>

## Actions

1.  **<Action>**: <What the system must do.>
2.  **<Action>**: …
…

## Preconditions

- <Condition 1>
- <Condition 2>

## Postconditions

- <Outcome 1>
- <Outcome 2>

## Inputs

- **<Input name>**: <Description.>
- **<Input name>**: …

## Outputs

- **<Output name>**: <Description.>
- **<Output name>**: …

## Business Rules

- **BR-001**: <Rule text.>
- **BR-002**: …
…

## Dependencies

- **<Capability or system>**: <Functional role or description.>
- **<Capability or system>**: …

## CRUD Operations

- **CREATE**: <What is created.>
- **READ**: <What is read/queries.>
- **UPDATE**: <What is updated.>
- **DELETE**: <What is deleted/purged.>
```

## Guidelines

- **Functional only**: Describe *what* the system must do and *what* users or the business need. Do not describe *how* (technologies, APIs, databases, message formats, infrastructure).
- **ID and title**: Use the same Transaction ID in the heading and (if applicable) in the document name.
- **Title**: One line; no period at the end.
- **Actions**: Use business verbs (e.g. Receive, Store, Provide, Allow, Enable). Order logically (e.g. receive → store → make available).
- **Business Rules**: One rule per line; rules shall be common and shared by different Transactions (reusable across the project). Reference BR-XXX in other docs if needed. Rules are constraints or invariants from a business perspective.
- **CRUD**: Describe what business entities or capabilities are created/read/updated/deleted. Omit or state None where not applicable.
- **Dependencies**: Describe other systems or capabilities in functional terms (e.g. Source of X, Ability to Y), not as technical components.
- **Consistency**: Match tone and granularity to existing Transactions in `{{PATH_DOCS}}/1-analysis/Transactions`.

## Reference

The structure is a standard **functional** Transaction template (Title, Description, Source, Actions, Preconditions, Postconditions, Inputs, Outputs, Business Rules, Dependencies, CRUD Operations). Adapt section names or add/remove sections if the project uses a different template. Keep content free of technical implementation details.

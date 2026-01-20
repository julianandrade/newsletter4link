---
description: Create or update the feature specification from a natural language feature description.
---

**Path reference rule:** When you mention directories or files, provide either the absolute path or a path relative to the project root. Never refer to a folder by name alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

---

## Workflow Entry Point Context

**IMPORTANT**: This is the FIRST command in the spec-kitty feature workflow.

**What the creation script provides**:
When you run the creation script, it returns JSON with:
- **BRANCH_NAME**: Your feature branch name (e.g., "001-checkout-flow")
- **SPEC_FILE**: Absolute path to newly created spec.md
- **FEATURE_NUM**: Feature number (e.g., "001")
- **FRIENDLY_NAME**: Your feature title
- **WORKTREE_PATH**: Absolute path to your feature worktree

---

## Workflow Context

**This is the START** of the spec-kitty feature lifecycle.

**After this command**:
1. Navigate to your new worktree: `cd <WORKTREE_PATH>`
2. (Optional) Run `/spec-kitty.clarify` to resolve ambiguities
3. Run `/spec-kitty.plan` to create the implementation plan
4. Run `/spec-kitty.tasks` to break down into work packages
5. Run `/spec-kitty.implement` to write the code
6. Run `/spec-kitty.review` to get code feedback
7. Run `/spec-kitty.accept` to validate readiness
8. Run `/spec-kitty.merge` to integrate into main

---

## Discovery Gate (mandatory)

Before running any scripts or writing to disk you **must** conduct a structured discovery interview.

- **Scope proportionality (CRITICAL)**: Gauge the inherent complexity:
  - **Trivial/Test Features**: Ask 1-2 questions maximum
  - **Simple Features**: Ask 2-3 questions
  - **Complex Features**: Ask 3-5 questions
  - **Platform/Critical Features**: Full discovery with 5+ questions

- **First response rule**: Ask a single focused discovery question and end with `WAITING_FOR_DISCOVERY_INPUT`

- **Conversational cadence**: After each user reply, decide if you have ENOUGH context

Discovery requirements:
1. Maintain a **Discovery Questions** table internally (do **not** render to user)
2. When sufficient context gathered, paraphrase into an **Intent Summary** and confirm
3. If user explicitly asks to skip questions, acknowledge and proceed

## Outline

### 0. Generate a Friendly Feature Title

Summarize the agreed intent into a short, descriptive title (aim for ≤7 words).

### 1. Check discovery status
- If discovery questions remain unanswered, stay in the one-question loop
- Only proceed once every discovery question has an explicit answer

### 2. Run Feature Creation Script
When discovery is complete, run:
```bash
.kittify/scripts/bash/create-new-feature.sh --json --feature-name "<Friendly Title>" "$ARGUMENTS"
```

### 3. Load Template
Load `.kittify/templates/spec-template.md` to understand required sections.

### 4. Execute Specification Generation
Using discovery answers as source of truth:
1. Identify: actors, actions, data, constraints, motivations, success metrics
2. Fill User Scenarios & Testing section
3. Generate Functional Requirements (each must be testable)
4. Define Success Criteria (measurable, technology-agnostic)
5. Identify Key Entities (if data involved)

### 5. Write Specification
Write the specification to SPEC_FILE using the template structure.

### 6. Validate and Report
Report completion with branch name, spec file path, and readiness for next phase.

## General Guidelines

- Focus on **WHAT** users need and **WHY**
- Avoid HOW to implement (no tech stack, APIs, code structure)
- Written for business stakeholders, not developers

### Success Criteria Guidelines

Success criteria must be:
1. **Measurable**: Include specific metrics
2. **Technology-agnostic**: No mention of frameworks, languages, databases
3. **User-focused**: Describe outcomes from user/business perspective
4. **Verifiable**: Can be tested without knowing implementation details

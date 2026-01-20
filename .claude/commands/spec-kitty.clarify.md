---
description: Resolve specification ambiguities through structured clarification.
---

**Path reference rule:** When you mention directories or files, provide either the absolute path or a path relative to the project root.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Location Pre-flight Check

Before proceeding, verify you are in the correct working directory:

```bash
git branch --show-current
```

**Expected output:** A feature branch like `001-feature-name`
**If you see `main`:** You are in the wrong location!

## Purpose

This command helps resolve ambiguities in feature specifications before planning begins. Use it when:
- The spec.md contains `[NEEDS CLARIFICATION]` markers
- Requirements are unclear or contradictory
- Stakeholder input is needed on specific decisions

## Workflow

1. **Load specification**: Read the spec.md file for the current feature
2. **Identify clarifications**: Find all `[NEEDS CLARIFICATION: ...]` markers
3. **Structure questions**: For each clarification:
   - Extract the specific question
   - Provide context from the spec
   - Offer potential options with implications
4. **Gather answers**: Present questions to user one at a time
5. **Update specification**: Replace markers with confirmed answers
6. **Validate**: Re-check spec for remaining ambiguities

## Question Format

```
Question [N]: [Topic]
Context: [Quote relevant spec section]
Need: [Specific question]
Options:
  (A) [First option - implications]
  (B) [Second option - implications]
  (C) [Third option - implications]
  (D) Custom (describe your own answer)

Reply with a letter or custom answer.
```

## Completion

When all clarifications are resolved:
1. Update spec.md with final answers
2. Remove all `[NEEDS CLARIFICATION]` markers
3. Report readiness for `/spec-kitty.plan`

## Next Command

After clarifications are resolved: `/spec-kitty.plan`

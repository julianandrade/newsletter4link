---
description: Generate or validate quality checklists for feature development.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

Create and validate quality checklists for different phases of feature development. Checklists ensure consistent quality and completeness across all features.

## Checklist Types

### 1. Specification Checklist (`requirements.md`)
Validates specification quality before planning:
- Content quality (no implementation details)
- Requirement completeness
- Success criteria measurability
- Feature readiness

### 2. Implementation Checklist (`implementation.md`)
Validates code quality during development:
- Code follows project conventions
- Tests are written and passing
- Error handling is complete
- Loading/error states implemented

### 3. Security Checklist (`security.md`)
Validates security requirements:
- Access control policies defined
- Input validation implemented
- No hardcoded secrets
- Authentication required where needed

### 4. Deployment Checklist (`deployment.md`)
Validates deployment readiness:
- All tests passing
- Build succeeds
- Migrations tested
- Rollback strategy documented

## Creating Checklists

Checklists are stored in `FEATURE_DIR/checklists/`:

```markdown
# [Checklist Type] Checklist: [Feature Name]

**Purpose**: [What this checklist validates]
**Created**: [Date]
**Feature**: [Link to spec.md]

## [Category 1]

- [ ] Item 1 description
- [ ] Item 2 description

## [Category 2]

- [ ] Item 3 description
- [ ] Item 4 description

## Notes

- Items marked incomplete require action before proceeding
```

## Validation

To validate a checklist:

1. Read the checklist file
2. Count completed vs incomplete items
3. Report status:
   - **PASS**: All items checked
   - **FAIL**: Some items unchecked

## Integration with Workflow

- `/spec-kitty.specify` creates `requirements.md` checklist
- `/spec-kitty.review` validates against implementation checklist
- `/spec-kitty.accept` validates all checklists before acceptance

## Example Output

```
Checklist Status: requirements.md

| Category        | Total | Complete | Status |
|-----------------|-------|----------|--------|
| Content Quality | 4     | 4        | ✓ PASS |
| Requirements    | 8     | 7        | ✗ FAIL |
| Feature Ready   | 4     | 4        | ✓ PASS |

Overall: 1 category incomplete
Action: Review "Requirements" category before proceeding
```

---
description: Analyze feature artifacts for consistency and completeness.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

Perform cross-artifact consistency checking to ensure all feature documents align:
- spec.md ↔ plan.md alignment
- plan.md ↔ tasks.md coverage
- tasks.md ↔ implementation completeness
- Constitution compliance

## Analysis Checks

### 1. Specification Consistency
- All user stories in spec.md have corresponding tasks
- Success criteria are measurable and tracked
- No orphaned requirements

### 2. Plan Coverage
- Technical decisions in plan.md address all requirements
- Architecture supports all user stories
- Dependencies are identified and tracked

### 3. Task Completeness
- All plan phases have corresponding work packages
- Each work package has clear acceptance criteria
- Dependencies between tasks are documented

### 4. Implementation Alignment
- Code implements all tasks
- Tests cover acceptance criteria
- No scope creep (features not in spec)

### 5. Constitutional Compliance
- Code follows all constitutional principles
- No violations documented and unaddressed

## Running Analysis

```bash
# Analyze current feature
/spec-kitty.analyze

# Analyze specific feature
/spec-kitty.analyze 001-user-auth

# Focus on specific check
/spec-kitty.analyze --check plan-coverage
```

## Output Format

```
Feature Analysis: 001-user-auth

Specification Consistency
├── User stories: 5/5 covered
├── Success criteria: 4/4 measurable
└── Status: ✅ PASS

Plan Coverage
├── Requirements addressed: 100%
├── Architecture complete: Yes
└── Status: ✅ PASS

Task Completeness
├── Work packages: 6 created
├── Acceptance criteria: 6/6 defined
├── Dependencies: All documented
└── Status: ✅ PASS

Implementation Alignment
├── Tasks completed: 4/6
├── Tests passing: Yes
├── Scope: No creep detected
└── Status: 🔶 IN PROGRESS

Constitutional Compliance
├── Violations: 0
├── Warnings: 1
└── Status: ✅ PASS (with warnings)

Overall: Feature is 67% complete, on track
```

## Integration with Workflow

- Run after `/spec-kitty.tasks` to verify planning completeness
- Run during `/spec-kitty.implement` to check progress
- Run before `/spec-kitty.accept` to ensure readiness

## Common Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| Orphaned requirement | Task not created | Add task in tasks.md |
| Missing test | Acceptance criteria unclear | Clarify in spec.md |
| Scope creep | Feature not in spec | Remove or add to spec |
| Constitutional violation | Code doesn't follow principles | Refactor code |

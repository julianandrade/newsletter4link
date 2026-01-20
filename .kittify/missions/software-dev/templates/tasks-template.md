# Tasks: [FEATURE NAME]

**Feature**: [###-feature-slug]
**Created**: [DATE]
**Status**: In Progress

---

## Overview

This document breaks down the implementation plan into actionable work packages.

**Total Work Packages**: [N]
**Estimated Effort**: [Brief estimate]

---

## Work Package Summary

| ID | Title | Status | Dependencies |
|----|-------|--------|--------------|
| WP01 | [Title] | ⬜ Planned | None |
| WP02 | [Title] | ⬜ Planned | WP01 |
| WP03 | [Title] | ⬜ Planned | WP01 |

**Status Legend**: ⬜ Planned | 🔄 In Progress | ✅ Complete | ⏸️ Blocked

---

## Work Packages

### WP01: [Setup/Foundation]

**Priority**: High
**Dependencies**: None
**Parallel**: Can start immediately

**Objective**: [What this work package accomplishes]

**Subtasks**:
- [ ] T001: [Subtask description]
- [ ] T002: [Subtask description]
- [ ] T003: [Subtask description]

**Acceptance Criteria**:
- [Criterion 1]
- [Criterion 2]

**Prompt File**: `tasks/WP01-setup.md`

---

### WP02: [Core Feature 1]

**Priority**: High
**Dependencies**: WP01
**Parallel**: Can run with WP03 [P]

**Objective**: [What this work package accomplishes]

**Subtasks**:
- [ ] T004: [Subtask description]
- [ ] T005: [Subtask description]
- [ ] T006: [Subtask description]

**Acceptance Criteria**:
- [Criterion 1]
- [Criterion 2]

**Prompt File**: `tasks/WP02-core-feature.md`

---

### WP03: [Core Feature 2]

**Priority**: High
**Dependencies**: WP01
**Parallel**: Can run with WP02 [P]

**Objective**: [What this work package accomplishes]

**Subtasks**:
- [ ] T007: [Subtask description]
- [ ] T008: [Subtask description]

**Acceptance Criteria**:
- [Criterion 1]
- [Criterion 2]

**Prompt File**: `tasks/WP03-core-feature-2.md`

---

### WP04: [Integration/Polish]

**Priority**: Medium
**Dependencies**: WP02, WP03
**Parallel**: Sequential

**Objective**: [What this work package accomplishes]

**Subtasks**:
- [ ] T009: [Subtask description]
- [ ] T010: [Subtask description]

**Acceptance Criteria**:
- [Criterion 1]
- [Criterion 2]

**Prompt File**: `tasks/WP04-integration.md`

---

## Execution Order

```
WP01 (Setup)
    ├─→ WP02 (Feature 1) ─┬─→ WP04 (Integration)
    └─→ WP03 (Feature 2) ─┘
```

---

## Notes

- Tasks marked [P] can be executed in parallel
- Complete WP01 before starting any other work package
- Review each work package before moving to the next phase

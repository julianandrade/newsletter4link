# Implementation Plan: [FEATURE NAME]

## Technical Context

### Technology Stack
<!-- List the technologies this feature will use -->
- **Frontend**: <!-- FRONTEND_TECH -->
- **Backend**: <!-- BACKEND_TECH -->
- **Database**: <!-- DATABASE_TECH -->
- **Other**: <!-- OTHER_TECH -->

### Dependencies
- [Library/package dependencies]
- [Service dependencies]

---

## Constitution Check

Before proceeding, verify alignment with project constitution:

- [ ] **Separation of Concerns**: Business logic will be in [location]
- [ ] **Test-First**: Test strategy defined below
- [ ] **Security-First**: Access control approach defined
- [ ] **Error Handling**: Loading/error states planned
- [ ] **Simplicity**: No unnecessary complexity

---

## Project Structure

### Files to Create
```
<!-- FILE_STRUCTURE -->
src/
├── [new-files]
└── [new-directories]
```

### Files to Modify
- `path/to/file.ext` - [What changes]
- `path/to/file2.ext` - [What changes]

---

## Architecture

### Data Flow
```
[User Action] → [Component] → [Business Logic] → [Data Layer] → [Database]
```

### Key Decisions

1. **Decision**: [What was decided]
   - **Rationale**: [Why this approach]
   - **Alternatives considered**: [Other options]

---

## Implementation Phases

### Phase 1: Foundation
- Set up data models
- Create base infrastructure
- Write initial tests

### Phase 2: Core Features
- Implement main functionality
- Add business logic
- Integrate with data layer

### Phase 3: Polish
- Add error handling
- Implement loading states
- Add edge case handling

---

## Test Strategy

### Unit Tests
- [Module/function to test]
- [Expected coverage areas]

### Integration Tests
- [Integration points to test]

### E2E Tests (if applicable)
- [User flows to test]

---

## Security Considerations

- **Authentication**: [How auth is handled]
- **Authorization**: [Access control approach]
- **Data Validation**: [Input validation approach]

---

## Parallel Work Analysis

### Can be parallelized
- [Task A] and [Task B] - independent files
- [Task C] and [Task D] - no dependencies

### Must be sequential
- [Task E] must complete before [Task F]
- [Task G] depends on [Task H]

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk 1] | [High/Medium/Low] | [How to mitigate] |
| [Risk 2] | [High/Medium/Low] | [How to mitigate] |

---

## Open Questions

- [ ] [Question that needs answering before implementation]

# Single-Agent Development Workflow

This is a simplified version of the spec-kitty workflow for single Claude instance development.

## Overview

When working alone (single Claude session), you can use a streamlined workflow:

```
SPECIFY → PLAN → IMPLEMENT → VERIFY
```

---

## Quick Workflow

### 1. Start Feature

```
/spec-kitty.specify <feature-name>
```

Complete the specification interview. Create `kitty-specs/<feature>/spec.md`.

### 2. Plan Implementation

```
/spec-kitty.plan
```

Answer the "plan interrogation" questions. Create `kitty-specs/<feature>/plan.md`.

### 3. Generate Tasks

```
/spec-kitty.tasks
```

Create work packages in `kitty-specs/<feature>/tasks.md`.

### 4. Implement

```
/spec-kitty.implement
```

Work through tasks sequentially, marking each complete as you go.

### 5. Verify & Merge

```
/spec-kitty.accept
/spec-kitty.merge
```

Run acceptance checks and merge when ready.

---

## Simplified Task Management

For single-agent work, you can use a simpler task tracking approach:

### In tasks.md

```markdown
# Tasks

## Planned
- [ ] Task 1 description
- [ ] Task 2 description

## In Progress
- [ ] Task 3 description (started)

## Done
- [x] Task 4 description
```

### Moving Tasks

Instead of full lane management, just:
1. Move the task line between sections
2. Update the checkbox when complete

---

## When to Use Full Workflow

Use the full multi-agent workflow when:
- Multiple Claude sessions will work in parallel
- The feature is large (10+ tasks)
- Coordination with other developers is needed
- Formal review process is required

Use the simplified workflow when:
- Single Claude session
- Smaller features (< 10 tasks)
- Rapid iteration needed
- Solo development

---

## Key Commands (Quick Reference)

| Phase | Command | Purpose |
|-------|---------|---------|
| Start | `/spec-kitty.specify` | Create specification |
| Plan | `/spec-kitty.plan` | Plan implementation |
| Tasks | `/spec-kitty.tasks` | Generate work packages |
| Build | `/spec-kitty.implement` | Execute tasks |
| Check | `/spec-kitty.accept` | Verify completion |
| Ship | `/spec-kitty.merge` | Merge feature |

### Utility Commands

| Command | Purpose |
|---------|---------|
| `/spec-kitty.dashboard` | View status |
| `/spec-kitty.constitution` | Check principles |
| `/spec-kitty.clarify` | Resolve ambiguities |

---

## Skipping Steps

In urgent situations, you can skip steps:

### Minimal Workflow (Bug Fixes)

```
1. Create branch
2. Fix bug
3. Test
4. Merge
```

No spec-kitty artifacts needed for simple bug fixes.

### Reduced Workflow (Small Features)

```
1. /spec-kitty.specify (brief)
2. Implement directly (skip formal planning)
3. /spec-kitty.accept
4. /spec-kitty.merge
```

### When NOT to Skip

Never skip specification for:
- New features with user-facing changes
- Security-related changes
- Database schema changes
- API changes
- Anything affecting other systems

---

## Tips for Solo Development

1. **Still use specs** - Even brief specs help organize thinking
2. **Check constitution** - Before making architectural decisions
3. **Write tests** - Don't skip tests even when working alone
4. **Update CLAUDE.md** - Keep context current
5. **Commit frequently** - Small, atomic commits
6. **Review your own code** - Run `/spec-kitty.review` on yourself

---

## Directory Structure (Minimal)

For simple features, you may only need:

```
kitty-specs/
└── my-feature/
    └── spec.md          # Specification (required)
```

For moderate features:

```
kitty-specs/
└── my-feature/
    ├── spec.md          # Specification
    └── tasks.md         # Simple task list
```

For complex features, use full structure:

```
kitty-specs/
└── my-feature/
    ├── spec.md          # Specification
    ├── plan.md          # Implementation plan
    └── tasks.md         # Work packages
```

---

## Example: Quick Feature

```bash
# 1. Start
> /spec-kitty.specify add-logout-button

# 2. Answer specification questions...
# Creates: kitty-specs/add-logout-button/spec.md

# 3. Plan (can be brief for small features)
> /spec-kitty.plan
# Creates: kitty-specs/add-logout-button/plan.md

# 4. Implement
> /spec-kitty.implement
# Work through implementation...

# 5. Verify
> /spec-kitty.accept
# All checks pass!

# 6. Merge
> /spec-kitty.merge --push
# Feature complete!
```

Total time: Much faster than full workflow while maintaining traceability.

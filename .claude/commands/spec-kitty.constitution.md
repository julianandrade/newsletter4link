---
description: Reference and validate against project constitutional principles.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

The constitution defines non-negotiable principles for the project. This command helps:
- Reference constitutional principles during development
- Validate code/designs against the constitution
- Identify constitutional violations before they ship

## Constitution Location

The project constitution is stored at: `.kittify/memory/constitution.md`

## Core Principles (Template)

The default constitution includes these principles:

### I. Separation of Concerns
Keep business logic separate from presentation. Each layer has a single responsibility.

### II. Test-First Development
Write tests alongside (or before) implementation. Tests guide design and prevent regressions.

### III. Security-First Data Access
Always consider access control. Never expose data without proper authorization checks.

### IV. Explicit Error Handling
All async operations must handle loading and error states. Users should never see broken UI.

### V. Simplicity & YAGNI
Don't over-engineer. Build what's needed now, not what might be needed later.

## Validation

When validating against the constitution:

1. **Read the code or design** being validated
2. **For each principle**, check:
   - Does this code follow the principle?
   - Are there any violations?
   - What would need to change to comply?
3. **Report findings**:
   - ✅ Compliant principles
   - ❌ Violations with specific issues
   - 🔶 Warnings (minor concerns)

## Integration with Workflow

- `/spec-kitty.plan` includes Constitution Check section
- `/spec-kitty.review` validates implementation against constitution
- `/spec-kitty.accept` requires all constitutional checks to pass

## Example Validation Output

```
Constitution Validation: 001-user-auth

✅ I. Separation of Concerns
   Auth logic in useAuth hook, UI in AuthForm component

✅ II. Test-First Development
   Unit tests exist for useAuth hook

❌ III. Security-First Data Access
   VIOLATION: User role check happens client-side only
   FIX: Add server-side role validation in RLS policy

✅ IV. Explicit Error Handling
   Loading and error states handled in useAuth

✅ V. Simplicity & YAGNI
   No unnecessary abstractions

Result: 1 violation found - address before proceeding
```

## Customizing the Constitution

Edit `.kittify/memory/constitution.md` to add project-specific principles. Each principle should:
- Have a clear, memorable name
- Be objectively testable
- Include examples of compliance and violation

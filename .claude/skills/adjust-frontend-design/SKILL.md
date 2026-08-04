---
name: adjust-frontend-design
description: Adjust `{req-id}-frontend-tech-spec.md` with layout and design guidance before developer implements. Use when executing step 4c in frontend-development or when asked to refine tech-spec with design/layout constraints.
# preferred_agent: ui-ux-designer
---

# Adjust Frontend Design (Tech-spec Refinement)

Use this skill when you need to **adjust `{req-id}-frontend-tech-spec.md` with layout and design guidance** before the developer implements. This corresponds to **step 4c** in **`/frontend-development`**. **Run only when there is frontend scope** (frontend-architect produced `{req-id}-frontend-tech-spec.md`).

## Where Used

- **frontend-development** (`.claude/commands/frontend-development.md`): step **4c** — UI/UX Designer (frontend only)
- When asked to refine tech-spec with design or layout constraints before implementation

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with req-id and paths. Prefer launching **ui-ux-designer** (`.claude/agents/frontend/ui-ux-designer.md`) in Phase 3 mode (tech-spec refinement). If unavailable, main agent executes the procedure. |
| **In flow** | Step 4c invokes ui-ux-designer in Phase 3 mode; agent follows this skill. |

## Purpose

- **Tech-spec refinement**: Adjust `{req-id}-frontend-tech-spec.md` with layout, fonts, buttons, colors, and design constraints.
- **Priority order**:
  1. If pre-defined layout exists for the functionality → adjust tech-spec to that layout
  2. Otherwise, if similar pages exist in the app → use their patterns (fonts, buttons, colors)
  3. Otherwise → ensure the app is "reasonably beautiful" (consistent, accessible, pleasant)

## When to Use

- Executing **step 4c** in **frontend-development**, after step **4b** (or **4a** if `--no-security`), before Track Test.
- Only when `{req-id}-technical-solution-requirement.md` indicates frontend scope and `{req-id}-frontend-tech-spec.md` exists.

## Inputs

- **Frontend tech-spec**: `{req-id}-frontend-tech-spec.md` (or `tech-spec.md` with frontend sections) in `.claude/docs/requirements/{req-id-name}/`.
- **Complete requirement**: `{req-id}-complete-requirement.md`.
- **Application structure**: Existing pages, components, design system (if any), for pattern extraction.

## Process

1. **Resolve paths**: Get `{req-id}` and `{req-id-name}`. Requirement folder: `.claude/docs/requirements/{req-id-name}/`.
2. **Read `{req-id}-frontend-tech-spec.md`**: Understand the plan produced by frontend-architect.
3. **Check for pre-defined layout**: Look for layout specs, mockups, or design references for this functionality.
4. **Check existing pages**: If no pre-defined layout, inspect similar pages in the app for fonts, buttons, colors, spacing.
5. **Invoke ui-ux-designer** (Phase 3 mode): Pass tech-spec, complete-requirement, and findings.
6. **Output**: Updated `{req-id}-frontend-tech-spec.md` with added or refined layout/design section for frontend-engineer.

## Outputs

- **Updated `{req-id}-frontend-tech-spec.md`**: Technical specification with layout and design guidance.
- **Location**: `.claude/docs/requirements/{req-id-name}/` (same file, in place).
- **Binding for implementation**: The layout and design guidance produced in this skill is **mandatory** for the frontend-engineer. The developer must implement it fully—always, without shortcuts or approximations. This is enforced by **frontend-development** step **6**.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` — step **4c** **UI/UX Designer**.
- **Agent**: `.claude/agents/frontend/ui-ux-designer.md` (Phase 3 mode).
- **Next step**: Track Test (5, 5b, 5c, 5d).

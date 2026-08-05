---
name: adjust-frontend-design
description: Adjust `{tx-id}-frontend-tech-spec.md` with layout and design guidance before developer implements. Use when executing step 4c in frontend-development or when asked to refine tech-spec with design/layout constraints.
# preferred_agent: ui-ux-designer
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Adjust Frontend Design (Tech-spec Refinement)

Use this skill when you need to **adjust `{tx-id}-frontend-tech-spec.md` with layout and design guidance** before the developer implements. This corresponds to **step 4c** in **`/frontend-development`**. **Run only when there is frontend scope** (frontend-architect produced `{tx-id}-frontend-tech-spec.md`).

## Where Used

- **frontend-development** (`.claude/commands/frontend-development.md`): step **4c** — UI/UX Designer (frontend only)
- When asked to refine tech-spec with design or layout constraints before implementation

## Execution

| Context | How to run |
|---------|------------|
| **Direct** (manual) | Invoke with tx-id and paths. Prefer launching **ui-ux-designer** (`.claude/agents/frontend/ui-ux-designer.md`) in Phase 3 mode (tech-spec refinement). If unavailable, main agent executes the procedure. |
| **In flow** | Step 4c invokes ui-ux-designer in Phase 3 mode; agent follows this skill. |

## Purpose

- **Tech-spec refinement**: Adjust `{tx-id}-frontend-tech-spec.md` with layout, fonts, buttons, colors, and design constraints.
- **Priority order**:
  1. If pre-defined layout exists for the functionality → adjust tech-spec to that layout
  2. Otherwise, if similar pages exist in the app → use their patterns (fonts, buttons, colors)
  3. Otherwise → ensure the app is "reasonably beautiful" (consistent, accessible, pleasant)

## When to Use

- Executing **step 4c** in **frontend-development**, after step **4b** (or **4a** if `features.security` is `false`), before Track Test.
- Only when `{tx-id}-technical-solution-transaction.md` indicates frontend scope and `{tx-id}-frontend-tech-spec.md` exists.

## Inputs

- **Frontend tech-spec**: `{tx-id}-frontend-tech-spec.md` (or `tech-spec.md` with frontend sections) in `{{PATH_DOCS}}/transactions/{tx-id-name}/`.
- **Complete Transaction**: `{tx-id}-complete-transaction.md`.
- **Application structure**: Existing pages, components, design system (if any), for pattern extraction.

## Process

1. **Resolve paths**: Get `{tx-id}` and `{tx-id-name}`. Transaction folder: `{{PATH_DOCS}}/transactions/{tx-id-name}/`.
2. **Read `{tx-id}-frontend-tech-spec.md`**: Understand the plan produced by frontend-architect.
3. **Check for existing mockups**: Check `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/html/` for existing HTML files.
   - **If mockups exist** → use them as the design reference. Do **NOT** generate new mockups. Pass the existing mockup paths to ui-ux-designer so it refines the tech-spec to match the existing visual design.
     - Also check `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/components/`: if it exists, pass those paths too — they document which design system components map to each screen element.
     - **Design-system gate**: if the project uses a design system (`{{PATH_DOCS}}/3-design/design-system/` exists or a design system package is in `package.json`) but `components/` is absent → warn: "Component reference files are missing for {tx-id}. Re-run `/generate-mockup` to regenerate them before continuing." Do not proceed until the user confirms.
   - **If no mockups exist** → ask the user: "No mockups found for {tx-id}. Should I generate mockups first (via `/generate-mockup`) before refining the tech-spec, or proceed without them?" Wait for the user's answer before continuing.
4. **Check existing pages**: If no mockups and user says proceed without them, inspect similar pages in the app for fonts, buttons, colors, spacing.
5. **Invoke ui-ux-designer** (Phase 3 mode): Pass tech-spec, complete-transaction, mockup paths (if any), and findings.
6. **Output**: Updated `{tx-id}-frontend-tech-spec.md` with added or refined layout/design section for frontend-engineer.

## Outputs

- **Updated `{tx-id}-frontend-tech-spec.md`**: Technical specification with layout and design guidance.
- **Location**: `{{PATH_DOCS}}/transactions/{tx-id-name}/` (same file, in place).
- **Binding for implementation**: The layout and design guidance produced in this skill is **mandatory** for the frontend-engineer. The developer must implement it fully—always, without shortcuts or approximations. This is enforced by **frontend-development** step **6**.

## Reference

- **Flow step**: `.claude/commands/frontend-development.md` — step **4c** **UI/UX Designer**.
- **Agent**: `.claude/agents/frontend/ui-ux-designer.md` (Phase 3 mode).
- **Next step**: Track Test (5, 5b, 5c, 5d).

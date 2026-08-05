---
name: generate-baseline
description: Guidelines for creating baselines (empty projects) in a given technology. Use when the user asks to create a baseline, empty project, project scaffold, or bootstrap for a technology (e.g. React, .NET). The agent must consult the corresponding technology skill in .claude/skills/ and follow its bootstrap/setup instructions.
---

# Generate Baseline

A **baseline** is an empty project in a specific technology, created according to the conventions and bootstrap instructions defined in the corresponding skill in `.claude/skills/`.

## When to Use This Skill

- User asks to create a **baseline**, **empty project**, **project scaffold**, or **bootstrap** for a technology.
- User says "create a new React project", "generate .NET baseline", "empty project in [technology]".
- Any request that implies generating a project from scratch in a stack that has a skill in this repo.

## Workflow

1. **Identify the technology** (e.g. React, .NET, Dotnet, OpenAPI, Java/Spring).
2. **Map to the skill** in `.claude/skills/`:
   - React / React 19 → `.claude/skills/frontend/react/SKILL.md`
   - .NET / Dotnet / ASP.NET Core → `.claude/skills/backend/dotnet/SKILL.md`
   - OpenAPI / API spec → `.claude/skills/backend/openapi/SKILL.md`
   - PostgreSQL is infrastructure/config, not a “project baseline”; use when the baseline includes DB setup.
3. **If no skill exists** for that technology, ask the user how to proceed (e.g. which technology to use or whether they can provide instructions). Otherwise **read the corresponding skill** and locate:
   - Section **"Project Bootstrap & Setup"** or **"Bootstrap Commands"** (e.g. React: CLI commands, folder structure, scripts).
   - Section **"Required Folder Structure"** or **"Clean Architecture Structure"** (e.g. .NET, Java).
   - Any **required config files**, **scripts**, and **dependencies** listed as REQUIRED.
4. **Generate the baseline** strictly following those instructions: same commands, same structure, same required files and scripts. Do not invent alternatives; use the skill as the single source of truth.
5. **Replace placeholders** (e.g. `<projectName>`, `<your-project-name>`) with the actual project name provided by the user or inferred from context.
6. **Verify the baseline** by running the technology-appropriate build/check command (see table below). Capture the full output.
7. **If verification fails**, diagnose the error from the output, apply the minimal fix, and re-run verification. Repeat until verification passes. Do **not** declare the task done while verification is failing.

## Verification Commands

Run the appropriate command after generating the baseline. The skill is only complete when this command exits with code 0.

| Technology    | Verification command                              |
|---------------|---------------------------------------------------|
| React         | `pnpm install && pnpm build`                      |
| .NET / Dotnet | `dotnet build`                                    |
| OpenAPI       | `npx @redocly/cli lint <spec-file>`               |

If the technology has no entry in this table, pick the most idiomatic build/lint command from the corresponding skill.

## Fix Loop

When verification fails:

1. Read the full error output.
2. Identify the root cause (missing dependency, wrong config value, import error, etc.).
3. Apply the minimal fix directly in the generated files.
4. Re-run the verification command.
5. Go back to step 1 if it still fails.
6. Only exit when the command succeeds.

Do **not** ask the user for help on each failure — iterate autonomously until it passes or you exhaust reasonable fix attempts (max ~5 fix rounds). If still failing after that, report what was tried and the remaining error.

## Rules

- **Single source of truth**: The technology skill (e.g. `react/SKILL.md`, `dotnet/SKILL.md`) defines how to create the baseline. This skill only defines the process (consult that skill and follow it).
- **No ad‑hoc baselines**: Do not create a baseline from generic knowledge; always open and follow the project’s skill.
- **Full compliance**: Apply all REQUIRED items from the skill (dependencies, folder structure, config files, scripts).
- **Verified exit only**: The skill is not complete until the verification command passes. A baseline that does not build is not a baseline.
- If the chosen technology has **no corresponding skill** under `.claude/skills/`, do not invent a baseline: **ask the user how to proceed** (e.g. which technology or skill to use, or whether they can provide bootstrap instructions).

## Technology → Skill Quick Reference

| Technology        | Skill path                                              |
|-------------------|---------------------------------------------------------|
| React             | `.claude/skills/frontend/react/SKILL.md`                |
| .NET / Dotnet     | `.claude/skills/backend/dotnet/SKILL.md`                |
| OpenAPI           | `.claude/skills/backend/openapi/SKILL.md`               |
| PostgreSQL        | Use with backend baselines; `.claude/skills/backend/postgresql/SKILL.md` for DB details |

## Example (React)

User: "Create a React baseline for the app."

1. Identify: React → skill `react`.
2. Read `.claude/skills/frontend/react/SKILL.md`.
3. Use the **Bootstrap Commands** (e.g. `pnpm create vite <projectName> --template react-ts`), then add React Router, Tailwind CSS, Vitest, Playwright, and other dependencies as per the skill.
4. Create the **Required Folder Structure** (e.g. `core/`, `shared/`, `features/`, `layout/`, required files).
5. Add **Required package.json scripts** and **vite.config.ts** as specified.
6. Replace `<projectName>` with the actual name.
7. Run `pnpm install && pnpm build`. If it fails, fix the error and re-run until it passes.

Result: Baseline matches the React skill exactly, builds successfully, and no extra or missing REQUIRED pieces.

---
name: generate-baseline
description: Guidelines for creating baselines (empty projects) in a given technology. Use when the user asks to create a baseline, empty project, project scaffold, or bootstrap for a technology (e.g. Angular, .NET). The agent must consult the corresponding technology skill in .claude/skills/ and follow its bootstrap/setup instructions.
---

# Generate Baseline

A **baseline** is an empty project in a specific technology, created according to the conventions and bootstrap instructions defined in the corresponding skill in `.claude/skills/`.

## When to Use This Skill

- User asks to create a **baseline**, **empty project**, **project scaffold**, or **bootstrap** for a technology.
- User says "create a new Angular project", "generate .NET baseline", "empty project in [technology]".
- Any request that implies generating a project from scratch in a stack that has a skill in this repo.

## Workflow

1. **Identify the technology** (e.g. Angular, .NET, Dotnet, OpenAPI, Java/Spring).
2. **Map to the skill** in `.claude/skills/`:
   - Angular / Angular 18 → `.claude/skills/angular/SKILL.md`
   - .NET / Dotnet / ASP.NET Core → `.claude/skills/dotnet/SKILL.md`
   - OpenAPI / API spec → `.claude/skills/openapi/SKILL.md`
   - Java / Spring Boot / Microservices → `.claude/skills/java-spring-microservices/SKILL.md`
   - PostgreSQL is infrastructure/config, not a “project baseline”; use when the baseline includes DB setup.
3. **If no skill exists** for that technology, ask the user how to proceed (e.g. which technology to use or whether they can provide instructions). Otherwise **read the corresponding skill** and locate:
   - Section **"Project Bootstrap & Setup"** or **"Bootstrap Commands"** (e.g. Angular: CLI commands, folder structure, scripts).
   - Section **"Required Folder Structure"** or **"Clean Architecture Structure"** (e.g. .NET, Java).
   - Any **required config files**, **scripts**, and **dependencies** listed as REQUIRED.
4. **Generate the baseline** strictly following those instructions: same commands, same structure, same required files and scripts. Do not invent alternatives; use the skill as the single source of truth.
5. **Replace placeholders** (e.g. `<projectName>`, `<your-project-name>`) with the actual project name provided by the user or inferred from context.

## Rules

- **Single source of truth**: The technology skill (e.g. `angular/SKILL.md`, `dotnet/SKILL.md`) defines how to create the baseline. This skill only defines the process (consult that skill and follow it).
- **No ad‑hoc baselines**: Do not create a baseline from generic knowledge; always open and follow the project’s skill.
- **Full compliance**: Apply all REQUIRED items from the skill (dependencies, folder structure, config files, scripts).
- If the chosen technology has **no corresponding skill** under `.claude/skills/`, do not invent a baseline: **ask the user how to proceed** (e.g. which technology or skill to use, or whether they can provide bootstrap instructions).

## Technology → Skill Quick Reference

| Technology        | Skill path                                      |
|-------------------|--------------------------------------------------|
| Angular           | `.claude/skills/angular/SKILL.md`               |
| .NET / Dotnet     | `.claude/skills/dotnet/SKILL.md`                |
| OpenAPI           | `.claude/skills/openapi/SKILL.md`               |
| Java / Spring     | `.claude/skills/java-spring-microservices/SKILL.md` |
| PostgreSQL        | Use with backend baselines; `.claude/skills/postgresql/SKILL.md` for DB details |

## Example (Angular)

User: "Create an Angular baseline for the app."

1. Identify: Angular → skill `angular`.
2. Read `.claude/skills/angular/SKILL.md`.
3. Use the **Bootstrap Commands** (e.g. `pnpm dlx @angular/cli@latest new <projectName> --routing --standalone --style=scss --package-manager=pnpm`), then add Angular Material, PrimeNG, PWA, ESLint, Jest, Playwright, NgRx, OAuth as per the skill.
4. Create the **Required Folder Structure** (e.g. `core/`, `shared/`, `features/`, `layout/`, required files).
5. Add **Required package.json scripts** and **app.config.ts** as specified.
6. Replace `<projectName>` with the actual name.

Result: Baseline matches the Angular skill exactly; no extra or missing REQUIRED pieces.

# Generate Docs

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

Generates documentation for the current repository or project, regardless of type (microservice, app, monorepo, etc.).

## Usage

```
/generate-docs
```

Or with optional scope:

```
/generate-docs [single project]
/generate-docs [relative path to project root]
```

If no project is specified, the agent assumes the current workspace as a single project.

## Description

This command makes the agent:

### Analyze repository and generate documentation

1. **Read `.claude/settings.json`**: locate and parse the file. Extract the `env` object and resolve `PATH_DOCS`. If absent or the file does not exist, stop and tell the user.

2. **Ensure `{{PATH_DOCS}}` exists**: check whether the resolved `{{PATH_DOCS}}` directory exists. If it does not, run `/generate-repo docs` before continuing.

3. **Analyze the repository structure**
   - List workspace root: folders, configuration files (`package.json`, `pom.xml`, `build.gradle`, etc.).
   - Identify project type(s): Node/TypeScript, Java, frontend, monorepo with multiple projects.
   - Identify conventions: source code location (`src/`, `app/`), tests, configs (Docker, K8s, env).

4. **Create the folder and file structure** under `{{PATH_DOCS}}/`:

   ```
   {{PATH_DOCS}}/
   ├── 3-design/architecture/               # (optional) Patterns and dependencies
   │   ├── dependencies.md
   │   └── shared-patterns.md
   ├── 4-implementation/projects/           # Documentation by project
   │   ├── _TEMPLATE.md                     # Template for new projects
   │   ├── README.md                        # Explains structure and usage
   │   └── {project-name}/                  # One folder per project
   │       ├── BUSINESS-TO-CODE.md
   │       ├── DETAILED_INFORMATION.md
   │       ├── KNOW-HOW.md
   │       └── OVERVIEW.md
   └── overview.md                          # Repository/ecosystem overview
   ```

5. **Fill content** based on real code analysis (not generic placeholders):
   - **overview.md**: repository context, project types, main technologies, and how projects relate (if monorepo).
   - **architecture/** (when relevant): code patterns, APIs, events, and module dependencies.
   - **projects/README.md**: structure description (folders per project, the 4 files), how to use.
   - **projects/_TEMPLATE.md**: reusable template to document a new project (sections: purpose, type, technologies, directory structure, APIs, events, build/run, tests, integrations, troubleshooting, deploy).
   - **projects/{project-name}/**:
     - **OVERVIEW.md**: purpose, project type, technologies, main APIs/interfaces, events (if applicable). Short content focused on "what it is and what it exposes".
     - **DETAILED_INFORMATION.md**: layered architecture, real directory structure, key modules/components, technical integrations, design decisions.
     - **KNOW-HOW.md**: how to run (prerequisites, setup, commands), how to develop (workflow, shortcuts), how to test and debug.
     - **BUSINESS-TO-CODE.md**: relevant business rules translated into code decisions and patterns (can start with structure and few rules; reference a shared file if it exists in the repo).

## Rules for the agent

- **Do not invent**: extract information from code and configs (`package.json`, `pom.xml`, `Dockerfile`, `src/` folders, etc.).
- **Adapt to project type**: for example, if there are no events/messaging, omit or mark event sections as "N/A"; if frontend-only, focus on scripts, bundler, and consumed API.
- **One "project"** = one deployable unit or a clear package in the monorepo (e.g., an app or microservice). In monorepos, create one folder in `projects/` per relevant project.
- **Project folder name**: use a short, stable identifier (e.g., package name, service name, or app name).
- **Language**: keep English in titles and descriptions, unless the repository is explicitly in another language.
- **References**: in projects that use `common-ai-configs`, the agent may reference `common-ai-configs/{{PATH_DOCS}}/` as structure reference, but generated content must be specific to the current repository.
- **Never delete** existing files or directories during either phase.
- **Idempotent**: running the command twice must produce no errors and no data loss.

## Example

```text
Workspace: C:\MyRepo\my-microservice

/generate-docs

# 1. Reads settings.json, resolves PATH_DOCS
# 2. Checks docs/ exists — runs /generate-repo docs if not
# 3. Lists root, reads package.json and src/ structure
# 4. Creates docs/4-implementation/projects/my-microservice/ with OVERVIEW, DETAILED_INFORMATION, KNOW-HOW, BUSINESS-TO-CODE
# 5. Fills with real data (scripts, ports, dependencies, routes found in code)
```

## Structure reference

The target structure mirrors:

- `{{PATH_DOCS}}/` (overview, architecture)
- `{{PATH_DOCS}}/4-implementation/projects/` (README, _TEMPLATE, project folders with OVERVIEW, DETAILED_INFORMATION, KNOW-HOW, BUSINESS-TO-CODE)

The agent should use these files as section/style references, while generating content valid for the repository where the command is executed.
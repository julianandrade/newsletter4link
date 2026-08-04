# Generate Docs

Generates a documentation structure in the `docs` folder for common-ai-configs, adapted to the current repository or project, regardless of type (microservice, app, monorepo, etc.).

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

1. **Analyze the repository structure**
   - List workspace root: folders, configuration files (`package.json`, `pom.xml`, `build.gradle`, etc.).
   - Identify project type(s): Node/TypeScript, Java, frontend, monorepo with multiple projects.
   - Identify conventions: source code location (`src/`, `app/`), tests, configs (Docker, K8s, env).

2. **Decide where to create documentation**
   - Preferred: `docs/` folder at repository root.
   - Alternative: if `.claude/` exists, it may use `.claude/docs/` to keep docs close to agent configuration.
   - The agent must create the folder if it does not exist.

3. **Create the folder and file structure** (inspired by `common-ai-configs/.claude/docs/`):

   ```
   docs/
   +-- overview.md              # Repository/ecosystem overview
   +-- architecture/            # (optional) Patterns and dependencies
   |   +-- shared-patterns.md
   |   +-- dependencies.md
   +-- guides/                  # Practical guides
   |   +-- getting-started.md
   |   +-- common-tasks.md
   +-- projects/                # Documentation by project
       +-- README.md            # Explains structure and usage
       +-- _TEMPLATE.md         # Template for new projects
       +-- {project-name}/      # One folder per project
           +-- OVERVIEW.md
           +-- DETAILED_INFORMATION.md
           +-- KNOW-HOW.md
           +-- BUSINESS-TO-CODE.md
   ```

4. **Fill content** based on real code analysis (not generic placeholders):
   - **overview.md**: repository context, project types, main technologies, and how projects relate (if monorepo).
   - **architecture/** (when relevant): code patterns, APIs, events, and module dependencies.
   - **guides/getting-started.md**: prerequisites, installation, build, run, environment variables.
   - **guides/common-tasks.md**: common tasks (create module, add endpoint, test, deploy).
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
- **References**: in projects that use `common-ai-configs`, the agent may reference `common-ai-configs/.claude/docs/` as structure reference, but generated content must be specific to the current repository.

## Example

```text
Workspace: C:\MyRepo\my-microservice

/generate-docs

# The agent:
# 1. Lists root, reads package.json and src/ structure
# 2. Creates docs/ at root
# 3. Generates docs/overview.md, docs/guides/getting-started.md, docs/guides/common-tasks.md
# 4. Creates docs/projects/my-microservice/ with OVERVIEW, DETAILED_INFORMATION, KNOW-HOW, BUSINESS-TO-CODE
# 5. Fills with real data (scripts, ports, dependencies, routes found in code)
```

## Structure reference

The target structure mirrors:

- `common-ai-configs/.claude/docs/` (overview, architecture, guides)
- `common-ai-configs/.claude/docs/projects/` (README, _TEMPLATE, project folders with OVERVIEW, DETAILED_INFORMATION, KNOW-HOW, BUSINESS-TO-CODE)

The agent should use these files as section/style references, while generating content valid for the repository where the command is executed.

---

**Version**: 1.0.0
**Last Updated**: 2026-02-10

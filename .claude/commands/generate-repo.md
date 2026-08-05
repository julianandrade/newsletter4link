# Generate Repo

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

Initializes the workspace directory structure for the current repository.

## Usage

```
/generate-repo [args...]
```

**Args** (optional): one or more resource names to restrict which resources are initialized. If no args are given, all resources are initialized.

| Arg | Resource |
|-----|----------|
| `docs` | `{{PATH_DOCS}}` directory tree |
| `infra` | `{{PATH_INFRA}}` directory tree |

Examples:
```
/generate-repo           # initialize all resources
/generate-repo docs      # initialize docs only
/generate-repo infra     # initialize infra only
/generate-repo docs infra
```

## Initialize workspace structure

1. **Read `.claude/settings.json`**: locate and parse the file. Extract the `env` object. If the file does not exist, stop and tell the user.

2. **Determine target resources**: based on the args provided, select which resources to process.
   - No args → process all resources listed below.
   - One or more args given → process only the named resources; skip the rest silently.
   - Unknown arg → warn the user and skip it.

3. **Resolve resource paths**: for each target resource, read its path key from `env`. These values are relative to the workspace root (the same directory containing `.claude/`). Compute the absolute path for each.

   | Resource | `env` key |
   |----------|-----------|
   | `docs` | `PATH_DOCS` |
   | `infra` | `PATH_INFRA` |

   - If the required `env` key is absent, warn the user and skip that resource — do not guess a path.

4. **Create subdirectories**: for each target resource, create the full directory tree below using the Bash tool (`mkdir -p` on Linux/macOS, `New-Item -ItemType Directory -Force` on Windows). Never delete existing files or directories. Running the command twice must produce no errors and no data loss.

   **`docs`**
   ```
   {{PATH_DOCS}}/
   ├── 0-work/
   ├── 1-analysis/
   │   ├── argus/
   │   ├── athena/
   │   ├── artefacts/
   │   │   ├── BI/
   │   │   ├── BR/
   │   │   ├── DE/
   │   │   ├── EV/
   │   │   ├── NTI/
   │   │   ├── SCR/
   │   │   ├── TX/
   │   │   └── StoryNarratives/
   │   ├── functional-documentation/
   │   └── mockups/
   ├── 2-planning/
   ├── 3-design/
   │   ├── architecture/
   │   ├── design-system/
   │   │   ├── components/
   │   │   ├── tokens/
   │   │   └── utilities/
   │   ├── infrastructure/
   │   └── technical-documentation/
   ├── 4-implementation/
   │   ├── development/
   │   ├── integrations/
   │   └── projects/
   ├── 5-deployment/
   ├── 6-testing/
   └── 7-operation/
   ```

   **`infra`**
   ```
   {{PATH_INFRA}}/
   ├── deployment/
   │   ├── ansible/
   │   └── terraform/
   └── setup/
       └── azure/
           └── pipelines/
   ```

5. **Seed `development/README.md`** (`docs` resource only): `{{PATH_DOCS}}/4-implementation/development/` is created empty in step 4; per-Transaction subfolders (`{{PATH_DOCS}}/4-implementation/development/{tx-id}/`) are **not** pre-created here — they're created lazily, per Transaction, by the `complete-development` flow itself. Copy `.claude/skills/validate-transaction/templates/README.md` to `{{PATH_DOCS}}/4-implementation/development/README.md` **only if it does not already exist**. Never overwrite an existing file. This README defines the Transaction definition/split criteria used by `validate-transaction` and `ingest-artefact-transaction` regardless of source (legacy or artefact-catalog).

6. **Git init**: for each target resource directory, run `git init` inside it (the resolved absolute path, not the workspace root). Skip any directory where a `.git` subdirectory already exists.

7. **Report**: print a summary listing each processed resource root (absolute path), directories created, files seeded, and whether git was initialized or skipped.

## Rules for the agent

- **Never delete** existing files or directories.
- **Idempotent**: running the command twice must produce no errors and no data loss.
- **`0-work/` is protected**: never read, write, move, or delete any file or directory inside `{{PATH_DOCS}}/0-work/`. This rule has no exceptions.

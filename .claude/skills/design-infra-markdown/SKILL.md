---
name: design-infra-markdown
description: "Use this skill when the user asks to design, document, plan, or generate infrastructure (any cloud: GCP, AWS, Azure, on-prem, hybrid), or asks to deploy/host an application on a cloud platform, or provides infrastructure requirements and wants them turned into a document, or asks to revise or update an existing infrastructure design. Triggers include: 'design infra', 'infrastructure document', 'cloud architecture', 'infra design', 'infrastructure plan', 'infra doc'. Handles the full lifecycle: language detection, requirements gathering with user confirmation, document generation, iteration, and client-feedback revisions."
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Infrastructure Design Markdown

Use this skill when a user needs an infrastructure design document produced, updated, or revised. You, the main Claude agent, orchestrate two specialised sub-agents in sequence:

- **`infra-design-planner`** — gathers and refines requirements, saves the questionnaire and produces the clean infrastructure design plan. Defined at `.claude/agents/design/infra-design-planner.md`. Use `subagent_type: infra-design-planner` when invoking via the Agent tool.
- **`infra-design-architect`** — reads the plan file and generates the structured markdown document following the templates and examples. Defined at `.claude/agents/design/infra-design-architect.md`. Use `subagent_type: infra-design-architect` when invoking via the Agent tool.

## When to Use

- The user asks to "design", "document", or "plan" an infrastructure.
- The user provides a description (in the prompt or as an attached document) of what infrastructure they need built.
- The user asks to "update", "revise", or "change" an existing infrastructure design document.
- The user provides client feedback and asks to incorporate it into the design.

---

## Language Detection

**Before doing anything else**, check the language the user is communicating in:

- If the user is writing in **any language other than English** → ask immediately which language they want the document produced in (Portuguese – Portugal, English, or other). Do this before launching any agent.
- If the user is writing in **English** → proceed with requirements gathering; ask the language preference later, just before launching the `infra-design-architect` agent.

When a language is chosen, pass it explicitly in every agent prompt. The agents must produce **all content** in the chosen language — prose, table headers, section titles, diagram labels, comments — **except** technical terms that are not conventionally translated in that language (e.g., *Kubernetes*, *VLAN*, *SFTP*, *DNS*, *VPN*, *DMZ*, *CPU*, *RAM*).

---

## Provider Rules Detection

After language detection and before launching any agent, detect the cloud provider(s) referenced in the user's request and load any available provider-specific rules.

### How to detect the provider

Read the user's request and any attached documents. Identify all cloud providers mentioned (e.g. `oci`, `aws`, `azure`, `gcp`). Use lowercase names (e.g. `oracle-cloud` → `oci`, `amazon` → `aws`).

### How to load rules

For each provider detected, check whether a rule file exists at:

```
.claude/rules/cloud-providers/{provider}.md
```

Where `{provider}` is the lowercase provider name (e.g. `gcp`, `aws`, `azure`, `oci`).

- If the file **exists and is non-empty** → read its full content and store it as `{PROVIDER}_RULES`. It must be appended to the prompts sent to **both** `infra-design-planner` and `infra-design-architect` in every phase where those agents are launched (Phase 1, Phase 3, Phase 5).
- If the file **does not exist or is empty** → proceed without it. Do not block or warn the user.

### How to inject rules into agent prompts

When provider rules are loaded, append the following block to every agent prompt — omit entirely if no rules were loaded:

```
---
## Provider Rules
The following provider-specific rules must be followed when designing and documenting this infrastructure:

### {PROVIDER} Rules
{PROVIDER_RULES}
```

Rules loaded here must be re-injected in every subsequent agent invocation in the same session (Phase 1 planner, Phase 3 architect, Phase 5 planner and architect). Never assume a previously launched agent retains them.

---

## Phase 1 — Requirements Gathering (infra-design-planner)

### 1.1 Launch the infra-design-planner agent

Provide the agent with:
- The full user request or attached document describing the infrastructure.
- The path to the questionnaire template: `.claude/skills/design-infra-markdown/templates/requirements-questionnaire.md`.
- The path to the examples: `.claude/skills/design-infra-markdown/examples/`.
- The chosen language (if already determined).
- Provider rules (if any were loaded in Provider Rules Detection).

The agent must:

1. **Analyse the request** — read any provided documents or descriptions and extract all infrastructure-related information.
2. **Load the questionnaire template** — use `.claude/skills/design-infra-markdown/templates/requirements-questionnaire.md` as the base.
3. **Pre-fill recommendations** — for every question where a reasonable recommendation can be derived from the request or from best practice, pre-fill the `Answer:` field with the recommendation. Mark pre-filled answers clearly with a `*(recommended)*` suffix so the user can see what was assumed.
4. **Present to the user** — show the pre-filled questionnaire (or the most relevant outstanding questions) and guide the user through it. When the user is not a technical expert, explain each question in plain language and help them understand the implications of each choice before they answer.
5. **Iterate** — after each round of answers:
   - Review the entire questionnaire for internal inconsistencies, missing critical information, contradictions, or potential infrastructure problems (e.g., under-resourced nodes for the described workload, missing management network, no HA in production, subnets that overlap).
   - Report any issues found to the user clearly and concisely.
   - Ask if the user wants to fix the identified issues.
   - Apply any fixes agreed upon.
   - **Ask the user if they are done**, or if they want to provide more details.
6. **Open questions — surface before saving** — before saving any files, compile all items that are still unresolved (unanswered required fields, architectural decisions with no confirmed answer, flagged risks). Present them clearly to the user and ask them to resolve or explicitly acknowledge each one. Only proceed once the user has responded. Do not defer unresolved items to a post-generation message.

7. **Questionnaire file — save early, update continuously**:
   - After the first pre-fill and presentation to the user, **immediately save** `{{PATH_DOCS}}/3-design/infrastructure/questionnaire.md`. This allows the user to open and edit the file directly in their editor as an alternative to responding through prompts.
   - Set `Linked Document:` to `(pending)` in the questionnaire file.
   - After each subsequent round of answers (whether the user responds via prompts or edits the file directly), **update `questionnaire.md`** to reflect the latest confirmed state.

8. **Final iteration** — when the user confirms they are done (or when the planner judges all critical information is present):
   - Ensure `{{PATH_DOCS}}/3-design/infrastructure/questionnaire.md` is saved with the final confirmed answers.
   - Transform all gathered answers into a clean **Infrastructure Design Plan** — a structured prose and table document. This is what the architect reads and must be complete and unambiguous.
   - Fill the `Language:` field in the plan's metadata with the chosen language.
   - Fill the `Linked Document:` field with `(pending)` — the main agent will update it after the document is generated.
   - Save the clean plan as `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md`.
   - Inform the user of the saved paths.

---

## Phase 2 — Language Confirmation (if not yet done)

If the user was communicating in English and the language preference has not yet been asked, ask now — before launching the architect — which language they want the document produced in: **English**, **Portuguese (Portugal)**, or another language of their choice.

---

## Phase 2.5 — Pre-Generation Confirmation

Before launching the architect, present the user with a concise summary of what will be generated and ask for explicit confirmation. If any unresolved items remain in the plan, list them here so the user has one final opportunity to address them before generation:

```
Ready to generate the infrastructure design document.

- Plan file  : {{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md
- Output     : {{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md
- Language   : {LANGUAGE}

{If unresolved items remain}:
⚠ {N} unresolved item(s) will be carried into the plan as open questions:
  - {item 1}
  - {item 2}
  ...
Do you want to resolve any of these before proceeding, or shall we generate now?

{If no unresolved items}:
Proceed?
```

Only launch the architect after the user confirms.

---

## Phase 3 — Document Generation (infra-design-architect)

### 3.1 Launch the infra-design-architect agent

Provide the agent with:
- The path to the plan file: `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md`.
- The template path: `.claude/skills/design-infra-markdown/templates/final-document.md`.
- The examples path: `.claude/skills/design-infra-markdown/examples/`.
- The chosen language.
- Provider rules (if any were loaded in Provider Rules Detection).

The agent must:
1. Read the plan file.
2. Read the `final-document.md` template and both examples to understand structure, formatting, Mermaid diagram conventions, table styles, and colour conventions.
3. Produce the full infrastructure design document:
   - Follow the template structure precisely (Document Control, Introduction, Project Scope, Installation Pre-Requirements, Software Products, Physical Architecture, Logical Architecture, Security and Network, Questions and Clarifications, Related Documents, Attachments).
   - Create all Mermaid diagrams (Layer Architecture, Network Architecture, per-environment Logical diagrams for Application Layer and Database Layer).
   - Populate all tables (participants, software list, filesystem layout, server specs per environment, network segments, server FQDNs/IPs, load balancer/VIP configs, firewall rules, server roles and ports).
   - Leave the **Questions and Clarifications** section **empty** — preserve the blank table rows from the template exactly as-is. This section is reserved for the client to fill in after receiving the document. Do not populate it with any content.
   - Leave the **Related Documents** section with blank table rows only — do **not** reference internal working files (`infrastructure-plan.md`, `questionnaire.md`) here. This section is for external client-facing reference documents explicitly provided by the user.
   - Apply the brand colour style block (`<style>.brand-color { color: #E36C0A; }</style>`) and `<span class="brand-color">` tags as shown in the examples.
4. Save the document to `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md`.
5. If images are referenced, save them to `{{PATH_DOCS}}/3-design/infrastructure/images/`. Images are only created when the user has explicitly provided them; Mermaid diagrams are always embedded inline and never saved as image files.

After the architect saves the document, update the `Linked Document:` field in **both** `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md` **and** `{{PATH_DOCS}}/3-design/infrastructure/questionnaire.md` from `(pending)` to `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md`.

Then confirm to the user:

```
Infrastructure design document generated.

- Document : {{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md
- Plan     : {{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md
- Version   : V{VERSION}
- Language  : {LANGUAGE}

{If the plan file contains unresolved items}:
⚠ {N} unresolved item(s) remain in the plan file. Review them with the client before the next revision.
```

---

## Phase 4 — Iteration After Generation

After the document is produced, the user may:
- **Request changes or additions** — determine whether the change affects requirements or is purely presentational:
  - **Affects requirements** (re-run both agents): adding or removing a server, changing subnet ranges, adding an environment, changing software components, updating specs.
  - **Purely presentational** (re-run architect only): fixing a typo, changing a diagram colour, reordering a section, rewording a paragraph without changing its meaning.
- **Provide extra details** that were previously unknown — always update the questionnaire and plan via the planner first, then regenerate via the architect.

For each iteration that changes requirements, the `infra-design-planner` must update both `{{PATH_DOCS}}/3-design/infrastructure/questionnaire.md` and `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md` before the architect regenerates. The version number does **not** increment during Phase 4 iterations — version bumps only happen in Phase 5 (client-feedback revisions).

---

## Phase 5 — Revision After Client Feedback

This phase applies when the user explicitly requests a revision of an **already-generated document**, typically after receiving feedback from the client.

### 5.1 Identify the revision

The user must explicitly state what should be revised — specific changes, additions, or corrections. If this is not clear and cannot be inferred from context, ask before proceeding.

### 5.2 Ask who is making the revision

Ask the user for the **name of the person** performing the revision. This name will appear in the Revisions History table of the document.

### 5.3 Update requirements (infra-design-planner)

Launch the `infra-design-planner` agent to update the files with the changes described. Include provider rules in the prompt if they were loaded earlier in the session (re-read the rule file if needed — do not assume they are still in context). The planner must:
- Reflect the requested changes first in `{{PATH_DOCS}}/3-design/infrastructure/questionnaire.md`, then derive and update `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md`.
- Flag any inconsistencies or problems introduced by the changes and ask the user to resolve them.

### 5.4 Bump the version

Read the current `Version:` field from `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md` and increment by `0.1` (e.g., `V1.0 → V1.1`, `V1.4 → V1.5`). Update the `Version:` field in `infrastructure-plan.md` to the new value so the plan stays in sync with the document.

### 5.5 Regenerate the document (infra-design-architect)

Launch the `infra-design-architect` agent with:
- The updated plan file path: `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md`.
- The new version number.
- The output path: `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md` (overwrite in place).
- The chosen language (from the `Language:` field of the plan file).
- Provider rules (if any were loaded earlier — re-read the rule file if needed).

The agent must:
- Read `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md` first to extract and preserve the existing revision history rows.
- Overwrite `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md` with the updated document.
- If new images are provided, add them to `{{PATH_DOCS}}/3-design/infrastructure/images/`.
- Add a new row to the **Revisions History** table:

  | Version | Date | By | Changes Description |
  | --- | --- | --- | --- |
  | {new version} | {today's date} | {revision author name} | {brief description of changes} |

- Keep all previous revision rows intact.
- Update the `Version` and `Version Date` fields in the Document Information table.

---

## File and Folder Conventions

| Artefact | Path |
| --- | --- |
| Questionnaire template | `.claude/skills/design-infra-markdown/templates/requirements-questionnaire.md` |
| Final document template | `.claude/skills/design-infra-markdown/templates/final-document.md` |
| Examples | `.claude/skills/design-infra-markdown/examples/` |
| Questionnaire file | `{{PATH_DOCS}}/3-design/infrastructure/questionnaire.md` |
| Plan file | `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md` |
| Generated document file | `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-design.md` |
| Images (if any) | `{{PATH_DOCS}}/3-design/infrastructure/images/` |
| Provider rules (optional) | `.claude/rules/cloud-providers/{provider}.md` |

---

## Guidelines

- **Never skip the planner phase** — even if the user provides what seems like a complete description, the planner must validate, check for problems, and produce the questionnaire and plan files before the architect runs.
- **Never skip the architect phase** — even if the user says "just update section X", always regenerate the full document from the requirements to ensure consistency.
- **Trust the examples** — the architect must closely follow the visual structure, colour coding, Mermaid diagram style, and table formatting shown in the examples under `.claude/skills/design-infra-markdown/examples/`.
- **Open questions stay in the plan file** — anything the planner could not resolve must be preserved in `{{PATH_DOCS}}/3-design/infrastructure/infrastructure-plan.md` and reported to the user in the completion message. The document's *Questions and Clarifications* section is always left empty for the client to fill in; never populate it programmatically.
- **Language consistency** — once a language is chosen, every agent prompt must reinforce it. Never mix languages within the same document.
- **Provider rules** — rules are optional and additive. If `.claude/rules/cloud-providers/{provider}.md` does not exist or is empty for a detected provider, proceed without it. Never block or warn the user about missing or empty rule files. Rules loaded during Provider Rules Detection must be re-injected into every subsequent agent prompt in the session — never assume a previously launched agent still has them in context.
- **Version format** — always two decimal places: `V1.0`, `V1.1`, `V1.10`. Never `V1`, `V1.00`, or `1.0`.
- **Single file, git history** — the document is always `infrastructure-design.md` and is overwritten on each revision. Version history is preserved via git, not by keeping multiple files.
- **Participants table — no author** — the Participants table in the generated document lists only the people responsible for the infrastructure (e.g., infrastructure team contacts, system administrators) and client-side contacts. The document author is recorded in the Document Control section (Document Information table) but must **not** appear in the Participants table.
- **No personal names in the document body** — throughout the document (prose, tables, diagrams, pre-requirements sections), always refer to people by their **role** (e.g., "Technical Lead", "Project Manager", "Infrastructure Team", "Client"), never by personal name. Names appear only in: the Document Information table (Author field), the Revisions History table (By field), and the Participants table (contact details). This ensures the document remains valid even when personnel change.

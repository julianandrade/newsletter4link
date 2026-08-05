# Infrastructure Design Markdown Skill

Generates a structured infrastructure design document from your requirements. It orchestrates two agents — a planner that gathers and refines requirements, and an architect that produces the final Markdown document with Mermaid diagrams.

# How to use

Start by saying:

> "Help me design an infrastructure markdown document, ..."

Then either describe what you want inline or point to an existing requirements file.

The planner agent may ask follow-up questions to fill in gaps. You have three options:

- **Answer inline** — the planner will incorporate your answers and make recommendations.
- **Fill in the questionnaire manually** — edit the requirements file at `{{PATH_DOCS}}/1-analysis/requirements/RQ-XXX.md` directly.
- **Say you are done** — the planner will proceed with what it has.

A confirmation will be requested before the document is generated.

# How to make changes or request a revision

- **Changes** — just describe what you want updated and the document will be revised.
- **Formal revision** — the planner will ask for your name to record it in the revisions table and bump the document version.

# How to modify this skill

Apply changes in this order:

1. `examples` — treated as the source of truth; must be correct before anything else changes
2. `templates`
3. `agents` — infra-design-planner and infra-design-architect
4. `SKILL.md`
# Answer Clarifications

Answer all open questions in the clarification file(s) indicated by `$ARGUMENTS` (e.g. `TX-001-clarifications.md` or `TX-001` to answer both clarification files for that Transaction).

## Steps

1. **Resolve variables** by reading `.claude/settings.json`. Replace all `{{VARIABLE_NAME}}` placeholders before proceeding.

2. **Read `{{PATH_DOCS}}/4-implementation/development/README.md`** to understand the documentation structure and response format.

3. **Locate clarification files** — if `$ARGUMENTS` is a Transaction ID (e.g. `TX-001`), find all files matching `{{PATH_DOCS}}/4-implementation/development/**/*${ARGUMENTS}*clarifications*.md`. If a specific filename is given, use it directly.

4. **Read the main Transaction file** for the Transaction and any sub-folder Transaction file under `{{PATH_DOCS}}/4-implementation/development/`.

5. **Read all relevant documentation** available in `{{PATH_DOCS}}` — explore the folder structure and read whatever is present and relevant: architecture docs, rules catalogs, design references, mockups, overview files, and any dependency Transaction files referenced by the Transaction. Adapt to what exists in the project rather than assuming a fixed structure.

6. **Answer every question** in each clarification file following these rules:

   ### Answering rules

   - Write answers in clear, natural language — avoid mechanical labels and bureaucratic phrasing. Answers should read as if written by a knowledgeable team member, not a template.
   - **If the answer is documented**: state it directly and cite the source concisely (e.g. "The mockup shows..." or "AC-008 specifies...").
   - **If the answer is not documented**: provide the best-practice solution that best aligns with the project's observable patterns, conventions, and tech stack. End the answer with a brief note such as "> Not explicitly documented — based on [reason/pattern]." to keep traceability without dominating the answer.
   - **If there is a contradiction between sources**: explain both sides plainly, state which source to follow and why, then end with "> Contradiction in the documentation — requires product owner confirmation." if resolution is uncertain.
   - Never hallucinate or fabricate information. Only infer from what is observable in the docs.
   - When applying best practices, derive the tech stack, conventions, and patterns from the project documentation itself — do not assume a specific stack. Read `{{PATH_DOCS}}/overview.md` and architecture files to understand what is in use.

7. **Write the answers** directly into each clarification file, filling in the text after each `Answer:` label. Preserve the original file structure exactly — only add content after `Answer:`, never modify questions or headings.

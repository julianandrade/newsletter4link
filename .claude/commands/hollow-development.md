# Hollow Development (one artefact, end to end, no ceremony)

> **Variable Resolution:** Read `.claude/settings.json` before execution and resolve `{{VARIABLE_NAME}}` placeholders from `env`. Feature flags live in `.claude/features.json` in this project, not in `settings.json`; see that file for why.

Implement **exactly one** artefact from the catalog end to end: resolve it, write a minimal but real implementation, write only the tests its type calls for, commit, security-review, document. Then stop.

The whole behaviour is defined in [`.claude/skills/hollow-development/SKILL.md`](../skills/hollow-development/SKILL.md). This command file exists so the flow is listed alongside the others; it adds no steps of its own. Follow the skill.

## Parameters

Interpret `$ARGUMENTS` as a single token.

- **artefact-id** (required): one catalog artefact id, for example `DE-Article`, `NTI-List-Articles`, `TX-NL-001`, `SCR-NL-Review`.

One artefact per run. This command is direct-invocation only: it is not a step inside `/complete-development`, `/frontend-development`, or `/backend-development`.

## What it deliberately skips

Clarify, Architect, the `{tx-id}-complete-transaction.md` paper trail, and worktrees. It is **not** TDD: implementation and tests are produced in the same pass. That is a deliberate departure from the TDD rule in `/backend-development` and `unit-test-validation`, justified by the hollow-pass framing.

## Hard stops

- The artefact is `BI`, `BR`, or `EV`. These are never a unit of work; they are materialized inside the artefacts that reference them. The run reports which implementable artefacts reference the one you asked for.
- The artefact file does not exist under `{{PATH_DOCS}}/1-analysis/artefacts/{TYPE}/`.
- A referenced id does not resolve, the contract is ambiguous, or the artefact contradicts the technical documentation. There is no Clarify step here, so ambiguity cannot be asked about; it stops the run.
- The target project has no skeleton. Run `generate-baseline` first; this flow refuses to bootstrap.

## In this project

Stack detection (skill step 2) reads [`{{PATH_DOCS}}/3-design/technical-documentation/stack.md`](../../docs/3-design/technical-documentation/stack.md) first. That document is written and states that this repository is a single Next.js app rather than the split `frontend/` and `backend/` trees the skill's fallback expects, and where each artefact type lands. Read it before hunting for manifests.

## Related

- `/phased-development` — runs this command once per artefact across the whole catalog, in dependency order.
- `/complete-development` — the full-rigor track, when a transaction needs clarification, architecture review, an API contract, and traceability.

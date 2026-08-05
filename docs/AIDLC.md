# AIDLC in this project

The development flow comes from
[`common-ai-configs`](../../common-ai-configs/README.md), the shared Linkroad AI
configuration. Everything under `.claude/` is a copy of that repository's
`.claude/`, so the agents, commands and skills are the same ones used on the other
projects.

**Synced 5 August 2026** from `feature/hollow-development` at commit `84ebab1`,
against the handoff document `HANDOFF_artefact-catalog-and-hollow-development.md`
in that repository. The previous copy came from `origin/main` and was two
generations behind.

This document records what the shared repository cannot: **how the flow was
installed here**, and **where the flow and this codebase deliberately disagree**.

---

## What changed in the sync

Two things, and everything else follows from them.

**1. The vocabulary is now transaction, not requirement.** Every skill was renamed:
`clarify-requirement` became `clarify-transaction`, `validate-requirement` became
`validate-transaction`, and so on for `specify`, `architect`, `analyse-*-rules`,
`update-*-documentation` and `requirement-markdown`. `{req-id}` became `{tx-id}`.
Twelve skills are new, among them `functional-analysis`, `generate-storyline-docs`,
`complete-development-tree`, `worktree-docker` and the infrastructure set. A
`frontend/react` stack skill arrived, which this project actually needs.

**2. Analysis output is now a typed graph, not a document.** A transaction is a node
in an **artefact catalog** under `docs/1-analysis/artefacts/`, with seven types:

| Type | Meaning | Implementable alone? |
|---|---|---|
| `DE` | Data Entity, carries a Fields table | Yes, becomes a model plus migration |
| `NTI` | Non-Transactional Interaction, a query or listing | Yes, becomes a query endpoint |
| `TX` | Transaction, a state-changing operation | Yes, becomes an endpoint plus service method |
| `SCR` | Screen | Yes, becomes a screen wired to the TX/NTI endpoints |
| `BI` | Business Intention | No, reference-only context |
| `BR` | Business Rule | No, materialized as validation inside the referencing artefact |
| `EV` | Event or trigger | No, materialized as a button or an emitted event |

Each artefact is a small Markdown file whose `meta` block cross-links ids
(`references`, `mentions`, `screens`, `others`, `flows_to`, `roles`, `kind`). The
catalog is a **graph**, and that is the mental model shift worth internalising.

Two rules govern reading it. **One level deep, always:** read the target artefact
and everything its `meta` block names, then stop; do not chase the DE's own
`mentions`. And **the catalog is read-only** to every development flow, because it
is shared across transactions. Generated output goes to
`docs/4-implementation/development/`.

The adapter skill `ingest-artefact-transaction` resolves the graph into the same
`{tx-id}-complete-transaction.md` the old flow produced, so nothing downstream
knows the format changed.

---

## Two speeds

The evolution added a second, faster track. The full pipeline still exists.

| Situation | Use |
|---|---|
| One artefact, want working code fast, no paper trail needed | `/hollow-development <artefact-id>` |
| Whole catalog, want a running app, no human in the loop | `/phased-development` |
| A transaction needing clarification, architecture review, an API contract and full traceability | `/complete-development <tx-id>`, then `/frontend-development` |
| A transaction that must be split | `/complete-development-tree --tree .../_tree.md` |
| The artefact is `BI`, `BR` or `EV` | None of these. Find the implementable artefact that references it |

`/hollow-development` skips Clarify, Architect, the `complete-transaction.md` paper
trail and worktrees. It is **not TDD**: implementation and tests are produced in the
same pass, which is a deliberate departure from the TDD rule the rest of the house
mandates. It also has no Clarify step, so a gap is a **hard stop, not a pause**.
That is the price of skipping the ceremony, and it is why the catalog's reference
integrity matters more than anything else.

`/phased-development` runs it once per artefact in dependency order: DE, then NTI,
then TX, then SCR. Sequential, fail-fast, safe to re-run.

Both had no command file upstream, which the handoff records as a known gap. They
have one here: `.claude/commands/hollow-development.md` and
`.claude/commands/phased-development.md`. Neither adds steps; both defer to the skill.

---

## Where this project deliberately diverges

Five places. Each is a decision, not an oversight.

### 1. RQ-002 through RQ-007 keep their ids and their location

The new unit of work is a catalog artefact with a `TX-XX-NNN` id. This project has
six requirement folders under `.claude/docs/requirements/` and **239 `RQ-XXX` tags
across 87 source files**, with `RQ-007` step 3 still in flight.

Those stay exactly where they are. Nothing was moved, nothing was retagged.

This is supported rather than tolerated: the branch keeps the legacy free-prose
source path working, and chooses the branch by file existence. From
`complete-development`:

```
if docs/1-analysis/artefacts/TX/{tx-id}.md exists  -> catalog source
if docs/1-analysis/artefacts/NTI/{tx-id}.md exists -> catalog source
otherwise                                          -> legacy free-prose source
```

No `RQ-XXX` will ever match a catalog file, so the six existing requirements always
take the legacy branch. New work can go through the catalog without disturbing them.

The one adaptation: upstream, legacy sources are expected under
`docs/4-implementation/development/{tx-id}/`. Here they remain under
`.claude/docs/requirements/{req-id}/`, because moving six live folders to satisfy a
path convention buys nothing and would invalidate every cross-reference in
`STATUS.md`, `ROADMAP.md` and `DECISIONS-2026-08-05.md`. **When a flow asks for the
working folder of an `RQ-XXX`, read `.claude/docs/requirements/{req-id}/`.** For any
new `TX-`/`NTI-` id, use `docs/4-implementation/development/{tx-id}/` as upstream
specifies.

### 2. `features` lives in its own file

The flows read four flags as `features` from `.claude/settings.json`:
`clarifications`, `security`, `test`, `confirm`. Claude Code's settings schema
rejects a top-level `features` key and reverts the whole file when it appears, so
they live in [`.claude/features.json`](../.claude/features.json) instead, with the
same shape and the same defaults (all true except `confirm`). Read that file
wherever a command says to read `features` from `settings.json`. The
`{{VARIABLE_NAME}}` placeholders still resolve from `env` in `settings.json` as
documented; only the flags moved.

Worth reporting upstream: any project whose `settings.json` is edited through Claude
Code will hit this.

### 3. There is no frontend/backend split

The flows assume sibling `frontend/` and `backend/` trees with separate manifests.
This is one Next.js 16 App Router application at the repository root with one
`package.json`. Both resolve to the root. Do not create those directories.

This is written down where the flow will actually look for it:
[`docs/3-design/technical-documentation/stack.md`](3-design/technical-documentation/stack.md).
`hollow-development` step 2 reads that directory **before** hunting for manifests,
and step 4 treats it as authoritative. It records the stack, which artefact type
lands where, and the conventions generated code must respect.

A feature here usually touches a route handler and a screen together, so the
practical shape is `/complete-development` for the trunk, then
`/frontend-development` for the track, treating the route handler as part of the
same unit of work.

### 4. The SCR file-naming rule is suspended

`hollow-development` requires `SCR-*` files to be named exactly after the artefact
id, overriding the stack's casing convention so traceability beats idiom.

Next.js derives URLs from directory paths and requires the reserved filenames
`page.tsx`, `layout.tsx` and `route.ts`. A file named `SCR-NL-Review.tsx` in
`app/dashboard/review/` is not a route, it is dead code. Renaming the reserved files
breaks routing.

Traceability is preserved the way this codebase already does it across 239 tags: an
id comment tag at the top of the file, applied by `add-code-traceability`. The id
stays greppable, which is what the naming rule was buying. Any run that hits this
should record the suspension in its notes file rather than work around it silently.

### 5. Two agents' stack instructions still do not apply

| Agent | Assumes | Reality here |
|---|---|---|
| `backend-developer` | .NET 8, Clean Architecture, CQRS, EF Core | Next.js route handlers under `app/api/`, Prisma via a tenant-scoped client |
| `frontend-developer` | Angular 18, standalone components, NgRx, PrimeNG | React server and client components, the `components/radar/` vocabulary |

Follow their **process**, ignore their **stack instructions**. The arrival of
`.claude/skills/frontend/react/SKILL.md` narrows this: that skill does apply, and it
governs layout, naming and test-runner conventions for generated frontend code.
`.claude/skills/backend/` has no Node entry, so `openapi` and `postgresql` are the
only two relevant there.

Every other agent is stack-agnostic and applies unchanged: `product-owner`,
`api-specialist`, the architects, `code-tagger`, the code reviewers, the whole
`tests/` set and the whole `security/` set.

---

## Layout after the sync

```
docs/                                     # PATH_DOCS
├── 0-work/                               # never read, never write (upstream rule)
├── 1-analysis/
│   └── artefacts/{BI,BR,DE,EV,NTI,SCR,TX,StoryNarratives}/   # read-only catalog, empty
├── 2-planning/
├── 3-design/
│   └── technical-documentation/stack.md  # authoritative on HOW code is built here
├── 4-implementation/
│   └── development/README.md             # transaction definition and split criteria
├── 5-deployment/  6-testing/  7-operation/
├── AIDLC.md                              # this file
├── history/  plans/  reference/  screenshots/  SETUP.md  AGENT_POLICY.md

.claude/docs/requirements/RQ-00{2..7}/    # the six live requirements, unmoved
.claude/features.json                     # the four feature flags
```

`PATH_DOCS=docs` and `PATH_INFRA=infra` are set in `.claude/settings.json`. There is
no `infra/` directory yet; the deployment and pipeline skills will create it when
first used.

The catalog is scaffolded but **empty**. `/phased-development` will report every
phase as skipped until artefacts exist. Before the first real run, check reference
integrity: every id in every `references`, `mentions`, `screens` and `others` block
must resolve to a real file. Both `ingest-artefact-transaction` and
`hollow-development` treat an unresolved id as a blocking stop, and neither guesses.

---

## Keeping this in sync from here

The configuration is **copied**, not symlinked. The sync script
`common-ai-configs/sync-scripts/sync-claude-configs.ps1` replaces the target's
`.claude/` and root `CLAUDE.md` with symlinks into the shared repository, which was
rejected twice over: the shared `.claude/CLAUDE.md` would overwrite this project's,
which carries the stack, conventions, security guidelines and known issues; and a
symlink makes the configuration bidirectional, so any project-specific addition here
would silently change every other project linking the same directory.

The cost of copying is drift. To see it:

```bash
# From the project root. Review before accepting anything.
diff -ru --strip-trailing-cr ../common-ai-configs/.claude/skills .claude/skills
diff -ru --strip-trailing-cr ../common-ai-configs/.claude/agents .claude/agents
```

`--strip-trailing-cr` matters: the shared repository uses CRLF, so without it every
line of every file reads as changed.

Do not blindly overwrite `.claude/settings.json` (this project has its own hooks and
env), and do not copy `.claude/CLAUDE.md` (empty upstream). The four local personas
(`architect`, `fullstack-ninja`, `ops-engineer`, `qa-automation-expert`) and the four
local skills (`code-quality`, `context-sync`, `doc-lookup`, `visual-review`) are
project-native, from the initial commit, and have no upstream counterpart. Leave them.

### Upstream gaps to be aware of

Recorded in the handoff, unfixed on the branch, and relevant when reading the config:

- The `.github` and `.codex` mirrors did not receive `hollow-development`,
  `phased-development` or `functional-analysis`. Only `.claude` is current.
- `.claude/skills/README.md` documents `phased-development` nowhere, and its tree
  listing removes Angular while the same commit rewrote the Angular skill.
- `generate-baseline` had its Java rows deleted rather than repointed at
  `java-springboot`, so it cannot scaffold a Java skeleton. Irrelevant here.
- The testing-posture divergence (`hollow-development` is not TDD) is stated inside
  the skill but nowhere in the top-level docs. It is stated above.

---

## Four personas kept alongside

`/agent.architect`, `/agent.dev`, `/agent.qa` and `/agent.ops` predate all of this
and were kept. They are quicker for work too small to justify a transaction folder,
and `/agent.ops` has no AIDLC counterpart at all. Anything carrying a transaction or
artefact id should go through the AIDLC flows instead, so there is one traceable path
per unit of work rather than two.

---

## What replaced spec-kitty

The project previously used spec-kitty (`.kittify/`, `/spec-kitty.*` commands). It has
been removed. The mapping, for reading old commits and the notes in `docs/history/`,
updated for the renamed skills:

| spec-kitty | AIDLC now |
|---|---|
| `/spec-kitty.specify` | `/complete-development`, or `specify-transaction` |
| `/spec-kitty.clarify` | the Clarify step, or `clarify-transaction` |
| `/spec-kitty.plan` | the architecture step, or `architect-transaction` |
| `/spec-kitty.tasks` | no equivalent: AIDLC has no task-breakdown artifact |
| `/spec-kitty.implement` | `/frontend-development`, or `/hollow-development` for the fast track |
| `/spec-kitty.review` | `@frontend-code-reviewer`, `@backend-code-reviewer` |
| `/spec-kitty.accept` | `validate-transaction` |
| `/spec-kitty.checklist` | `validate-test-plan-coverage` |
| `/spec-kitty.constitution` | the Constitutional Principles section of `CLAUDE.md` |
| `kitty-specs/{feature}/spec.md` | `{tx-id}-complete-transaction.md` in the working folder |
| `kitty-specs/{feature}/plan.md` | `{tx-id}-frontend-tech-spec.md` in the working folder |

The superseded spec-kitty documentation is in [`docs/history/`](history/) rather than
deleted, so older commit messages and status notes still make sense.

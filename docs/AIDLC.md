# AIDLC in this project

The development flow comes from
[`common-ai-configs`](../../common-ai-configs/README.md), the shared Linkroad AI
configuration. Everything under `.claude/` is a copy of that repository's
`.claude/`, so the agents, commands and skills are the same ones used on the
other projects.

This document records two things the shared repository cannot: **how the flow
was installed here**, and **where the flow and this codebase disagree**.

## How it was installed, and why not with the sync script

`common-ai-configs/sync-scripts/sync-claude-configs.ps1` replaces the target
project's `.claude/` directory and root `CLAUDE.md` with symlinks into the shared
repository. That was not used here, for two reasons:

1. The shared `.claude/CLAUDE.md` is an empty file. Symlinking would have
   replaced this project's `CLAUDE.md`, which carries the stack, the
   conventions, the security guidelines and the known issues, with nothing.
2. A symlink makes the configuration shared and bidirectional. Any
   project-specific agent, skill or setting added here would silently change
   every other project that links the same directory.

So the configuration was **copied**, and the project's own `CLAUDE.md` was kept
and extended. The cost of copying is drift: improvements made in the shared
repository do not arrive automatically.

**To pull updates from the shared repository:**

```bash
# From the project root. Review the diff before accepting it.
diff -ru ../common-ai-configs/.claude/agents .claude/agents
diff -ru ../common-ai-configs/.claude/skills .claude/skills
```

Copy over what you want. Do not copy `.claude/CLAUDE.md` (empty upstream) or
blindly overwrite `.claude/settings.json` if this project has grown its own
hooks.

## Where the flow assumes a different stack

The shared agents were written for a .NET and Angular codebase. This project is
Next.js 16, React 19 and TypeScript, with Prisma against Supabase. That makes
two agents inapplicable as written:

| Agent | Assumes | Reality here |
|---|---|---|
| `backend-developer` | .NET 8, Clean Architecture, CQRS, EF Core | Next.js route handlers under `app/api/`, Prisma via a tenant-scoped client |
| `frontend-developer` | Angular 18, standalone components, NgRx, PrimeNG | React server and client components, the `components/radar/` vocabulary |

Follow their **process** (read the tech spec, implement, unit test, hand to the
tagger) and ignore their **stack instructions**. The same applies to the
`.claude/skills/backend/` and `.claude/skills/frontend/` skills.

Every other agent is stack-agnostic and applies unchanged: `product-owner`,
`api-specialist`, the architects, `code-tagger`, the code reviewers, the whole
`tests/` set, and the whole `security/` set.

There is no backend/frontend split here in the way the flow assumes. A feature
usually touches a route handler and a screen together, so the practical shape is
`/complete-development` for the requirement trunk, then `/frontend-development`
for the track, treating the route handler as part of the same unit of work.

## What replaced spec-kitty

The project previously used spec-kitty (`.kittify/`, `/spec-kitty.*` commands).
It has been removed. The mapping, for reading old commits and the notes in
`docs/history/`:

| spec-kitty | AIDLC |
|---|---|
| `/spec-kitty.specify` | `/complete-development`, or the `specify-requirement` skill |
| `/spec-kitty.clarify` | the Clarify step, or the `clarify-requirement` skill |
| `/spec-kitty.plan` | the architecture step, or the `architect-requirement` skill |
| `/spec-kitty.tasks` | no equivalent: AIDLC has no task-breakdown artifact |
| `/spec-kitty.implement` | `/frontend-development` or `/backend-development` |
| `/spec-kitty.review` | `@frontend-code-reviewer`, `@backend-code-reviewer` |
| `/spec-kitty.accept` | the `validate-requirement` skill |
| `/spec-kitty.checklist` | the `validate-test-plan-coverage` skill |
| `/spec-kitty.constitution` | the Constitutional Principles section of `CLAUDE.md` |
| `kitty-specs/{feature}/spec.md` | `.claude/docs/requirements/{req-id}/{req-id}-complete-requirement.md` |
| `kitty-specs/{feature}/plan.md` | `.claude/docs/requirements/{req-id}/{req-id}-tech-spec.md` |

The superseded spec-kitty documentation is in
[`docs/history/`](history/) rather than deleted, so older commit messages and
status notes still make sense.

## Four personas kept alongside

`/agent.architect`, `/agent.dev`, `/agent.qa` and `/agent.ops` predate this and
were kept. They are quicker for work too small to justify a requirement folder,
and `/agent.ops` has no AIDLC counterpart at all. Anything carrying a
requirement id should go through the AIDLC agents instead, so there is one
traceable path per requirement rather than two.

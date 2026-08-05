# Stack and code layout

> Read this before generating any code. `hollow-development` step 2 reads
> `{{PATH_DOCS}}/3-design/technical-documentation/` **first**, ahead of hunting for
> manifest files, and step 4 treats this document as authoritative on *how* code fits
> the system. A genuine contradiction between this document and an artefact is a hard
> stop, not something to resolve by guessing.

## The one thing the flow gets wrong by default

The shared flows assume two sibling trees, `frontend/` and `backend/`, each with its
own manifest. **This project has neither.** It is a single Next.js 16 App Router
application at the repository root, with one `package.json`. Server and client code
live in the same tree and are distinguished by directory, not by project.

So when a skill says "locate the frontend app" or "locate the backend app", both
resolve to the repository root. Do not create a `frontend/` or `backend/` directory.

## Stack

| | |
|---|---|
| Framework | Next.js 16, App Router, React 19 |
| Language | TypeScript, strict |
| Styling | TailwindCSS 4 with shadcn/ui |
| ORM | Prisma 7 against PostgreSQL (Supabase, pgvector enabled) |
| Unit tests | Vitest (`npm test` runs `vitest run`), config in `vitest.config.ts` |
| Browser tests | Playwright, config in `playwright.config.ts` |
| Typecheck | `npx tsc --noEmit`, which the suites do not replace |
| Build | `npm run build`, which runs `prisma generate && next build` |

The matching stack skill is `.claude/skills/frontend/react/SKILL.md`. There is no
matching backend stack skill: `.claude/skills/backend/` holds `dotnet`,
`java-springboot`, `openapi` and `postgresql`, and only the last two apply here.
`openapi` governs API contracts, `postgresql` governs schema decisions.

## Where each artefact type lands

| Type | Target | Notes |
|---|---|---|
| `DE-*` | `prisma/schema.prisma`, then `npx prisma db push` | Model name is the stack-idiomatic PascalCase domain name from the artefact title, **not** `DE-<id>`. Reuse an existing model rather than regenerating it |
| `TX-*` | Route handler under `app/api/<resource>/route.ts` plus a service function under `lib/<domain>/` | Business logic belongs in `lib/`, never in the route handler. Route handler validates input, calls the service, shapes the response |
| `NTI-*` | Route handler under `app/api/<resource>/` for the query, or a server-side query function in `lib/queries.ts` / `lib/<domain>/` when no HTTP surface is needed | |
| `SCR-*` | Screen under `app/dashboard/<screen>/page.tsx`, components under `components/` | See the file-naming exception below |
| `BI-*`, `BR-*`, `EV-*` | No file of their own | `BR` becomes validation inside the referencing artefact's service function; `EV` with `trigger_type: user-action` becomes the button wiring |

## The SCR file-naming rule, and why it is suspended here

`hollow-development` requires `SCR-*` files to be named *exactly* after the artefact
id, differing only by extension, deliberately overriding the stack's own casing
convention so traceability beats idiom.

**That rule cannot apply to this project.** Next.js App Router derives the URL from
the directory path and requires the reserved filenames `page.tsx`, `layout.tsx` and
`route.ts`. A file called `SCR-NL-Review.tsx` in `app/dashboard/review/` is not a
route; it is dead code. Renaming the reserved files breaks routing outright.

Traceability is preserved the way the rest of this codebase already does it, and has
done across 239 tags in 87 files: an `RQ-XXX` or artefact-id comment tag at the top of
the file, applied by `add-code-traceability`. The id is greppable, which is what the
naming rule was buying.

Record this suspension in the run's notes file rather than silently working around it.

## Conventions that constrain generated code

These come from `CLAUDE.md` and are not negotiable per-artefact:

- **Separation of concerns.** UI components render; business logic in `lib/`; data
  access through the Prisma service layer. A route handler that queries Prisma
  directly is wrong.
- **Every API route needs try/catch.** Every UI fetch needs loading and error states.
- **Multi-tenancy is real.** Queries are organization-scoped. A route that takes an id
  and does not filter by organization is the exact defect class that shipped four
  times already; see `.claude/docs/requirements/STATUS.md`.
- **Never trust `content[0].type === "text"`** on an Anthropic response. A reply that
  opens with a thinking block makes that silently return the empty string. Use the
  existing helper rather than reintroducing the pattern.
- **Files under ~500 LOC** where feasible. Extract helpers rather than creating `V2`
  copies.

## Environment

Required variables are listed in `CLAUDE.md` under Environment Setup. The dev server
runs on **port 3111**, not 3000. Note that `NEXT_PUBLIC_APP_URL` locally still points
at 3000, so links in locally generated emails point at the wrong port; that is a known
open item, not something to fix inside an artefact run.

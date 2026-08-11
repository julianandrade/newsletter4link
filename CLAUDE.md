# Newsletter4Link - Claude Context

> Last updated: January 2026

## Project Overview

AI-powered internal newsletter engine for Link company. Automatically curates articles from RSS feeds using Claude AI scoring, allows human editorial review, and sends personalized newsletters to subscribers featuring approved articles and internal project showcases.

**Tech Stack:**
- Next.js 16 (App Router)
- React 19 with TypeScript
- TailwindCSS 4 + shadcn/ui
- Prisma 7 ORM + PostgreSQL (Supabase)
- Claude AI (@anthropic-ai/sdk) for content scoring
- OpenAI for embeddings
- Resend for email delivery
- React Email for templates

**Repository:** https://github.com/julianandrade/newsletter4link
**Live Site:** https://newsletter4link.vercel.app

---

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

---

## Project Structure

```
newsletter4link/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── articles/       # Article CRUD + approve/reject
│   │   ├── projects/       # Project management
│   │   ├── subscribers/    # Subscriber management
│   │   ├── email/          # Preview & sending
│   │   └── curation/       # AI curation pipeline
│   ├── dashboard/          # Admin UI (protected)
│   │   ├── review/         # Article review interface
│   │   ├── projects/       # Project management
│   │   ├── subscribers/    # Subscriber management
│   │   └── send/           # Newsletter sending
│   └── unsubscribe/        # Unsubscribe page
├── components/ui/          # shadcn/ui components
├── lib/                    # Utilities
│   ├── ai/                 # AI integrations
│   ├── curation/           # Content curation logic
│   ├── email/              # Email sending utilities
│   └── db.ts               # Prisma client
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── sql/                # One-off SQL, run by hand
├── components/radar/       # AI Radar design vocabulary
├── tests/unit/             # Vitest suites
├── scripts/                # Maintenance and setup scripts
├── .claude/                # AI configuration (AIDLC, from common-ai-configs)
│   ├── agents/             # Agents by domain: backend, frontend, general, tests, security
│   ├── commands/           # complete-development, hollow-development, phased-development, tracks
│   ├── docs/requirements/  # RQ-002..RQ-007, the six live requirements, legacy source shape
│   ├── features.json       # The four AIDLC feature flags, see docs/AIDLC.md
│   ├── rules/              # Cloud-provider rules, read before infra work
│   └── skills/             # Reusable skills, per flow step
└── docs/                   # PATH_DOCS, the AIDLC document root
    ├── 0-work/             # Never read, never write, no exceptions
    ├── 1-analysis/
    │   └── artefacts/      # BI BR DE EV NTI SCR TX, the read-only catalog
    ├── 3-design/
    │   └── technical-documentation/stack.md   # Authoritative on how code is built here
    ├── 4-implementation/
    │   └── development/    # Per-transaction working folders for new TX/NTI work
    ├── AIDLC.md            # The development flow, and where this project diverges
    ├── history/            # Superseded status notes, kept for the record
    ├── reference/          # Newsletter examples and external material
    └── screenshots/        # UI captures
```

---

## Development Workflow

This project follows **AIDLC**, the flow defined in
[common-ai-configs](../common-ai-configs/How-TOs/Development-flux.md). The
configuration under `.claude/` is a copy of that repository's
`feature/hollow-development` branch, synced 5 August 2026 at commit `84ebab1`, so
the agents, commands and skills are the same ones used across Linkroad projects.

**Read [docs/AIDLC.md](docs/AIDLC.md) before running any flow.** It records the
five places this project deliberately diverges from the shared configuration.
Those divergences are decisions, not drift, and two of them will send you to the
wrong path if you skip it.

### Two speeds

| Situation | Use |
|---|---|
| One artefact, working code fast, no paper trail | `/hollow-development <artefact-id>` |
| The whole catalog, no human in the loop | `/phased-development` |
| A transaction needing clarification, architecture, an API contract and traceability | `/complete-development <tx-id>` then `/frontend-development` |
| A transaction that must be split | `/complete-development-tree` |

The full-rigor track, per step:

| Step | Who | Produces |
|---|---|---|
| 0. Validate | `@product-owner` | Reference-integrity check, or a split recommendation |
| 1. Clarify | `@product-owner` | `{tx-id}-clarifications.md`, or nothing when the catalog leaves no gaps |
| 3. Specify | `@product-owner` | `{tx-id}-complete-transaction.md` |
| 3c. Technical solution | `@solution-architect` | `{tx-id}-technical-solution-transaction.md` |
| 4api. API contract | `@api-specialist` | OpenAPI spec, when a new API surface is involved |
| 4a. Architecture | `@frontend-architect` | `{tx-id}-frontend-tech-spec.md` |
| 5. Test plan | `@test-plan` | Robot `.robot` files under the working folder's `tests/` |
| 6. Implement | `@frontend-developer` | Code plus unit tests |
| 7. Standardize | `@ui-ux-designer` | UI consistency against the design vocabulary |
| 8. Tag | `@code-tagger` | Traceability tags in the code |
| 9. Review | `@frontend-code-reviewer` | Review against the tech spec |

Use `@` to route to an agent explicitly, otherwise Claude guesses.

### Where the artifacts live

- **New work** uses the artefact catalog at `docs/1-analysis/artefacts/{BI,BR,DE,EV,NTI,SCR,TX}/`,
  which is **read-only** to every flow, and writes to `docs/4-implementation/development/{tx-id}/`.
  The catalog is scaffolded but empty.
- **RQ-002 through RQ-007 stay at `.claude/docs/requirements/{req-id}/`** with their
  239 `RQ-XXX` code tags untouched. They take the legacy free-prose branch, which the
  flow selects automatically because no `RQ-XXX` matches a catalog file. When a flow
  asks for the working folder of an `RQ-XXX`, read `.claude/docs/requirements/{req-id}/`.
- **Feature flags** (`clarifications`, `security`, `test`, `confirm`) are in
  `.claude/features.json`, not `settings.json`, which rejects the key. `{{VARIABLE}}`
  placeholders still resolve from `env` in `settings.json`.
- **`docs/0-work/`** is never read, written, listed or referenced. No exceptions.

### Two caveats worth knowing

**The shared agents assume a stack this project does not have.**
`backend-developer` targets .NET 8 Clean Architecture and `frontend-developer`
targets Angular 18. Follow their process, ignore their stack instructions. The new
`.claude/skills/frontend/react/SKILL.md` does apply and governs generated frontend
code. Every other agent (product-owner, api-specialist, architects, code-tagger,
reviewers, the test and security sets) is stack-agnostic.

**`/hollow-development` is not TDD and cannot ask questions.** Implementation and
tests are produced in the same pass, and any gap, an unresolved reference, an
ambiguous contract, a contradiction with `docs/3-design/technical-documentation/stack.md`,
is a hard stop rather than a clarification round. Use `/complete-development` when
the work needs a conversation.

---

## Agent Personas

Four lightweight personas predate the AIDLC adoption and are kept because they
are quicker for small work that does not warrant a requirement folder. For
anything with a requirement id, use the AIDLC agents above.

| Command | Persona | Use Case |
|---------|---------|----------|
| `/agent.architect` | Systems Architect | Design, data modeling, specifications |
| `/agent.dev` | Fullstack Developer | Implementation, debugging |
| `/agent.qa` | QA Engineer | Testing, validation |
| `/agent.ops` | DevOps Engineer | Infrastructure, deployments (no AIDLC equivalent) |

---

## Constitutional Principles

Non-negotiable rules for this project:

1. **Separation of Concerns** - UI components render only; business logic in lib/; data access via Prisma service layer
2. **Test-First Development** - Critical business logic (scoring, email sending) must have unit tests
3. **Security-First** - Always validate user input; protect admin routes; sanitize HTML content
4. **Error Handling** - Every API route needs try/catch; every UI fetch needs loading/error states
5. **Simplicity** - Build what's needed now; avoid premature abstraction

These are the project's non-negotiables. They live here rather than in a
separate constitution file, so there is one place to look.

---

## Environment Setup

### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Email Service
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=newsletter@yourcompany.com

# App Config
NEXT_PUBLIC_APP_URL=https://newsletter4link.vercel.app  # Production
# For local: http://localhost:3000
```

### Local Development

1. Copy `.env.example` to `.env`
2. Fill in API keys
3. Run `npx prisma generate && npx prisma db push`
4. Start dev server with `npm run dev`

---

## Database

**Provider:** PostgreSQL via Supabase (with pgvector extension)

**Schema Location:** `prisma/schema.prisma`

**Migration Commands:**
```bash
# Run migrations
npx prisma db push

# Generate client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

---

## Testing

**Test Framework:** Vitest, configured in `vitest.config.ts`. Suites live in
`tests/unit/` and alongside the code they cover.

```bash
# Run all suites
npx vitest run

# Watch one file
npx vitest tests/unit/selection.test.tsx

# Typecheck, which the suites do not replace
npx tsc --noEmit
```

Playwright is configured in `playwright.config.ts` for browser checks. The
temporary `/radar-preview` route renders any dashboard screen behind a fetch
stub, which is how UI work gets verified without a Supabase session.

---

## Deployment

**Environments:**
- **Production:** https://newsletter4link.vercel.app
- **Repository:** https://github.com/julianandrade/newsletter4link

**Deploy Process:**
- Push to master triggers automatic Vercel deployment
- All environment variables configured in Vercel dashboard
- Build includes Prisma client generation and Next.js optimization

**Build Requirements:**
- Node.js 18+
- PostgreSQL with pgvector extension
- All environment variables must be set in Vercel project settings

---

## Current Features

| Feature | Status | Description |
|---------|--------|-------------|
| RSS Curation | Complete | Fetches and scores articles from 7 RSS feeds |
| Article Review | Complete | Human approval/rejection of curated articles |
| Project Showcase | Complete | Internal projects with featured flag |
| Subscriber Management | Complete | CSV import, add/remove subscribers |
| Newsletter Sending | Complete | Preview and send to all subscribers |
| Email Tracking | Partial | Open/click tracking configured |

---

## Known Issues

- **Curation API Timeout** - `/api/curation/collect` times out on Vercel (needs background job or streaming)
- **UI/UX Polish Needed** - Dashboard needs design improvements

---

## Architecture Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Next.js App Router | Server components for performance, RSC streaming | Jan 2026 |
| Prisma + Supabase | Type-safe ORM, managed PostgreSQL with pgvector | Jan 2026 |
| Claude for scoring | Best-in-class reasoning for content relevance | Jan 2026 |
| Resend for email | Modern API, good deliverability, React Email support | Jan 2026 |
| An edition is identified by its publication date and its name | `week` and `year` under a unique index made a second edition in one week impossible and left no room for a name. They survive as a cache derived from `publishDate` and written only by `lib/editions/identity.ts`; `weeklySlot` (null on a special) carries the uniqueness that keeps the weekly schedule idempotent | Aug 2026 |
| The edition's HTML fragments live in `lib/email/edition-blocks.ts` | The code renderer and the merge tags that feed the Unlayer variants have to emit the same markup, or a template built in the editor renders articles that look like a different product | Aug 2026 |
| Every merge tag comes from `lib/email/merge-tags.ts` | Four hand-written lists existed and two had already drifted, so `{{articleCount}}` worked in a real send and printed literally in the preview. A test asserts both renderers resolve every tag in the table | Aug 2026 |
| What repeats N times stays a merge tag, in every template | An Unlayer design has no loop, and topic sections come from `article.category` at runtime. The Unlayer variants differ from the built-in in how much of the *frame* is editable, never in whether the body is code | Aug 2026 |
| The three subscriber-bound URLs resolve inside the send loop | Rendering once and reusing the string gave every recipient the first one's links, which is how the signed unsubscribe link was being dropped on three of four send paths. `lib/email/personalize.ts` is the only place they are filled in | Aug 2026 |
| A token carries its purpose in the signature, except `unsubscribe` | Otherwise one token opens every subscriber-scoped surface. `unsubscribe` keeps signing the bare id forever, because tokens of that shape are in mail already delivered | Aug 2026 |
| An edition is readable in a browser by the subscriber it was sent to, not by the public | An internal newsletter citing paid sources should not sit behind MFA and should not be open either. The HMAC that already signed unsubscribe links is the whole gate; `app/editions/` uses the raw Prisma client and scopes by the verified subscriber's organization by hand | Aug 2026 |
| The closing block is a merge tag, and everything it can show is an `Aside` row | A `CustomBlock` would have rendered only in the built-in path and landed glued to the end of `{{projects}}` in an Unlayer template. Free text typed at send time writes a `reusable: false` row rather than taking a second path, so "what did edition 32 send" has one answer. `RenderContext` dropping the field is what would have broken it: a send uses the active stored template when there is one | Aug 2026 |
| An uploaded image is what its bytes say, never what the client declares | `POST /api/media/upload` validated `file.type` and then stored the file with it as the served content type, on a public bucket, so `evil.svg` renamed to `meme.png` came back as script from our own domain. `lib/media/sniff.ts` accepts PNG, JPEG and GIF only: SVG can carry script, and Outlook on Windows does not render WebP | Aug 2026 |
| A model may suggest into the closing slot's queue, never into a send | `asidePickerQuery` only offers `APPROVED` rows, and `source` records `HUMAN` or `MODEL` uneditably. Model humour about LLMs lands between flat and subtly wrong, and one bad line costs more than fifty passable ones are worth when it carries the company's name | Aug 2026 |
| The second daily firing of a scheduled job lives in GitHub Actions, not `vercel.json` | This account is on Vercel Hobby, where a cron is capped at once per day and a sub-daily expression fails the **build** rather than the run. That is not theoretical: `15 */4 * * *` on email-ingest broke every deployment for days, so the route was never deployed and the job had never once run. `.github/workflows/curation.yml` takes the evening firings, Vercel keeps the morning ones, and both are offset so a failure in one half of the day still leaves the other half. Delete the workflow and move the schedules into `vercel.json` if the account ever goes Pro | Aug 2026 |
| Every curation run writes a `CurationJob` row, including the scheduled ones | `/dashboard/curation` lists `CurationJob` rows, and only the dashboard's own `runCurationPipelineWithStreaming` created any. So the 09:00 cron collected 45 articles on 9 August and left no trace the product could show, and the job looked dead for months while working. A job nobody can see is indistinguishable from a job that never ran | Aug 2026 |
| A list is ordered by the value its own cell shows | Both article routes ordered by the `publishedAt` column with NULLS LAST while both screens rendered `describeDate`, which falls back to `capturedAt`. The 165 undated stories in the queue sat at the bottom of "Newest first" displaying this week's capture date, so the Date column read 10 Aug, 3 Aug, 2 Jun, then jumped back to 8 Aug. `lib/articles/sort.ts` is the only place an article list is ordered, and it orders by `bestKnownDate`, the same expression the cell renders. Postgres cannot express that through Prisma's `orderBy`, so the pending route sorts in process and the paginated route takes its page from an ordered id pass | Aug 2026 |
| A route that paginates or caps its rows sorts in the database | The curation history sorted ten rows of a twelve-page history in the browser, so "Slowest first" described page one and the slowest run was on page four, unreachable. Filtering had the same shape: a date range blanked the page and left the pager reading "Page 1 of 12". Server-side for `/api/articles`, `/api/articles/pending`, `/api/projects`, `/api/subscribers`, `/api/curation/jobs`, `/api/asides` and `/api/inbound/received`; browser-side only for templates and RSS sources, which return the complete set with no `take`. `lib/list-sort.ts` records the rule | Aug 2026 |
| Everything an edition picks is a tab, on one row | Articles, projects and the closing block are the three things an editor chooses per edition, so they read as three tabs with the same icon-label-count shape rather than two tabs plus a panel floating above the readiness checklist. The closing block is still deliberately absent from Send Readiness: an edition with no closing block is a complete edition | Aug 2026 |
| There is one candidate list, and it filters in the database | Two pickers added one story per click, neither had a filter beyond a search box, and the pool was capped at 50 with nothing on screen saying so, which is unusable against the 128 approved stories actually waiting. An editor sends 10 to 20, so the job is finding the good ones, not adding all of them: filters are the lever, bulk-add is only what makes acting on them cheap. `components/edition/candidate-list.tsx` is the single list, embedded inline by the builder and wrapped in a dialog by the proposal; the hosts keep their own persistence and hand back the chosen rows. Filtering and sorting run in `readCandidatePool` because a capped list narrowed in the browser narrows the wrong set, and `articleTotal` ships with the page so the count line can say "24 of 128". Sorting takes the two-pass shape `/api/articles` uses: `date` and `source` are derived and cannot be an `orderBy` | Aug 2026 |
| A link in a framed edition opens in a new tab | Four screens serve the email's own HTML in an iframe, so an untargeted anchor navigates the frame, and any publisher sending `frame-ancestors 'self'` answers that with "refused to connect": every story link in the browser view was dead while the same link in the delivered mail worked, because a mail client hands an untargeted link to the system browser. `lib/email/framed-html.ts` injects `<base target="_blank">` at display time rather than putting `target` in the markup the renderer emits, because a hand-edited send is served as the bytes that went out and an Unlayer design brings its own anchors, so markup written today would leave every edition already sent still broken. All four frames now carry the same `sandbox="allow-popups allow-popups-to-escape-sandbox"`: the popup permissions are what the new tab needs, since a sandbox without them blocks it rather than opening it, and no frame grants `allow-scripts` or `allow-same-origin` because what renders is a stored template's HTML, not markup the page wrote. The send preview had no `sandbox` at all | Aug 2026 |
| A pool row is chosen with a checkbox, never dragged | Selection plus one action beats drag-and-drop at every scale above about five items, works on touch and keyboard, and adds no dependency; you cannot drag 128 things. Dragging survives only inside `EditionOrderList`, where the list is short and position is the point. The bar carries Reject and Discard beside Add, because the Queue lists only `PENDING_REVIEW`, so an approved story that never made an edition was invisible everywhere and had nowhere to be cleared from. Anything adding to an edition it does not own must merge first: `PATCH /api/editions/:id` deletes every join row and recreates what it is given, so `lib/editions/add-to-edition.ts` reads the current rows and carries them through | Aug 2026 |

---

## External Integrations

| Service | Purpose | Docs |
|---------|---------|------|
| Anthropic Claude | Content scoring and summaries | [docs.anthropic.com](https://docs.anthropic.com) |
| OpenAI | Embeddings for semantic search | [platform.openai.com](https://platform.openai.com) |
| Supabase | PostgreSQL database hosting | [supabase.com/docs](https://supabase.com/docs) |
| Resend | Transactional email sending | [resend.com/docs](https://resend.com/docs) |

---

## Notes for Claude

- Follow the AIDLC flow above for anything with a requirement id
- Check `.claude/docs/requirements/` for the active requirement's artifacts
- Read the Constitutional Principles below before architectural decisions
- Run tests before marking tasks complete
- The UI needs design improvements - use shadcn/ui patterns and modern layouts
- Curation timeout is a known issue - consider SSE or background jobs for fixes
- Update this file when architectural changes are made

---

## Agent Behavior Guidelines

### Multi-Agent Safety

**Prefer a git worktree for parallel work.** Julian's standing instruction, August 2026:
when work can run in parallel, or when more than one agent may touch this repo at once,
give each stream its own worktree instead of sharing one checkout. See
[docs/WORKTREES.md](docs/WORKTREES.md) for the how and the rules.

This supersedes the previous "do NOT create/remove/modify `git worktree` unless
explicitly requested". A worktree is now the default for parallel work, not an
exception. Sharing one checkout is what needs justifying.

The reason it changed: agents sharing a checkout collide on the things that are global
to it, not on the files they each edit. A branch switch yanks the tree out from under a
neighbour mid-edit, `npm run dev` binds one port so the second session finds `EADDRINUSE`,
and `git add -A` sweeps in another session's untracked files. All three happened here.

Still true when sharing a checkout:
- Do NOT create/apply/drop `git stash` unless explicitly requested
- Do NOT switch branches unless explicitly requested; use a worktree instead
- When unrecognized files appear, focus on your changes only; commit only scoped changes
  by explicit path, never `git add -A`
- Keep reports focused on your edits; end with brief "other files present" note only if relevant

### Verification Standards
- When answering questions, verify in code first; do not guess
- Bug investigations: read source code of related dependencies before concluding root cause
- Run tests before marking any task complete
- Aim for high-confidence answers backed by code evidence

### Code Quality
- Keep files under ~500 LOC when feasible; split/refactor when it improves clarity
- Add brief comments for tricky or non-obvious logic only
- Extract helpers instead of creating duplicate "V2" copies of files
- Use existing patterns; follow established conventions in the codebase

### Lint/Format Handling
- If diffs are formatting-only, auto-resolve without asking
- If commit already requested, include formatting fixes in same commit
- Only ask confirmation for semantic changes (logic/data/behavior)

---

## Commit & PR Guidelines

### Commit Messages
- Use concise, action-oriented format: `Area: action description`
- Examples: `API: add rate limiting to curation`, `UI: fix article card overflow`
- Group related changes; avoid bundling unrelated refactors

### Pull Requests
- Summarize: scope, testing performed, user-facing changes
- Reference related issues or specs when applicable

### PR Review Mode
- Use `gh pr view` and `gh pr diff` for review
- Do NOT switch branches during review
- Goal: merge PRs; prefer rebase when clean, squash when history is messy

### Security
- Never commit API keys, real phone numbers, or live config values
- Use obviously fake placeholders in docs, tests, and examples

---

## Security Guidelines

This project follows OWASP Top 10 2025 guidelines for both web and LLM applications.

### Web Application Security (OWASP Top 10 2025)

#### Access Control (A01)
- Deny access by default; require explicit grants
- Validate authorization on every server-side request
- Use role-based access control (RBAC) via middleware
- Log and alert on access control failures

#### Security Configuration (A02)
- Never use default credentials or configurations
- Remove unused features, endpoints, and dependencies
- Minimize error message verbosity in production
- Review cloud storage permissions (Supabase)

#### Supply Chain Security (A03)
- Verify package integrity before installation
- Use `package-lock.json` and commit it
- Audit new dependencies with `npm audit`
- Prefer well-maintained packages with security policies

#### Cryptographic Security (A04)
- Use strong algorithms: AES-256 for encryption, bcrypt/Argon2 for passwords
- Enforce TLS for all data in transit
- Never hardcode API keys or secrets
- Use environment variables for all sensitive configuration

#### Injection Prevention (A05)
- Use Prisma's parameterized queries (never raw SQL with user input)
- Sanitize HTML content before rendering
- Implement Content Security Policy (CSP) headers
- Validate and sanitize all user inputs

#### Secure Design (A06)
- Apply defense in depth (multiple security layers)
- Use established secure patterns from Next.js/Prisma
- Consider threat modeling for new features
- Separate concerns: UI, business logic, data access

#### Authentication Security (A07)
- Implement rate limiting on auth endpoints
- Use secure session management
- Store passwords with bcrypt (min 10 rounds)
- Implement account lockout after failed attempts

#### Integrity Verification (A08)
- Verify webhook signatures (e.g., Resend webhooks)
- Secure CI/CD pipelines
- Avoid deserializing untrusted data

#### Logging & Monitoring (A09)
- Log authentication events and access control failures
- Never log sensitive data (passwords, API keys, PII)
- Set up alerts for anomalous patterns
- Retain logs for incident investigation

#### Exception Handling (A10)
- Fail secure: on error, deny access rather than grant
- Sanitize error messages for users (no stack traces)
- Handle edge cases and boundary conditions
- Test error paths explicitly

### LLM Application Security (OWASP Top 10 LLM 2025)

#### Prompt Injection Prevention (LLM01)
- Clearly separate system prompts from user content
- Validate and filter user inputs before sending to Claude
- Use semantic filters for sensitive content categories
- Never trust LLM output without validation

#### Sensitive Information Protection (LLM02)
- Never include secrets or credentials in prompts
- Filter LLM outputs before displaying to users
- Don't expose internal system prompts in responses
- Sanitize any user data included in prompts

#### AI Supply Chain Security (LLM03)
- Use only trusted AI providers (Anthropic, OpenAI)
- Verify model versions and capabilities
- Monitor for API changes that could affect security

#### Output Validation (LLM05)
- Treat LLM outputs as untrusted input
- Validate and sanitize before using in downstream systems
- Never execute LLM-generated code without review
- Use sandboxing for untrusted model responses

#### Agency Limits (LLM06)
- Apply least-privilege to any LLM-triggered actions
- Limit LLM's ability to modify data or call external APIs
- Require human approval for sensitive operations
- Scope LLM functionality to what's strictly needed

#### Resource Management (LLM10)
- Implement rate limiting on AI endpoints
- Set appropriate timeouts for AI API calls
- Monitor token usage and costs
- Implement circuit breakers for AI failures
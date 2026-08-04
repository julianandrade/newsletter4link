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
│   ├── commands/           # complete-development, frontend-development, backend-development
│   ├── docs/requirements/  # Requirement artifacts per RQ, the AIDLC working set
│   └── skills/             # Reusable skills, per flow step
└── docs/                   # Documentation
    ├── AIDLC.md            # The development flow this project follows
    ├── history/            # Superseded status notes, kept for the record
    ├── reference/          # Newsletter examples and external material
    └── screenshots/        # UI captures
```

---

## Development Workflow

This project follows **AIDLC**, the flow defined in
[common-ai-configs](../common-ai-configs/How-TOs/Development-flux.md). The
configuration under `.claude/` is a copy of that repository's, so the agents,
commands and skills are the same ones used across Linkroad projects.

Requirement artifacts live in `.claude/docs/requirements/{req-id}/`:

| Step | Who | Produces |
|---|---|---|
| 1. Clarify | `@product-owner` | `{req-id}-clarifications.md` |
| 2. Specify | `@product-owner` | `{req-id}-complete-requirement.md` |
| 3. API contract | `@api-specialist` | OpenAPI spec, when a new API surface is involved |
| 4. Architecture | `@frontend-architect` | `{req-id}-tech-spec.md` |
| 5. Test plan | `@test-plan` | Robot `.robot` files under the requirement's `tests/` |
| 6. Implement | `@frontend-developer` | Code plus unit tests |
| 7. Standardize | `@ui-ux-designer` | UI consistency against the design vocabulary |
| 8. Tag | `@code-tagger` | `RQ-XXX` traceability tags in the code |
| 9. Review | `@frontend-code-reviewer` | Review against the tech spec |

Entry points: `/complete-development` for the requirement trunk, then
`/frontend-development` for the track. Use `@` to route to an agent explicitly,
otherwise Claude guesses.

See [docs/AIDLC.md](docs/AIDLC.md) for how the flow maps onto this stack.

**One caveat worth knowing:** the shared agent set was written for .NET and
Angular. `backend-developer` targets .NET 8 Clean Architecture and
`frontend-developer` targets Angular 18, neither of which applies here. This is
a Next.js and TypeScript codebase, so treat those two agents' stack instructions
as inapplicable and their process as the part to follow. Every other agent
(product-owner, api-specialist, architects, code-tagger, reviewers, the test and
security sets) is stack-agnostic.

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
When multiple Claude sessions or agents may be working:
- Do NOT create/apply/drop `git stash` unless explicitly requested
- Do NOT switch branches unless explicitly requested
- Do NOT create/remove/modify `git worktree` unless explicitly requested
- When unrecognized files appear, focus on your changes only; commit only scoped changes
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
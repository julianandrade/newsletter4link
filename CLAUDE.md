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
├── prisma/schema.prisma    # Database schema
├── emails/                 # React Email templates
├── .claude/                # Claude Code configuration
├── .kittify/               # Spec-kitty framework
├── kitty-specs/            # Feature specifications
└── docs/                   # Documentation
```

---

## Development Workflow

This project uses the **spec-kitty workflow** for feature development:

1. `/spec-kitty.specify` - Create feature specification
2. `/spec-kitty.clarify` - Resolve ambiguities
3. `/spec-kitty.plan` - Plan implementation
4. `/spec-kitty.tasks` - Generate work packages
5. `/spec-kitty.implement` - Execute tasks
6. `/spec-kitty.review` - Code review
7. `/spec-kitty.accept` - Acceptance checks
8. `/spec-kitty.merge` - Merge feature

See [docs/SDLC.md](docs/SDLC.md) for full workflow documentation.

---

## Agent Personas

Switch between specialized agents for different tasks:

| Command | Persona | Use Case |
|---------|---------|----------|
| `/agent.architect` | Systems Architect | Design, data modeling, specifications |
| `/agent.dev` | Fullstack Developer | Implementation, debugging |
| `/agent.qa` | QA Engineer | Testing, validation |
| `/agent.ops` | DevOps Engineer | Infrastructure, deployments |

---

## Key Commands

### Feature Development
- `/spec-kitty.dashboard` - View project status
- `/spec-kitty.checklist` - Quality checklist
- `/spec-kitty.constitution` - Non-negotiable principles

### Research & Analysis
- `/spec-kitty.analyze` - Cross-artifact consistency check
- `/spec-kitty.research` - Technical research

---

## Constitutional Principles

Non-negotiable rules for this project:

1. **Separation of Concerns** - UI components render only; business logic in lib/; data access via Prisma service layer
2. **Test-First Development** - Critical business logic (scoring, email sending) must have unit tests
3. **Security-First** - Always validate user input; protect admin routes; sanitize HTML content
4. **Error Handling** - Every API route needs try/catch; every UI fetch needs loading/error states
5. **Simplicity** - Build what's needed now; avoid premature abstraction

See `.kittify/memory/constitution.md` for full principles.

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

**Test Framework:** Jest / Vitest (to be configured)

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test
npm test -- path/to/test
```

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

- **UI/UX Polish Needed** - Dashboard needs design improvements

> **Resolved:** Scheduled curation no longer risks the Vercel timeout. The
> daily-collection cron enqueues one `CURATION` job per org onto a durable
> Postgres-backed queue (`QueueJob` model + `lib/jobs/`), drained by the
> `/api/cron/worker` tick (every 5 min) one job at a time within a time
> budget. Interactive `/api/curation/collect` still uses SSE streaming.
> Note: the `QueueJob` table requires `npx prisma db push` on deploy.

---

## Architecture Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Next.js App Router | Server components for performance, RSC streaming | Jan 2026 |
| Postgres-backed job queue | Durable curation jobs drained by a cron worker; no external service, uses existing DB | Jun 2026 |
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

- When implementing features, always follow the spec-kitty workflow
- Check `kitty-specs/` for active feature specifications
- Use `/spec-kitty.constitution` before making architectural decisions
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
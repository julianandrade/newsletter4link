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

- When implementing features, always follow the spec-kitty workflow
- Check `kitty-specs/` for active feature specifications
- Use `/spec-kitty.constitution` before making architectural decisions
- Run tests before marking tasks complete
- The UI needs design improvements - use shadcn/ui patterns and modern layouts
- Curation timeout is a known issue - consider SSE or background jobs for fixes
- Update this file when architectural changes are made

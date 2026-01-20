# Link AI Newsletter Engine

Autonomous AI-powered newsletter curation and delivery system for Link Consulting.

## Features

- 🤖 **AI-Powered Curation**: Automated content collection from RSS feeds with Claude-powered relevance scoring and summarization
- ✅ **Human-in-the-Loop**: Editorial review workflow for approving/rejecting AI-curated content
- 🚀 **Internal Showcase**: Highlight Link's AI projects and achievements
- 📧 **Email Delivery**: Batch sending to 1,000+ subscribers with Resend
- 📊 **Analytics**: Track opens, clicks, and engagement metrics
- ⏰ **Automated Scheduling**: Weekly cron jobs for collection and delivery

## Tech Stack

- **Frontend**: Next.js 14+ with TypeScript, TailwindCSS, shadcn/ui
- **Backend**: Next.js API Routes (serverless)
- **Database**: PostgreSQL (Supabase) with Prisma ORM
- **AI Services**: Anthropic Claude, OpenAI Embeddings
- **Email**: Resend
- **Deployment**: Vercel

## Project Structure

```
newsletter4link/
├── app/
│   ├── api/                  # API routes
│   │   ├── articles/         # Article management
│   │   ├── projects/         # Internal projects
│   │   ├── subscribers/      # Subscriber management
│   │   ├── editions/         # Newsletter editions
│   │   ├── email/            # Email preview & sending
│   │   └── cron/             # Scheduled jobs
│   ├── dashboard/            # Admin UI
│   │   ├── review/           # Article review
│   │   ├── projects/         # Project management
│   │   ├── subscribers/      # Subscriber management
│   │   ├── send/             # Email sending
│   │   └── preview/          # Email preview
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── ui/                   # shadcn/ui components
├── lib/
│   ├── ai/                   # AI integrations
│   ├── curation/             # Content curation logic
│   ├── email/                # Email sending
│   ├── config.ts             # Configuration
│   ├── db.ts                 # Prisma client
│   └── utils.ts              # Utilities
├── prisma/
│   └── schema.prisma         # Database schema
├── emails/                   # React Email templates
├── .env                      # Environment variables (not committed)
├── .env.example              # Environment variables template
└── package.json
```

## Database Schema

### Models

- **Article**: Curated news articles with AI-generated summaries and relevance scores
- **Project**: Link's internal AI projects to showcase
- **Edition**: Weekly newsletter editions
- **Subscriber**: Email subscribers with preferences
- **EmailEvent**: Tracking opens, clicks, bounces
- **RSSSource**: RSS feed sources for content collection

## Setup Instructions

### 1. Clone and Install

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string (Supabase)
- `ANTHROPIC_API_KEY`: Claude API key
- `OPENAI_API_KEY`: OpenAI API key for embeddings
- `RESEND_API_KEY`: Resend API key for email

### 3. Set Up Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) Seed RSS sources
npx prisma db seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage Workflows

### Content Collection

1. **Automatic**: Cron job runs every 6 hours to fetch RSS feeds
2. **Manual**: Visit `/api/curation/collect` to trigger manually

### Editorial Review

1. Go to `/dashboard/review`
2. Review AI-curated articles (scored 6.0+)
3. Approve, reject, or edit summaries
4. Add internal Link projects to feature
5. Click "Finalize & Preview"

### Email Preview & Send

1. Go to `/dashboard/send`
2. Preview the rendered email
3. Send test email to yourself
4. Schedule or send to all subscribers

### Automated Weekly Send

- **Schedule**: Sunday 12:00 UTC
- **Trigger**: Vercel Cron hits `/api/cron/weekly-send`
- **Behavior**: Auto-approves top 10 articles if not manually finalized
- **Delivery**: Batch sends to all active subscribers

## API Endpoints

### Articles
- `GET /api/articles/pending` - List pending articles
- `POST /api/articles/:id/approve` - Approve article
- `POST /api/articles/:id/reject` - Reject article
- `PATCH /api/articles/:id/summary` - Edit summary

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Subscribers
- `GET /api/subscribers` - List subscribers
- `POST /api/subscribers` - Add subscriber
- `POST /api/subscribers/import` - Import CSV
- `DELETE /api/subscribers/:id` - Remove subscriber

### Email
- `POST /api/email/preview` - Generate email preview
- `POST /api/email/send-test` - Send test email
- `POST /api/email/send-all` - Send to all subscribers

### Cron (Protected)
- `GET /api/cron/daily-collection` - Fetch RSS feeds
- `GET /api/cron/weekly-send` - Send newsletter

## Deployment

### Vercel Deployment

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Cron Jobs

Configure in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-collection",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/weekly-send",
      "schedule": "0 12 * * 0"
    }
  ]
}
```

## Development Roadmap

### ✅ Phase 1: MVP Foundation (Current)
- [x] Project setup with Next.js + TypeScript
- [x] Database schema with Prisma
- [x] Configuration and environment setup
- [ ] RSS collector
- [ ] AI curation engine
- [ ] Article management APIs
- [ ] Review dashboard UI
- [ ] Email template and sending

### 🔄 Phase 2: Internal Projects & Subscribers
- [ ] Projects CRUD
- [ ] Subscriber management
- [ ] CSV import
- [ ] Edition management

### 📅 Phase 3: Automation & Polish
- [ ] Vercel cron jobs
- [ ] Auto-finalize logic
- [ ] Analytics dashboard
- [ ] Performance optimization

### 🚀 Future Enhancements
- [ ] Multi-language support (PT-PT, PT-BR, ES, AR)
- [ ] Multiple newsletter styles (executive, technical, comprehensive)
- [ ] AI avatar videos
- [ ] Advanced personalization
- [ ] A/B testing

## Contributing

This is an internal Link Consulting project. For questions or issues, contact the development team.

## License

Proprietary - Link Consulting © 2026

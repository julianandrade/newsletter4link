# Link AI Newsletter Engine - Setup Guide

## 🎉 Implementation Complete!

All features from the plan have been successfully implemented. This guide will help you get the system running.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Supabase recommended)
- API keys for:
  - Anthropic Claude
  - OpenAI
  - Resend (or SendGrid)

## Step 1: Environment Setup

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your API keys in `.env`:**
   ```bash
   # Database
   DATABASE_URL="postgresql://user:password@host:5432/newsletter4link"
   DIRECT_URL="postgresql://user:password@host:5432/newsletter4link"

   # AI Services
   ANTHROPIC_API_KEY="sk-ant-your-key-here"
   OPENAI_API_KEY="sk-your-key-here"

   # Email Service
   RESEND_API_KEY="re_your-key-here"
   FROM_EMAIL="newsletter@linkconsulting.com"
   FROM_NAME="Link Consulting AI Newsletter"

   # Application
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

## Step 2: Database Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

3. **Run database migrations:**
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Enable pgvector extension** (for Supabase/PostgreSQL):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

## Step 3: Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## Step 4: First-Time Setup

### 1. Add Test Subscribers

- Go to http://localhost:3000/dashboard/subscribers
- Add a few test email addresses (use your own email for testing)

### 2. Run Content Curation

- Go to http://localhost:3000/dashboard
- Click "Run Curation Now" or visit http://localhost:3000/api/curation/collect
- Wait 2-5 minutes for AI to process articles

### 3. Review Articles

- Go to http://localhost:3000/dashboard/review
- Review AI-curated articles
- Approve articles you want in the newsletter
- Edit summaries if needed

### 4. Add Internal Projects (Optional)

- Go to http://localhost:3000/dashboard/projects
- Add Link's AI projects to showcase
- Click "Feature in Newsletter" to include them

### 5. Send Test Newsletter

- Go to http://localhost:3000/dashboard/send
- Enter your email in "Send Test Email"
- Click "Send Test"
- Check your inbox!

### 6. Send to All Subscribers

- After confirming the test looks good
- Click "Send Newsletter" on the send page
- Confirm the prompt
- Monitor the progress

## Features Implemented

### ✅ Phase 1: MVP Foundation
- [x] Next.js 14+ with TypeScript
- [x] Supabase/PostgreSQL with Prisma
- [x] RSS collector (7 AI/tech sources)
- [x] AI curation with Claude (scoring + summarization)
- [x] Deduplication (URL + vector similarity)
- [x] Article management APIs
- [x] Review dashboard UI
- [x] Email template with React Email
- [x] Batch email sending with Resend

### ✅ Phase 2: Internal Projects & Subscribers
- [x] Projects CRUD
- [x] Projects management UI
- [x] Subscriber management
- [x] CSV import
- [x] Unsubscribe page

### ✅ Phase 3: Automation & Polish
- [x] Vercel cron jobs
- [x] Auto-finalize logic
- [x] Send dashboard with preview
- [x] Edition management

## Dashboard Pages

### Main Dashboard
- **URL:** `/dashboard`
- **Features:** Quick actions, system overview

### Review Articles
- **URL:** `/dashboard/review`
- **Features:**
  - List pending articles with AI scores
  - Approve/reject articles
  - Edit summaries inline
  - Category badges

### Internal Projects
- **URL:** `/dashboard/projects`
- **Features:**
  - Add/edit/delete projects
  - Feature toggle for newsletter
  - Display team, date, impact

### Subscribers
- **URL:** `/dashboard/subscribers`
- **Features:**
  - Add single subscribers
  - CSV bulk import
  - Search and filter
  - Download sample CSV

### Send Newsletter
- **URL:** `/dashboard/send`
- **Features:**
  - Content preview (list and HTML)
  - Send test email
  - Send to all subscribers
  - Progress tracking

## API Endpoints Reference

### Articles
```
GET    /api/articles/pending          # List pending articles
GET    /api/articles/:id              # Get article
POST   /api/articles/:id/approve      # Approve article
POST   /api/articles/:id/reject       # Reject article
PATCH  /api/articles/:id/summary      # Edit summary
```

### Projects
```
GET    /api/projects                  # List all projects
POST   /api/projects                  # Create project
GET    /api/projects/:id              # Get project
PATCH  /api/projects/:id              # Update project
DELETE /api/projects/:id              # Delete project
```

### Subscribers
```
GET    /api/subscribers               # List subscribers
POST   /api/subscribers               # Add subscriber
GET    /api/subscribers/:id           # Get subscriber
PATCH  /api/subscribers/:id           # Update subscriber
DELETE /api/subscribers/:id           # Unsubscribe
POST   /api/subscribers/import        # Bulk CSV import
```

### Email
```
POST   /api/email/preview             # Generate preview HTML
POST   /api/email/send-test           # Send test email
POST   /api/email/send-all            # Send to all subscribers
```

### Curation
```
POST   /api/curation/collect          # Trigger RSS collection & AI curation
```

### Cron (Vercel only)
```
GET    /api/cron/daily-collection     # Daily 09:00 UTC
GET    /api/cron/weekly-proposal      # Daily 09:30 UTC

# Both require Authorization: Bearer $CRON_SECRET, and return 503 when
# CRON_SECRET is not configured on the deployment.
```

### System
```
GET    /api/status                    # Health check & stats
```

## Automated Workflows

### Daily Content Collection (09:00 UTC)
- Triggers: `/api/cron/daily-collection`
- Actions:
  1. Fetch RSS feeds from 7 sources
  2. Generate embeddings (OpenAI)
  3. Check for duplicates
  4. Score relevance (Claude)
  5. Generate summaries for high-scoring articles
  6. Save as PENDING_REVIEW

### Weekly Proposal (09:30 UTC, daily)
- Triggers: `/api/cron/weekly-proposal`
- Actions:
  1. Resolve the current ISO week, per `lib/radar/week.ts`
  2. Assemble or refresh the proposed edition for each organization
  3. Stop

No schedule sends mail. `/api/cron/weekly-send` used to auto-finalize an edition
and mail it unattended, and was deleted (RQ-005, BR-011). Sending is a human
action taken in the product.

## Troubleshooting

### "No approved articles found"
- Run curation first: `/api/curation/collect`
- Wait 2-5 minutes for AI processing
- Go to review dashboard and approve articles

### "Failed to send email"
- Check Resend API key in `.env`
- Verify `FROM_EMAIL` is authorized in Resend
- Check Resend dashboard for errors

### "Duplicate articles"
- This is normal - deduplication is working
- Duplicates are automatically skipped
- Check similarity threshold in `lib/config.ts`

### Prisma errors
- Run `npx prisma generate`
- Run `npx prisma migrate dev`
- Check DATABASE_URL is correct

### Slow AI processing
- Claude API has rate limits
- 1-2 second delay between requests
- Batch of 20 articles takes ~1-2 minutes

## Deployment to Vercel

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin your-repo-url
   git push -u origin main
   ```

2. **Import to Vercel:**
   - Go to vercel.com
   - Import your GitHub repository
   - Add environment variables from `.env`

3. **Configure Database:**
   - Add `DATABASE_URL` and `DIRECT_URL`
   - Run migrations: `npx prisma migrate deploy`

4. **Cron Jobs:**
   - Automatically configured via `vercel.json`
   - Verify in Vercel dashboard → Cron Jobs

5. **Domain Setup:**
   - Add custom domain in Vercel
   - Update `NEXT_PUBLIC_APP_URL` in environment variables
   - Update `FROM_EMAIL` in Resend to match domain

## Cost Estimates (Monthly)

### For 1,000 Subscribers, Weekly Newsletter

**Infrastructure (Vercel):**
- Hobby Plan: Free (sufficient for MVP)
- Pro Plan: $20/month (for production)

**Database (Supabase):**
- Free tier: $0 (up to 500MB)
- Pro tier: $25/month (8GB)

**AI Services:**
- Anthropic Claude: ~$50-100/month
- OpenAI Embeddings: ~$10/month

**Email (Resend):**
- Free tier: 3,000 emails/month ($0)
- Pro tier: 50,000 emails/month ($20)

**Total: $0-50/month (free tier) or $125-165/month (production)**

## Next Steps

1. ✅ Review this setup guide
2. ✅ Set up environment variables
3. ✅ Run database migrations
4. ✅ Add test subscribers
5. ✅ Run first curation
6. ✅ Send test newsletter
7. ✅ Deploy to Vercel
8. 📅 Schedule weekly review meetings
9. 📊 Monitor analytics and engagement

## Support & Documentation

- **Full documentation:** `README.md`
- **Database schema:** `prisma/schema.prisma`
- **Configuration:** `lib/config.ts`
- **API routes:** `app/api/`

## Success! 🎉

You now have a fully functional AI-powered newsletter engine. The system will automatically:
- Collect articles every 6 hours
- Curate with AI (scoring + summarization)
- Send newsletters every Sunday
- Track engagement metrics

**Enjoy your automated newsletter!**

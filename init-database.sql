-- Link AI Newsletter Engine - Database Initialization
-- Run this in Supabase SQL Editor

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ==================== ENUMS ====================

CREATE TYPE "ArticleStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "EditionStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SENT');
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED');

-- ==================== ARTICLES ====================

CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUrl" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(1536),
    "relevanceScore" DOUBLE PRECISION,
    "summary" TEXT,
    "category" TEXT[],
    "status" "ArticleStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Article_status_idx" ON "Article"("status");
CREATE INDEX "Article_relevanceScore_idx" ON "Article"("relevanceScore");
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- ==================== PROJECTS ====================

CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "projectDate" TIMESTAMP(3) NOT NULL,
    "impact" TEXT,
    "imageUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Project_featured_idx" ON "Project"("featured");
CREATE INDEX "Project_projectDate_idx" ON "Project"("projectDate");

-- ==================== EDITIONS ====================

CREATE TABLE "Edition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "week" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "EditionStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("week", "year")
);

CREATE INDEX "Edition_status_idx" ON "Edition"("status");

-- ==================== EDITION ARTICLES (JOIN TABLE) ====================

CREATE TABLE "EditionArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("editionId", "articleId"),
    FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE,
    FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE
);

CREATE INDEX "EditionArticle_editionId_idx" ON "EditionArticle"("editionId");
CREATE INDEX "EditionArticle_articleId_idx" ON "EditionArticle"("articleId");

-- ==================== EDITION PROJECTS (JOIN TABLE) ====================

CREATE TABLE "EditionProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("editionId", "projectId"),
    FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE,
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE INDEX "EditionProject_editionId_idx" ON "EditionProject"("editionId");
CREATE INDEX "EditionProject_projectId_idx" ON "EditionProject"("projectId");

-- ==================== SUBSCRIBERS ====================

CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Subscriber_email_idx" ON "Subscriber"("email");
CREATE INDEX "Subscriber_active_idx" ON "Subscriber"("active");

-- ==================== EMAIL EVENTS ====================

CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriberId" TEXT NOT NULL,
    "editionId" TEXT,
    "eventType" "EmailEventType" NOT NULL,
    "articleId" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE,
    FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL,
    FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL
);

CREATE INDEX "EmailEvent_subscriberId_idx" ON "EmailEvent"("subscriberId");
CREATE INDEX "EmailEvent_editionId_idx" ON "EmailEvent"("editionId");
CREATE INDEX "EmailEvent_eventType_idx" ON "EmailEvent"("eventType");
CREATE INDEX "EmailEvent_timestamp_idx" ON "EmailEvent"("timestamp");

-- ==================== RSS SOURCES ====================

CREATE TABLE "RSSSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL UNIQUE,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RSSSource_active_idx" ON "RSSSource"("active");

-- ==================== SEED DATA ====================

-- Insert default RSS sources
INSERT INTO "RSSSource" ("id", "name", "url", "category", "active") VALUES
    ('rss_techcrunch_ai', 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'AI News', true),
    ('rss_mit_ai', 'MIT Technology Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'AI Research', true),
    ('rss_venturebeat_ai', 'VentureBeat AI', 'https://venturebeat.com/category/ai/feed/', 'AI Business', true),
    ('rss_verge_ai', 'The Verge AI', 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', 'AI News', true),
    ('rss_openai', 'OpenAI Blog', 'https://openai.com/blog/rss/', 'AI Research', true),
    ('rss_google_ai', 'Google AI Blog', 'https://blog.research.google/feeds/posts/default', 'AI Research', true),
    ('rss_anthropic', 'Anthropic News', 'https://www.anthropic.com/news/rss.xml', 'AI Research', true)
ON CONFLICT ("id") DO NOTHING;

-- Success message
SELECT 'Database initialized successfully!' as message;

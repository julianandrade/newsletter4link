-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('TECHNOLOGY', 'FINANCE', 'INSURANCE', 'HEALTHCARE', 'RETAIL', 'UTILITIES', 'MANUFACTURING', 'PROFESSIONAL_SERVICES', 'OTHER');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SENT');

-- CreateEnum
CREATE TYPE "EditionKind" AS ENUM ('WEEKLY', 'SPECIAL');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'USED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'EMAIL');

-- CreateEnum
CREATE TYPE "ParseMode" AS ENUM ('DIGEST', 'ESSAY');

-- CreateEnum
CREATE TYPE "CurationJobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SearchSchedule" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "SearchTimeRange" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SearchResultStatus" AS ENUM ('NEW', 'REVIEWED', 'IMPORTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATION', 'SEARCH', 'EMAIL_SEND', 'EMAIL_INGESTION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('PROTOCOL', 'MODEL', 'COMPANY', 'TECHNIQUE', 'PRODUCT', 'BENCHMARK');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('HN', 'ARXIV');

-- CreateEnum
CREATE TYPE "RewriteInput" AS ENUM ('FULL_TEXT', 'EXCERPT');

-- CreateEnum
CREATE TYPE "RewriteStatus" AS ENUM ('GENERATED', 'FAILED', 'STALE');

-- CreateEnum
CREATE TYPE "InboundEmailStatus" AS ENUM ('CONTENT_PENDING', 'RECEIVED', 'PROCESSED', 'IGNORED_UNKNOWN_SENDER', 'FAILED');

-- CreateEnum
CREATE TYPE "AsideKind" AS ENUM ('JOKE', 'NOTE', 'SPOTLIGHT');

-- CreateEnum
CREATE TYPE "AsideStatus" AS ENUM ('PENDING', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AsideSource" AS ENUM ('HUMAN', 'MODEL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "industry" "Industry" NOT NULL DEFAULT 'TECHNOLOGY',
    "logoUrl" TEXT,
    "subscriberLimit" INTEGER NOT NULL DEFAULT 1000,
    "currentSubscribers" INTEGER NOT NULL DEFAULT 0,
    "customDomain" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUser" (
    "id" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "OrgRole" NOT NULL DEFAULT 'VIEWER',
    "theme" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'EDITOR',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relevanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "maxArticlesPerEdition" INTEGER NOT NULL DEFAULT 10,
    "vectorSimilarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "articleMaxAgeDays" INTEGER NOT NULL DEFAULT 7,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-ada-002',
    "brandVoicePrompt" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#1e3a5f',
    "theme" TEXT DEFAULT 'linkroad-dark',
    "fromName" TEXT,
    "replyToEmail" TEXT,
    "orgContextPrompt" TEXT,
    "rewriteLanguage" TEXT NOT NULL DEFAULT 'pt-PT',
    "relevanceHeading" TEXT NOT NULL DEFAULT 'Relevancia para a Link',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVoice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "personality" TEXT,
    "toneAttributes" TEXT[],
    "styleGuidelines" TEXT,
    "dos" TEXT[],
    "donts" TEXT[],
    "greetings" TEXT[],
    "closings" TEXT[],
    "useEmoji" BOOLEAN NOT NULL DEFAULT false,
    "examplePhrases" JSONB,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandVoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" DOUBLE PRECISION[],
    "relevanceScore" DOUBLE PRECISION,
    "summary" TEXT,
    "category" TEXT[],
    "status" "ArticleStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "discardedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT,
    "sourceUnresolved" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT,
    "inboundEmailId" TEXT,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "projectDate" TIMESTAMP(3) NOT NULL,
    "impact" TEXT,
    "imageUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "kind" "EditionKind" NOT NULL DEFAULT 'WEEKLY',
    "weeklySlot" TEXT,
    "week" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "EditionStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledDate" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentSnapshot" JSONB,
    "asideId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByEmail" TEXT,
    "approvedById" TEXT,
    "proposalRefreshedAt" TIMESTAMP(3),
    "generatedContent" JSONB,
    "generatedAt" TIMESTAMP(3),
    "editorDesignJson" JSONB,
    "templateId" TEXT,
    "sharePointUrl" TEXT,
    "sharePointPageId" TEXT,
    "sharePointPublishedAt" TIMESTAMP(3),
    "sharePointError" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditionArticle" (
    "editionId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "useLinkTake" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EditionArticle_pkey" PRIMARY KEY ("editionId","articleId")
);

-- CreateTable
CREATE TABLE "EditionProject" (
    "editionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "EditionProject_pkey" PRIMARY KEY ("editionId","projectId")
);

-- CreateTable
CREATE TABLE "GenerationDraft" (
    "id" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "brandVoiceId" TEXT,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "editionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "GenerationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "preferredStyle" TEXT NOT NULL DEFAULT 'comprehensive',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RSSSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "type" "SourceType" NOT NULL DEFAULT 'RSS',
    "senderAddress" TEXT,
    "inboundTag" TEXT,
    "parseMode" "ParseMode",
    "expectedCadenceDays" INTEGER,
    "lastReceivedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RSSSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "relevanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "maxArticlesPerEdition" INTEGER NOT NULL DEFAULT 10,
    "vectorSimilarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "articleMaxAgeDays" INTEGER NOT NULL DEFAULT 7,
    "aiModel" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-ada-002',
    "brandVoicePrompt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurationJob" (
    "id" TEXT NOT NULL,
    "status" "CurationJobStatus" NOT NULL DEFAULT 'RUNNING',
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "lowScore" INTEGER NOT NULL DEFAULT 0,
    "curated" INTEGER NOT NULL DEFAULT 0,
    "errorsCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CurationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "designJson" JSONB,
    "html" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "query" TEXT NOT NULL,
    "queryExpanded" TEXT,
    "providers" TEXT[] DEFAULT ARRAY['tavily']::TEXT[],
    "schedule" "SearchSchedule" NOT NULL DEFAULT 'MANUAL',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "timeRange" "SearchTimeRange" NOT NULL DEFAULT 'WEEK',
    "maxResults" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchResult" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "content" TEXT,
    "publishedAt" TIMESTAMP(3),
    "source" TEXT,
    "author" TEXT,
    "imageUrl" TEXT,
    "provider" TEXT NOT NULL,
    "rawScore" DOUBLE PRECISION,
    "aiScore" DOUBLE PRECISION,
    "aiSummary" TEXT,
    "aiTopics" TEXT[],
    "aiSentiment" TEXT,
    "aiRelevanceNote" TEXT,
    "status" "SearchResultStatus" NOT NULL DEFAULT 'NEW',
    "importedArticleId" TEXT,
    "searchTopicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryExpanded" TEXT,
    "queryAnalysis" JSONB,
    "resultCount" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedToTopicId" TEXT,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarEntity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EntityKind" NOT NULL,
    "hnQuery" TEXT,
    "arxivQuery" TEXT,
    "hnPrecision" DOUBLE PRECISION,
    "arxivPrecision" DOUBLE PRECISION,
    "precisionMeasured" TIMESTAMP(3),
    "precisionNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadarEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadarWatch" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadarWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalPoint" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalGap" (
    "id" TEXT NOT NULL,
    "entityId" TEXT,
    "source" "SignalSource" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRewrite" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt-PT',
    "model" TEXT NOT NULL,
    "inputMode" "RewriteInput" NOT NULL,
    "status" "RewriteStatus" NOT NULL DEFAULT 'GENERATED',
    "error" TEXT,
    "checksPassed" BOOLEAN NOT NULL,
    "checkSummary" TEXT,
    "checkFailures" JSONB,
    "longestSharedRun" INTEGER,
    "wordCount" INTEGER,
    "sourceHash" TEXT,
    "instruction" TEXT,
    "supersededAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRewrite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "resendEmailId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subaddressTag" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "html" TEXT,
    "text" TEXT,
    "status" "InboundEmailStatus" NOT NULL DEFAULT 'CONTENT_PENDING',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aside" (
    "id" TEXT NOT NULL,
    "kind" "AsideKind" NOT NULL DEFAULT 'JOKE',
    "status" "AsideStatus" NOT NULL DEFAULT 'APPROVED',
    "source" "AsideSource" NOT NULL DEFAULT 'HUMAN',
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "attribution" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt-PT',
    "reusable" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aside_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_customDomain_key" ON "Organization"("customDomain");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_plan_idx" ON "Organization"("plan");

-- CreateIndex
CREATE INDEX "Organization_archivedAt_idx" ON "Organization"("archivedAt");

-- CreateIndex
CREATE INDEX "OrgUser_supabaseUserId_idx" ON "OrgUser"("supabaseUserId");

-- CreateIndex
CREATE INDEX "OrgUser_organizationId_idx" ON "OrgUser"("organizationId");

-- CreateIndex
CREATE INDEX "OrgUser_email_idx" ON "OrgUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgUser_supabaseUserId_organizationId_key" ON "OrgUser"("supabaseUserId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_token_key" ON "OrgInvite"("token");

-- CreateIndex
CREATE INDEX "OrgInvite_token_idx" ON "OrgInvite"("token");

-- CreateIndex
CREATE INDEX "OrgInvite_organizationId_idx" ON "OrgInvite"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_email_organizationId_key" ON "OrgInvite"("email", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");

-- CreateIndex
CREATE INDEX "BrandVoice_organizationId_idx" ON "BrandVoice"("organizationId");

-- CreateIndex
CREATE INDEX "BrandVoice_isDefault_idx" ON "BrandVoice"("isDefault");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_discardedAt_idx" ON "Article"("discardedAt");

-- CreateIndex
CREATE INDEX "Article_relevanceScore_idx" ON "Article"("relevanceScore" DESC);

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_organizationId_idx" ON "Article"("organizationId");

-- CreateIndex
CREATE INDEX "Article_sourceId_idx" ON "Article"("sourceId");

-- CreateIndex
CREATE INDEX "Article_inboundEmailId_idx" ON "Article"("inboundEmailId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_sourceUrl_organizationId_key" ON "Article"("sourceUrl", "organizationId");

-- CreateIndex
CREATE INDEX "Project_featured_idx" ON "Project"("featured");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE INDEX "Edition_status_idx" ON "Edition"("status");

-- CreateIndex
CREATE INDEX "Edition_organizationId_idx" ON "Edition"("organizationId");

-- CreateIndex
CREATE INDEX "Edition_archivedAt_idx" ON "Edition"("archivedAt");

-- CreateIndex
CREATE INDEX "Edition_publishDate_idx" ON "Edition"("publishDate" DESC);

-- CreateIndex
CREATE INDEX "Edition_week_year_idx" ON "Edition"("week", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Edition_weeklySlot_organizationId_key" ON "Edition"("weeklySlot", "organizationId");

-- CreateIndex
CREATE INDEX "EditionArticle_editionId_order_idx" ON "EditionArticle"("editionId", "order");

-- CreateIndex
CREATE INDEX "EditionProject_editionId_order_idx" ON "EditionProject"("editionId", "order");

-- CreateIndex
CREATE INDEX "GenerationDraft_editionId_idx" ON "GenerationDraft"("editionId");

-- CreateIndex
CREATE INDEX "GenerationDraft_organizationId_idx" ON "GenerationDraft"("organizationId");

-- CreateIndex
CREATE INDEX "GenerationDraft_status_idx" ON "GenerationDraft"("status");

-- CreateIndex
CREATE INDEX "Subscriber_active_idx" ON "Subscriber"("active");

-- CreateIndex
CREATE INDEX "Subscriber_email_idx" ON "Subscriber"("email");

-- CreateIndex
CREATE INDEX "Subscriber_preferredLanguage_active_idx" ON "Subscriber"("preferredLanguage", "active");

-- CreateIndex
CREATE INDEX "Subscriber_preferredStyle_active_idx" ON "Subscriber"("preferredStyle", "active");

-- CreateIndex
CREATE INDEX "Subscriber_organizationId_idx" ON "Subscriber"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_organizationId_key" ON "Subscriber"("email", "organizationId");

-- CreateIndex
CREATE INDEX "EmailEvent_subscriberId_eventType_idx" ON "EmailEvent"("subscriberId", "eventType");

-- CreateIndex
CREATE INDEX "EmailEvent_editionId_eventType_idx" ON "EmailEvent"("editionId", "eventType");

-- CreateIndex
CREATE INDEX "EmailEvent_timestamp_idx" ON "EmailEvent"("timestamp");

-- CreateIndex
CREATE INDEX "EmailEvent_eventType_timestamp_idx" ON "EmailEvent"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "EmailEvent_editionId_eventType_timestamp_idx" ON "EmailEvent"("editionId", "eventType", "timestamp");

-- CreateIndex
CREATE INDEX "RSSSource_active_idx" ON "RSSSource"("active");

-- CreateIndex
CREATE INDEX "RSSSource_organizationId_idx" ON "RSSSource"("organizationId");

-- CreateIndex
CREATE INDEX "RSSSource_type_active_idx" ON "RSSSource"("type", "active");

-- CreateIndex
CREATE INDEX "RSSSource_senderAddress_idx" ON "RSSSource"("senderAddress");

-- CreateIndex
CREATE UNIQUE INDEX "RSSSource_url_organizationId_key" ON "RSSSource"("url", "organizationId");

-- CreateIndex
CREATE INDEX "CurationJob_status_idx" ON "CurationJob"("status");

-- CreateIndex
CREATE INDEX "CurationJob_startedAt_idx" ON "CurationJob"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "CurationJob_organizationId_idx" ON "CurationJob"("organizationId");

-- CreateIndex
CREATE INDEX "EmailTemplate_isActive_idx" ON "EmailTemplate"("isActive");

-- CreateIndex
CREATE INDEX "EmailTemplate_isDefault_idx" ON "EmailTemplate"("isDefault");

-- CreateIndex
CREATE INDEX "EmailTemplate_organizationId_idx" ON "EmailTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "MediaAsset_type_idx" ON "MediaAsset"("type");

-- CreateIndex
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_idx" ON "MediaAsset"("organizationId");

-- CreateIndex
CREATE INDEX "SearchTopic_organizationId_idx" ON "SearchTopic"("organizationId");

-- CreateIndex
CREATE INDEX "SearchTopic_isActive_idx" ON "SearchTopic"("isActive");

-- CreateIndex
CREATE INDEX "SearchTopic_nextRunAt_idx" ON "SearchTopic"("nextRunAt");

-- CreateIndex
CREATE INDEX "SearchTopic_schedule_isActive_idx" ON "SearchTopic"("schedule", "isActive");

-- CreateIndex
CREATE INDEX "SearchResult_searchTopicId_idx" ON "SearchResult"("searchTopicId");

-- CreateIndex
CREATE INDEX "SearchResult_status_idx" ON "SearchResult"("status");

-- CreateIndex
CREATE INDEX "SearchResult_aiScore_idx" ON "SearchResult"("aiScore" DESC);

-- CreateIndex
CREATE INDEX "SearchResult_createdAt_idx" ON "SearchResult"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SearchResult_url_searchTopicId_key" ON "SearchResult"("url", "searchTopicId");

-- CreateIndex
CREATE INDEX "SearchHistory_organizationId_idx" ON "SearchHistory"("organizationId");

-- CreateIndex
CREATE INDEX "SearchHistory_searchedAt_idx" ON "SearchHistory"("searchedAt" DESC);

-- CreateIndex
CREATE INDEX "BackgroundJob_type_status_idx" ON "BackgroundJob"("type", "status");

-- CreateIndex
CREATE INDEX "BackgroundJob_organizationId_idx" ON "BackgroundJob"("organizationId");

-- CreateIndex
CREATE INDEX "BackgroundJob_startedAt_idx" ON "BackgroundJob"("startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RadarEntity_slug_key" ON "RadarEntity"("slug");

-- CreateIndex
CREATE INDEX "RadarEntity_active_idx" ON "RadarEntity"("active");

-- CreateIndex
CREATE INDEX "RadarEntity_kind_idx" ON "RadarEntity"("kind");

-- CreateIndex
CREATE INDEX "RadarWatch_organizationId_idx" ON "RadarWatch"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RadarWatch_entityId_organizationId_key" ON "RadarWatch"("entityId", "organizationId");

-- CreateIndex
CREATE INDEX "SignalPoint_source_date_idx" ON "SignalPoint"("source", "date");

-- CreateIndex
CREATE INDEX "SignalPoint_entityId_source_date_idx" ON "SignalPoint"("entityId", "source", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SignalPoint_entityId_source_date_key" ON "SignalPoint"("entityId", "source", "date");

-- CreateIndex
CREATE INDEX "SignalGap_source_date_idx" ON "SignalGap"("source", "date");

-- CreateIndex
CREATE INDEX "ArticleRewrite_articleId_supersededAt_idx" ON "ArticleRewrite"("articleId", "supersededAt");

-- CreateIndex
CREATE INDEX "ArticleRewrite_status_idx" ON "ArticleRewrite"("status");

-- CreateIndex
CREATE INDEX "ArticleRewrite_generatedAt_idx" ON "ArticleRewrite"("generatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_resendEmailId_key" ON "InboundEmail"("resendEmailId");

-- CreateIndex
CREATE INDEX "InboundEmail_status_receivedAt_idx" ON "InboundEmail"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundEmail_status_claimedAt_idx" ON "InboundEmail"("status", "claimedAt");

-- CreateIndex
CREATE INDEX "InboundEmail_from_idx" ON "InboundEmail"("from");

-- CreateIndex
CREATE INDEX "InboundEmail_subaddressTag_idx" ON "InboundEmail"("subaddressTag");

-- CreateIndex
CREATE INDEX "Aside_organizationId_status_kind_language_lastUsedAt_idx" ON "Aside"("organizationId", "status", "kind", "language", "lastUsedAt");

-- CreateIndex
CREATE INDEX "Aside_organizationId_status_createdAt_idx" ON "Aside"("organizationId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "OrgUser" ADD CONSTRAINT "OrgUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgInvite" ADD CONSTRAINT "OrgInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVoice" ADD CONSTRAINT "BrandVoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RSSSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_asideId_fkey" FOREIGN KEY ("asideId") REFERENCES "Aside"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionArticle" ADD CONSTRAINT "EditionArticle_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionArticle" ADD CONSTRAINT "EditionArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionProject" ADD CONSTRAINT "EditionProject_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionProject" ADD CONSTRAINT "EditionProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationDraft" ADD CONSTRAINT "GenerationDraft_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationDraft" ADD CONSTRAINT "GenerationDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RSSSource" ADD CONSTRAINT "RSSSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurationJob" ADD CONSTRAINT "CurationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchTopic" ADD CONSTRAINT "SearchTopic_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_searchTopicId_fkey" FOREIGN KEY ("searchTopicId") REFERENCES "SearchTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_convertedToTopicId_fkey" FOREIGN KEY ("convertedToTopicId") REFERENCES "SearchTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarWatch" ADD CONSTRAINT "RadarWatch_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "RadarEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadarWatch" ADD CONSTRAINT "RadarWatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalPoint" ADD CONSTRAINT "SignalPoint_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "RadarEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalGap" ADD CONSTRAINT "SignalGap_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "RadarEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRewrite" ADD CONSTRAINT "ArticleRewrite_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aside" ADD CONSTRAINT "Aside_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


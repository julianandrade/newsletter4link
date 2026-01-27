-- Multi-tenant Migration Script
-- This script adds multi-tenancy support to the existing database

-- Step 1: Create new multi-tenant tables

-- Organization table
CREATE TABLE IF NOT EXISTS "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "industry" TEXT NOT NULL DEFAULT 'TECHNOLOGY',
    "logoUrl" TEXT,
    "subscriberLimit" INTEGER NOT NULL DEFAULT 1000,
    "currentSubscribers" INTEGER NOT NULL DEFAULT 0,
    "customDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_customDomain_key" ON "Organization"("customDomain");
CREATE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_plan_idx" ON "Organization"("plan");

-- OrgUser table
CREATE TABLE IF NOT EXISTS "OrgUser" (
    "id" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgUser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgUser_organizationId_supabaseUserId_key" ON "OrgUser"("organizationId", "supabaseUserId");
CREATE INDEX IF NOT EXISTS "OrgUser_supabaseUserId_idx" ON "OrgUser"("supabaseUserId");
CREATE INDEX IF NOT EXISTS "OrgUser_organizationId_idx" ON "OrgUser"("organizationId");

-- OrgInvite table
CREATE TABLE IF NOT EXISTS "OrgInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgInvite_token_key" ON "OrgInvite"("token");
CREATE INDEX IF NOT EXISTS "OrgInvite_email_idx" ON "OrgInvite"("email");
CREATE INDEX IF NOT EXISTS "OrgInvite_organizationId_idx" ON "OrgInvite"("organizationId");

-- OrgSettings table
CREATE TABLE IF NOT EXISTS "OrgSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "newsletterName" TEXT NOT NULL DEFAULT 'Newsletter',
    "fromEmail" TEXT NOT NULL DEFAULT 'newsletter@example.com',
    "fromName" TEXT NOT NULL DEFAULT 'Newsletter Team',
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "logoUrl" TEXT,
    "headerImageUrl" TEXT,
    "footerText" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "unsubscribeUrl" TEXT,
    "scoringPrompt" TEXT,
    "brandVoicePrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");

-- BrandVoice table
CREATE TABLE IF NOT EXISTS "BrandVoice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "personalityDescription" TEXT NOT NULL,
    "toneAttributes" TEXT[],
    "writingGuidelines" TEXT,
    "doList" TEXT[],
    "dontList" TEXT[],
    "signatureGreetings" TEXT[],
    "signatureClosings" TEXT[],
    "useEmojis" BOOLEAN NOT NULL DEFAULT false,
    "goodExamples" TEXT[],
    "badExamples" TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandVoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BrandVoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BrandVoice_organizationId_idx" ON "BrandVoice"("organizationId");
CREATE INDEX IF NOT EXISTS "BrandVoice_isDefault_idx" ON "BrandVoice"("isDefault");

-- Step 2: Create default organization
INSERT INTO "Organization" ("id", "name", "slug", "plan", "industry", "subscriberLimit", "createdAt", "updatedAt")
VALUES ('default-org-001', 'Link Consulting', 'link-consulting', 'ENTERPRISE', 'TECHNOLOGY', 100000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Create default org settings
INSERT INTO "OrgSettings" ("id", "organizationId", "newsletterName", "fromEmail", "fromName", "primaryColor", "defaultLanguage", "createdAt", "updatedAt")
VALUES ('default-settings-001', 'default-org-001', 'Link AI Newsletter', 'newsletter@julianandrade.net', 'Link Consulting AI Newsletter', '#3B82F6', 'en', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId") DO NOTHING;

-- Step 3: Add organizationId columns to existing tables (nullable first)
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Edition" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Subscriber" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "RSSSource" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "CurationJob" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- Step 4: Update existing records to use default organization
UPDATE "Article" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "Project" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "Edition" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "Subscriber" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "RSSSource" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "CurationJob" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "EmailTemplate" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;
UPDATE "MediaAsset" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL;

-- Step 5: Make organizationId columns NOT NULL and add foreign keys
ALTER TABLE "Article" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Edition" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Subscriber" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "RSSSource" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CurationJob" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "EmailTemplate" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "MediaAsset" ALTER COLUMN "organizationId" SET NOT NULL;

-- Add foreign key constraints (if not exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Article_organizationId_fkey') THEN
        ALTER TABLE "Article" ADD CONSTRAINT "Article_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_organizationId_fkey') THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Edition_organizationId_fkey') THEN
        ALTER TABLE "Edition" ADD CONSTRAINT "Edition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscriber_organizationId_fkey') THEN
        ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RSSSource_organizationId_fkey') THEN
        ALTER TABLE "RSSSource" ADD CONSTRAINT "RSSSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CurationJob_organizationId_fkey') THEN
        ALTER TABLE "CurationJob" ADD CONSTRAINT "CurationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailTemplate_organizationId_fkey') THEN
        ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MediaAsset_organizationId_fkey') THEN
        ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 6: Add indexes for organizationId columns
CREATE INDEX IF NOT EXISTS "Article_organizationId_idx" ON "Article"("organizationId");
CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX IF NOT EXISTS "Edition_organizationId_idx" ON "Edition"("organizationId");
CREATE INDEX IF NOT EXISTS "Subscriber_organizationId_idx" ON "Subscriber"("organizationId");
CREATE INDEX IF NOT EXISTS "RSSSource_organizationId_idx" ON "RSSSource"("organizationId");
CREATE INDEX IF NOT EXISTS "CurationJob_organizationId_idx" ON "CurationJob"("organizationId");
CREATE INDEX IF NOT EXISTS "EmailTemplate_organizationId_idx" ON "EmailTemplate"("organizationId");
CREATE INDEX IF NOT EXISTS "MediaAsset_organizationId_idx" ON "MediaAsset"("organizationId");

-- Step 7: Update unique constraints to include organizationId
-- First drop existing unique constraints if they exist
DO $$ 
BEGIN
    -- Article: sourceUrl -> sourceUrl + organizationId
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Article_sourceUrl_key') THEN
        ALTER TABLE "Article" DROP CONSTRAINT "Article_sourceUrl_key";
    END IF;
    
    -- Subscriber: email -> email + organizationId
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscriber_email_key') THEN
        ALTER TABLE "Subscriber" DROP CONSTRAINT "Subscriber_email_key";
    END IF;
    
    -- RSSSource: feedUrl -> feedUrl + organizationId
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RSSSource_feedUrl_key') THEN
        ALTER TABLE "RSSSource" DROP CONSTRAINT "RSSSource_feedUrl_key";
    END IF;
    
    -- Edition: week_year -> week_year + organizationId  
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Edition_week_year_key') THEN
        ALTER TABLE "Edition" DROP CONSTRAINT "Edition_week_year_key";
    END IF;
    
    -- EmailTemplate: name -> name + organizationId
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailTemplate_name_key') THEN
        ALTER TABLE "EmailTemplate" DROP CONSTRAINT "EmailTemplate_name_key";
    END IF;
END $$;

-- Add new compound unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "Article_sourceUrl_organizationId_key" ON "Article"("sourceUrl", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscriber_email_organizationId_key" ON "Subscriber"("email", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "RSSSource_feedUrl_organizationId_key" ON "RSSSource"("feedUrl", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Edition_week_year_organizationId_key" ON "Edition"("week", "year", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_name_organizationId_key" ON "EmailTemplate"("name", "organizationId");

-- Update organization subscriber count
UPDATE "Organization" o
SET "currentSubscribers" = (
    SELECT COUNT(*) FROM "Subscriber" s WHERE s."organizationId" = o."id" AND s."active" = true
)
WHERE o."id" = 'default-org-001';

SELECT 'Migration completed successfully!' as result;

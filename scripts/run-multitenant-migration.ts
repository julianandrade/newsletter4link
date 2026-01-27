import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// For migrations, use the DIRECT_URL which bypasses connection pooling
const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

async function runMigration() {
  console.log("Starting multi-tenant migration...");

  try {
    // Step 1: Create Organization table
    console.log("Creating Organization table...");
    await prisma.$executeRawUnsafe(`
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
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Organization_customDomain_key" ON "Organization"("customDomain")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization"("slug")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Organization_plan_idx" ON "Organization"("plan")`
    );

    // Step 2: Create OrgUser table
    console.log("Creating OrgUser table...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrgUser" (
        "id" TEXT NOT NULL,
        "supabaseUserId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'VIEWER',
        "organizationId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrgUser_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "OrgUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "OrgUser_organizationId_supabaseUserId_key" ON "OrgUser"("organizationId", "supabaseUserId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "OrgUser_supabaseUserId_idx" ON "OrgUser"("supabaseUserId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "OrgUser_organizationId_idx" ON "OrgUser"("organizationId")`
    );

    // Step 3: Create OrgInvite table
    console.log("Creating OrgInvite table...");
    await prisma.$executeRawUnsafe(`
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
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "OrgInvite_token_key" ON "OrgInvite"("token")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "OrgInvite_email_idx" ON "OrgInvite"("email")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "OrgInvite_organizationId_idx" ON "OrgInvite"("organizationId")`
    );

    // Step 4: Create OrgSettings table
    console.log("Creating OrgSettings table...");
    await prisma.$executeRawUnsafe(`
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
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId")`
    );

    // Step 5: Create BrandVoice table
    console.log("Creating BrandVoice table...");
    await prisma.$executeRawUnsafe(`
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
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "BrandVoice_organizationId_idx" ON "BrandVoice"("organizationId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "BrandVoice_isDefault_idx" ON "BrandVoice"("isDefault")`
    );

    // Step 6: Create default organization
    console.log("Creating default organization...");
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Organization" ("id", "name", "slug", "plan", "industry", "subscriberLimit", "createdAt", "updatedAt")
      VALUES ('default-org-001', 'Link Consulting', 'link-consulting', 'ENTERPRISE', 'TECHNOLOGY', 100000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING
    `);

    // Create default org settings
    await prisma.$executeRawUnsafe(`
      INSERT INTO "OrgSettings" ("id", "organizationId", "newsletterName", "fromEmail", "fromName", "primaryColor", "defaultLanguage", "createdAt", "updatedAt")
      VALUES ('default-settings-001', 'default-org-001', 'Link AI Newsletter', 'newsletter@julianandrade.net', 'Link Consulting AI Newsletter', '#3B82F6', 'en', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("organizationId") DO NOTHING
    `);

    // Step 7: Add organizationId columns to existing tables
    console.log("Adding organizationId columns...");
    const tables = [
      "Article",
      "Project",
      "Edition",
      "Subscriber",
      "RSSSource",
      "CurationJob",
      "EmailTemplate",
      "MediaAsset",
    ];

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "organizationId" TEXT`
        );
      } catch (e) {
        console.log(`Column may already exist in ${table}`);
      }
    }

    // Step 8: Update existing records to use default organization
    console.log("Updating existing records with default organization...");
    for (const table of tables) {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "organizationId" = 'default-org-001' WHERE "organizationId" IS NULL`
      );
      console.log(`  Updated ${table}: ${result} rows`);
    }

    // Step 9: Make organizationId columns NOT NULL
    console.log("Making organizationId columns required...");
    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" ALTER COLUMN "organizationId" SET NOT NULL`
        );
      } catch (e) {
        console.log(`  ${table}: column already NOT NULL or error`);
      }
    }

    // Step 10: Add foreign key constraints
    console.log("Adding foreign key constraints...");
    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "${table}"
          ADD CONSTRAINT "${table}_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
      } catch (e) {
        console.log(`  ${table}: constraint may already exist`);
      }
    }

    // Step 11: Add indexes
    console.log("Adding indexes...");
    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "${table}_organizationId_idx" ON "${table}"("organizationId")`
        );
      } catch (e) {
        console.log(`  ${table}: index may already exist`);
      }
    }

    // Step 12: Update unique constraints
    console.log("Updating unique constraints...");

    // Drop old unique constraints if they exist
    const constraintsToDrop = [
      { table: "Article", constraint: "Article_sourceUrl_key" },
      { table: "Subscriber", constraint: "Subscriber_email_key" },
      { table: "RSSSource", constraint: "RSSSource_feedUrl_key" },
      { table: "Edition", constraint: "Edition_week_year_key" },
      { table: "EmailTemplate", constraint: "EmailTemplate_name_key" },
    ];

    for (const { table, constraint } of constraintsToDrop) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`
        );
      } catch (e) {
        // Constraint may not exist
      }
    }

    // Add new compound unique constraints
    try {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Article_sourceUrl_organizationId_key" ON "Article"("sourceUrl", "organizationId")`
      );
    } catch (e) {
      console.log("  Article compound unique may already exist");
    }

    try {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Subscriber_email_organizationId_key" ON "Subscriber"("email", "organizationId")`
      );
    } catch (e) {
      console.log("  Subscriber compound unique may already exist");
    }

    try {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "RSSSource_feedUrl_organizationId_key" ON "RSSSource"("feedUrl", "organizationId")`
      );
    } catch (e) {
      console.log("  RSSSource compound unique may already exist");
    }

    try {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Edition_week_year_organizationId_key" ON "Edition"("week", "year", "organizationId")`
      );
    } catch (e) {
      console.log("  Edition compound unique may already exist");
    }

    try {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_name_organizationId_key" ON "EmailTemplate"("name", "organizationId")`
      );
    } catch (e) {
      console.log("  EmailTemplate compound unique may already exist");
    }

    // Step 13: Update organization subscriber count
    console.log("Updating subscriber count...");
    await prisma.$executeRawUnsafe(`
      UPDATE "Organization" o
      SET "currentSubscribers" = (
        SELECT COUNT(*) FROM "Subscriber" s WHERE s."organizationId" = o."id" AND s."active" = true
      )
      WHERE o."id" = 'default-org-001'
    `);

    console.log("\n✅ Multi-tenant migration completed successfully!");

    // Verify migration
    const org = await prisma.$queryRawUnsafe(
      `SELECT * FROM "Organization" WHERE id = 'default-org-001'`
    );
    console.log("\nDefault organization:", JSON.stringify(org, null, 2));
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();

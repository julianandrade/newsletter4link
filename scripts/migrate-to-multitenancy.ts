/**
 * Migration Script: Convert existing single-tenant data to multi-tenant
 *
 * This script:
 * 1. Creates a default "Link Consulting" organization
 * 2. Migrates all existing data to belong to this organization
 * 3. Links existing Supabase auth users as organization owners
 *
 * Run with: npx tsx scripts/migrate-to-multitenancy.ts
 *
 * IMPORTANT: This script is idempotent - safe to run multiple times
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

const DEFAULT_ORG = {
  name: "Link Consulting",
  slug: "link-consulting",
  industry: "TECHNOLOGY" as const,
  plan: "PROFESSIONAL" as const, // Give existing org full features
};

async function main() {
  console.log("🚀 Starting multi-tenancy migration...\n");

  // Step 1: Create or get default organization
  console.log("Step 1: Creating default organization...");
  let organization = await prisma.organization.findUnique({
    where: { slug: DEFAULT_ORG.slug },
  });

  if (organization) {
    console.log(`  ✓ Organization "${organization.name}" already exists (id: ${organization.id})`);
  } else {
    organization = await prisma.organization.create({
      data: {
        ...DEFAULT_ORG,
        settings: {
          create: {},
        },
      },
    });
    console.log(`  ✓ Created organization "${organization.name}" (id: ${organization.id})`);
  }

  const orgId = organization.id;

  // Step 2: Migrate existing data to organization
  console.log("\nStep 2: Migrating existing data...");

  // Migrate Articles
  const articlesResult = await prisma.article.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${articlesResult.count} articles`);

  // Migrate Projects
  const projectsResult = await prisma.project.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${projectsResult.count} projects`);

  // Migrate Editions
  const editionsResult = await prisma.edition.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${editionsResult.count} editions`);

  // Migrate Subscribers
  const subscribersResult = await prisma.subscriber.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${subscribersResult.count} subscribers`);

  // Update subscriber count on org
  const subscriberCount = await prisma.subscriber.count({
    where: { organizationId: orgId, active: true },
  });
  await prisma.organization.update({
    where: { id: orgId },
    data: { currentSubscribers: subscriberCount },
  });

  // Migrate RSS Sources
  const rssResult = await prisma.rSSSource.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${rssResult.count} RSS sources`);

  // Migrate Curation Jobs
  const jobsResult = await prisma.curationJob.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${jobsResult.count} curation jobs`);

  // Migrate Email Templates
  const templatesResult = await prisma.emailTemplate.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${templatesResult.count} email templates`);

  // Migrate Media Assets
  const mediaResult = await prisma.mediaAsset.updateMany({
    where: { organizationId: { equals: undefined as unknown as string } },
    data: { organizationId: orgId },
  });
  console.log(`  ✓ Migrated ${mediaResult.count} media assets`);

  // Step 3: Migrate global settings to org settings
  console.log("\nStep 3: Migrating settings...");
  const globalSettings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  if (globalSettings) {
    await prisma.orgSettings.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        relevanceThreshold: globalSettings.relevanceThreshold,
        maxArticlesPerEdition: globalSettings.maxArticlesPerEdition,
        vectorSimilarityThreshold: globalSettings.vectorSimilarityThreshold,
        articleMaxAgeDays: globalSettings.articleMaxAgeDays,
        aiModel: globalSettings.aiModel,
        embeddingModel: globalSettings.embeddingModel,
        brandVoicePrompt: globalSettings.brandVoicePrompt,
      },
      update: {
        relevanceThreshold: globalSettings.relevanceThreshold,
        maxArticlesPerEdition: globalSettings.maxArticlesPerEdition,
        vectorSimilarityThreshold: globalSettings.vectorSimilarityThreshold,
        articleMaxAgeDays: globalSettings.articleMaxAgeDays,
        aiModel: globalSettings.aiModel,
        embeddingModel: globalSettings.embeddingModel,
        brandVoicePrompt: globalSettings.brandVoicePrompt,
      },
    });
    console.log("  ✓ Migrated global settings to org settings");
  }

  // Migrate branding settings if they exist
  const brandingSettings = await prisma.$queryRaw<Array<{ logoUrl: string | null; bannerUrl: string | null }>>`
    SELECT "logoUrl", "bannerUrl" FROM "BrandingSettings" WHERE id = 'default' LIMIT 1
  `.catch(() => null);

  if (brandingSettings && brandingSettings.length > 0) {
    await prisma.orgSettings.update({
      where: { organizationId: orgId },
      data: {
        logoUrl: brandingSettings[0].logoUrl,
        bannerUrl: brandingSettings[0].bannerUrl,
      },
    });
    console.log("  ✓ Migrated branding settings to org settings");
  }

  // Step 4: Link Supabase users as organization owners
  console.log("\nStep 4: Linking Supabase users...");

  // Try to get Supabase users if env vars are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: users, error } = await supabase.auth.admin.listUsers();

      if (error) {
        console.log(`  ⚠ Could not list Supabase users: ${error.message}`);
      } else if (users?.users) {
        for (const user of users.users) {
          // Check if already a member
          const existingMember = await prisma.orgUser.findUnique({
            where: {
              supabaseUserId_organizationId: {
                supabaseUserId: user.id,
                organizationId: orgId,
              },
            },
          });

          if (!existingMember) {
            await prisma.orgUser.create({
              data: {
                supabaseUserId: user.id,
                email: user.email ?? "unknown@example.com",
                name: user.user_metadata?.full_name ?? null,
                role: "OWNER",
                organizationId: orgId,
              },
            });
            console.log(`  ✓ Added ${user.email} as OWNER`);
          } else {
            console.log(`  ✓ User ${user.email} already linked`);
          }
        }
      }
    } catch (error) {
      console.log(`  ⚠ Error linking Supabase users: ${error}`);
    }
  } else {
    console.log("  ⚠ SUPABASE_SERVICE_ROLE_KEY not set - skipping user linking");
    console.log("    You can manually add users via the OrgUser table");
  }

  // Step 5: Summary
  console.log("\n✅ Migration complete!\n");

  const stats = {
    articles: await prisma.article.count({ where: { organizationId: orgId } }),
    projects: await prisma.project.count({ where: { organizationId: orgId } }),
    editions: await prisma.edition.count({ where: { organizationId: orgId } }),
    subscribers: await prisma.subscriber.count({ where: { organizationId: orgId } }),
    rssSources: await prisma.rSSSource.count({ where: { organizationId: orgId } }),
    templates: await prisma.emailTemplate.count({ where: { organizationId: orgId } }),
    members: await prisma.orgUser.count({ where: { organizationId: orgId } }),
  };

  console.log("Organization Summary:");
  console.log(`  Name: ${organization.name}`);
  console.log(`  Slug: ${organization.slug}`);
  console.log(`  Plan: ${organization.plan}`);
  console.log(`  Industry: ${organization.industry}`);
  console.log(`  Articles: ${stats.articles}`);
  console.log(`  Projects: ${stats.projects}`);
  console.log(`  Editions: ${stats.editions}`);
  console.log(`  Subscribers: ${stats.subscribers}`);
  console.log(`  RSS Sources: ${stats.rssSources}`);
  console.log(`  Templates: ${stats.templates}`);
  console.log(`  Members: ${stats.members}`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Seed for the CI e2e suite (tests/*.spec.ts).
 *
 * Creates the auth user the specs log in with, an organization with
 * membership + settings, and enough content (approved articles, a
 * subscriber) for the dashboard flows to work. Idempotent: safe to re-run.
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * DATABASE_URL.
 *
 * Usage: npx tsx tests/e2e/seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../../lib/db";

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "Test1234!";

async function ensureAuthUser(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (created.data.user) {
    console.log(`Auth user created: ${created.data.user.id}`);
    return created.data.user.id;
  }

  // Already exists (idempotent re-run): look it up.
  const list = await admin.auth.admin.listUsers();
  const existing = list.data.users.find((u) => u.email === TEST_EMAIL);
  if (!existing) {
    throw new Error(
      `Could not create or find auth user: ${created.error?.message}`
    );
  }
  console.log(`Auth user already exists: ${existing.id}`);
  return existing.id;
}

async function main() {
  const supabaseUserId = await ensureAuthUser();

  let organization = await prisma.organization.findUnique({
    where: { slug: "e2e-org" },
  });
  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        name: "E2E Test Org",
        slug: "e2e-org",
        settings: { create: {} },
      },
    });
  }

  await prisma.orgUser.upsert({
    where: {
      supabaseUserId_organizationId: {
        supabaseUserId,
        organizationId: organization.id,
      },
    },
    create: {
      supabaseUserId,
      email: TEST_EMAIL,
      role: "OWNER",
      organizationId: organization.id,
    },
    update: { role: "OWNER" },
  });

  // Fresh approved articles so the send/generate flows have content.
  // publishedAt must be recent (freshness filters exclude >14 days).
  const now = Date.now();
  const articles = [
    {
      title: "E2E: Agentic coding assistants reach enterprise scale",
      summary:
        "Sample summary for e2e tests: agentic coding tools are being adopted across large engineering organizations.",
      sourceUrl: "https://example.com/e2e-article-1",
      relevanceScore: 9.1,
    },
    {
      title: "E2E: Open-weight models close the benchmark gap",
      summary:
        "Sample summary for e2e tests: open-weight releases now match proprietary models on common evals.",
      sourceUrl: "https://example.com/e2e-article-2",
      relevanceScore: 8.4,
    },
    {
      title: "E2E: Retrieval pipelines move to hybrid ranking",
      summary:
        "Sample summary for e2e tests: hybrid lexical-vector ranking is becoming the default for production RAG.",
      sourceUrl: "https://example.com/e2e-article-3",
      relevanceScore: 7.6,
    },
  ];

  for (const [i, article] of articles.entries()) {
    await prisma.article.upsert({
      where: {
        sourceUrl_organizationId: {
          sourceUrl: article.sourceUrl,
          organizationId: organization.id,
        },
      },
      create: {
        ...article,
        content: article.summary,
        publishedAt: new Date(now - (i + 1) * 24 * 60 * 60 * 1000),
        status: "APPROVED",
        category: ["AI News"],
        organizationId: organization.id,
      },
      update: {
        status: "APPROVED",
        publishedAt: new Date(now - (i + 1) * 24 * 60 * 60 * 1000),
      },
    });
  }

  await prisma.subscriber.upsert({
    where: {
      email_organizationId: {
        email: "subscriber@example.com",
        organizationId: organization.id,
      },
    },
    create: {
      email: "subscriber@example.com",
      name: "Seed Subscriber",
      active: true,
      organizationId: organization.id,
    },
    update: { active: true },
  });

  console.log(
    `Seeded org ${organization.id}: ${articles.length} approved articles, 1 subscriber`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

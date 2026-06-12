/**
 * Seed for the CI e2e suite (tests/*.spec.ts).
 *
 * Auth migration (docs/MIGRATION-GCP.md Phase 2): the e2e user is now a plain
 * OrgUser row keyed on a synthetic Entra identity — NO Supabase GoTrue admin
 * calls. The specs sign in via the Auth.js Credentials provider (enabled by
 * E2E_TEST_MODE), which returns `id: "e2e:<email>"`; that value is what we store
 * as `entraOid` here so lib/auth/context.ts resolves the membership directly.
 *
 * Creates the org (ENTERPRISE) with membership + settings and enough content
 * (approved articles, a subscriber, a draft edition) for the dashboard flows.
 * Idempotent: safe to re-run.
 *
 * Required env: DATABASE_URL.
 *
 * Usage: npx tsx tests/e2e/seed.ts
 */
import { prisma } from "../../lib/db";
import { getWeekNumber } from "../../lib/dates";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "test@example.com";
// Synthetic Entra identity matching the Credentials provider's returned id
// (auth.ts / auth.config.ts: `e2e:${email}`).
const TEST_ENTRA_OID = `e2e:${TEST_EMAIL}`;

async function main() {

  // ENTERPRISE: the specs exercise Ghost Writer (generation) and Trend Radar
  // (search), which are plan-gated and hidden from the UI on FREE.
  let organization = await prisma.organization.findUnique({
    where: { slug: "e2e-org" },
  });
  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        name: "E2E Test Org",
        slug: "e2e-org",
        plan: "ENTERPRISE",
        settings: { create: {} },
      },
    });
  } else if (organization.plan !== "ENTERPRISE") {
    organization = await prisma.organization.update({
      where: { id: organization.id },
      data: { plan: "ENTERPRISE" },
    });
  }

  await prisma.orgUser.upsert({
    where: {
      entraOid_organizationId: {
        entraOid: TEST_ENTRA_OID,
        organizationId: organization.id,
      },
    },
    create: {
      entraOid: TEST_ENTRA_OID,
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

  // A draft edition for the current week with the articles attached, so the
  // send and generate pages have an edition to open/select (the specs'
  // create-edition fallback flow is flaky against an empty list).
  const today = new Date();
  const week = getWeekNumber(today);
  const year = today.getFullYear();

  let edition = await prisma.edition.findFirst({
    where: { organizationId: organization.id, week, year },
  });
  if (!edition) {
    edition = await prisma.edition.create({
      data: {
        week,
        year,
        status: "DRAFT",
        organizationId: organization.id,
      },
    });
  }

  const seededArticles = await prisma.article.findMany({
    where: {
      organizationId: organization.id,
      sourceUrl: { startsWith: "https://example.com/e2e-article-" },
    },
    orderBy: { relevanceScore: "desc" },
  });
  for (const [order, article] of seededArticles.entries()) {
    await prisma.editionArticle.upsert({
      where: {
        editionId_articleId: { editionId: edition.id, articleId: article.id },
      },
      create: { editionId: edition.id, articleId: article.id, order },
      update: { order },
    });
  }

  console.log(
    `Seeded org ${organization.id} (ENTERPRISE): ${articles.length} approved articles, 1 subscriber, edition week ${week}/${year}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

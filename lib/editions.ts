import { prisma } from "@/lib/db";
import { createTenantClient } from "@/lib/db/tenant";
import { config } from "@/lib/config";

/**
 * Monday-EOD auto-finalization of the weekly edition.
 *
 * The weekly workflow is: editors get a Monday-morning reminder and can
 * curate/finalize the edition by hand during the day; at end of day this
 * promotes whatever is ready so Tuesday morning's send always has a
 * finalized edition:
 *  - already FINALIZED/SENT        -> untouched
 *  - human DRAFT with articles     -> finalized as-is (their picks win)
 *  - empty DRAFT / no edition      -> built from fresh approved articles
 *  - nothing fresh and approved    -> skipped (no newsletter that week)
 */

// Same freshness rule as manual default sends: never auto-pick stale news.
const FRESHNESS_WINDOW_DAYS = 14;

export type AutoFinalizeResult =
  | { action: "skipped"; reason: string }
  | { action: "finalized"; editionId: string; articles: number; projects: number };

export async function autoFinalizeWeeklyEdition(
  organizationId: string,
  week: number,
  year: number
): Promise<AutoFinalizeResult> {
  const db = createTenantClient(organizationId);

  let edition = await db.edition.findFirst({ where: { week, year } });

  if (edition && edition.status !== "DRAFT") {
    return {
      action: "skipped",
      reason: edition.status === "SENT" ? "Already sent" : "Already finalized by editor",
    };
  }

  const existingArticleCount = edition
    ? await prisma.editionArticle.count({ where: { editionId: edition.id } })
    : 0;

  // Empty/missing edition: pick this week's content automatically.
  let topArticles: Array<{ id: string }> = [];
  if (existingArticleCount === 0) {
    const freshSince = new Date();
    freshSince.setDate(freshSince.getDate() - FRESHNESS_WINDOW_DAYS);

    topArticles = await db.article.findMany({
      where: {
        status: "APPROVED",
        editions: { none: {} },
        publishedAt: { gte: freshSince },
      },
      orderBy: [{ relevanceScore: "desc" }, { publishedAt: "desc" }],
      take: config.curation.maxArticlesPerEdition,
    });

    if (topArticles.length === 0) {
      return { action: "skipped", reason: "No fresh approved articles" };
    }
  }

  if (!edition) {
    edition = await db.edition.create({
      data: {
        week,
        year,
        status: "FINALIZED",
        finalizedAt: new Date(),
      } as never,
    });
  } else {
    await prisma.edition.update({
      where: { id: edition.id },
      data: { status: "FINALIZED", finalizedAt: new Date() },
    });
  }

  for (let i = 0; i < topArticles.length; i++) {
    await prisma.editionArticle.upsert({
      where: {
        editionId_articleId: {
          editionId: edition.id,
          articleId: topArticles[i].id,
        },
      },
      create: { editionId: edition.id, articleId: topArticles[i].id, order: i },
      update: { order: i },
    });
  }

  // Featured projects: only fill when the editor hasn't attached any.
  const existingProjectCount = await prisma.editionProject.count({
    where: { editionId: edition.id },
  });
  let projectsAdded = 0;
  if (existingProjectCount === 0) {
    const featuredProjects = await db.project.findMany({
      where: { featured: true },
      orderBy: { projectDate: "desc" },
      take: 3,
    });
    for (let i = 0; i < featuredProjects.length; i++) {
      await prisma.editionProject.upsert({
        where: {
          editionId_projectId: {
            editionId: edition.id,
            projectId: featuredProjects[i].id,
          },
        },
        create: { editionId: edition.id, projectId: featuredProjects[i].id, order: i },
        update: { order: i },
      });
    }
    projectsAdded = featuredProjects.length;
  }

  return {
    action: "finalized",
    editionId: edition.id,
    articles: existingArticleCount > 0 ? existingArticleCount : topArticles.length,
    projects: existingProjectCount > 0 ? existingProjectCount : projectsAdded,
  };
}

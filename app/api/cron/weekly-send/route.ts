import { NextResponse } from "next/server";
import { sendNewsletterToAll } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { markEditionAsSent } from "@/lib/queries";
import { createTenantClient } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/weekly-send
 * Triggered by Vercel Cron every Sunday at 12:00 UTC
 * Auto-finalizes edition and sends newsletter for all organizations
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get("authorization");
    if (config.cron.secret) {
      if (authHeader !== `Bearer ${config.cron.secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.log("[CRON] Starting weekly newsletter send for all organizations...");

    const now = new Date();
    const week = getWeekNumber(now);
    const year = now.getFullYear();

    // Get all organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    const results: Array<{
      organizationId: string;
      organizationName: string;
      sent: number;
      failed: number;
      skipped: boolean;
      error?: string;
    }> = [];

    for (const org of organizations) {
      try {
        console.log(`[CRON] Processing organization: ${org.name}`);
        const db = createTenantClient(org.id);

        // Get or create edition for this week
        let edition = await db.edition.findFirst({
          where: { week, year },
        });

        // Get related data separately since TenantClient doesn't support deep includes
        let editionArticles: any[] = [];
        let editionProjects: any[] = [];

        if (edition) {
          editionArticles = await prisma.editionArticle.findMany({
            where: { editionId: edition.id },
            include: { article: true },
            orderBy: { order: "asc" },
          });
          editionProjects = await prisma.editionProject.findMany({
            where: { editionId: edition.id },
            include: { project: true },
            orderBy: { order: "asc" },
          });
        }

        // If edition doesn't exist or not finalized, auto-finalize
        if (!edition || edition.status === "DRAFT") {
          console.log(`[CRON] ${org.name}: Edition not finalized, auto-finalizing...`);

          // Get top approved articles for this org
          const topArticles = await db.article.findMany({
            where: { status: "APPROVED" },
            orderBy: [
              { relevanceScore: "desc" },
              { publishedAt: "desc" },
            ],
            take: config.curation.maxArticlesPerEdition,
          });

          // Get featured projects for this org
          const featuredProjects = await db.project.findMany({
            where: { featured: true },
            orderBy: { projectDate: "desc" },
            take: 3,
          });

          if (topArticles.length === 0) {
            console.log(`[CRON] ${org.name}: No approved articles, skipping`);
            results.push({
              organizationId: org.id,
              organizationName: org.name,
              sent: 0,
              failed: 0,
              skipped: true,
              error: "No approved articles",
            });
            continue;
          }

          // Create or update edition
          if (!edition) {
            edition = await db.edition.create({
              data: {
                week,
                year,
                status: "FINALIZED",
                finalizedAt: new Date(),
              } as any,
            });
          } else {
            await prisma.edition.update({
              where: { id: edition.id },
              data: {
                status: "FINALIZED",
                finalizedAt: new Date(),
              },
            });
          }

          // Add articles to edition
          for (let i = 0; i < topArticles.length; i++) {
            await prisma.editionArticle.upsert({
              where: {
                editionId_articleId: {
                  editionId: edition.id,
                  articleId: topArticles[i].id,
                },
              },
              create: {
                editionId: edition.id,
                articleId: topArticles[i].id,
                order: i,
              },
              update: {
                order: i,
              },
            });
          }

          // Add projects to edition
          for (let i = 0; i < featuredProjects.length; i++) {
            await prisma.editionProject.upsert({
              where: {
                editionId_projectId: {
                  editionId: edition.id,
                  projectId: featuredProjects[i].id,
                },
              },
              create: {
                editionId: edition.id,
                projectId: featuredProjects[i].id,
                order: i,
              },
              update: {
                order: i,
              },
            });
          }

          // Reload edition data
          editionArticles = await prisma.editionArticle.findMany({
            where: { editionId: edition.id },
            include: { article: true },
            orderBy: { order: "asc" },
          });
          editionProjects = await prisma.editionProject.findMany({
            where: { editionId: edition.id },
            include: { project: true },
            orderBy: { order: "asc" },
          });

          console.log(
            `[CRON] ${org.name}: Auto-finalized with ${topArticles.length} articles and ${featuredProjects.length} projects`
          );
        }

        // Check if already sent
        if (edition!.status === "SENT") {
          console.log(`[CRON] ${org.name}: Edition already sent, skipping`);
          results.push({
            organizationId: org.id,
            organizationName: org.name,
            sent: 0,
            failed: 0,
            skipped: true,
            error: "Already sent",
          });
          continue;
        }

        // Prepare email data
        const emailData = {
          articles: editionArticles.map((ea: any) => ({
            title: ea.article.title,
            summary: ea.article.summary || "",
            sourceUrl: ea.article.sourceUrl,
            category: ea.article.category,
          })),
          projects: editionProjects.map((ep: any) => ({
            name: ep.project.name,
            description: ep.project.description,
            team: ep.project.team,
            impact: ep.project.impact || undefined,
            projectDate: ep.project.projectDate.toISOString(),
          })),
          week: edition!.week,
          year: edition!.year,
        };

        // Get subscriber count for this org
        const subscriberCount = await db.subscriber.count({
          where: { active: true },
        });

        if (subscriberCount === 0) {
          console.log(`[CRON] ${org.name}: No active subscribers, skipping`);
          results.push({
            organizationId: org.id,
            organizationName: org.name,
            sent: 0,
            failed: 0,
            skipped: true,
            error: "No subscribers",
          });
          continue;
        }

        console.log(`[CRON] ${org.name}: Sending to ${subscriberCount} subscribers...`);

        // Send to all subscribers in this org
        const result = await sendNewsletterToAll(emailData, edition!.id);

        // Mark edition as sent
        if (result.sent > 0) {
          await markEditionAsSent(edition!.id);
        }

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          sent: result.sent,
          failed: result.failed,
          skipped: false,
        });

        console.log(
          `[CRON] ${org.name}: ${result.sent} sent, ${result.failed} failed`
        );
      } catch (error) {
        console.error(`[CRON] Error for ${org.name}:`, error);
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          sent: 0,
          failed: 0,
          skipped: true,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    console.log("[CRON] Weekly newsletter send complete for all organizations");

    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

    return NextResponse.json({
      success: true,
      message: `Newsletter sent to ${totalSent} total subscribers across ${organizations.length} organizations`,
      data: {
        week,
        year,
        totalSent,
        totalFailed,
        results,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON] Weekly send failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

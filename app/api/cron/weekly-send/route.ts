import { NextResponse } from "next/server";
import { sendNewsletterToAll } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { markEditionAsSent } from "@/lib/queries";
import { createTenantClient } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { getWeekNumber } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/weekly-send
 * Triggered by Vercel Cron (see vercel.json for the schedule)
 *
 * Sends the week's edition for every organization — but ONLY if a human has
 * finalized it in the dashboard. Editions that are missing or still DRAFT are
 * skipped: article curation is automated (incl. auto-approval of top scores),
 * the weekly send itself is deliberately human-gated.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (fail closed: reject if unset or mismatched)
    const authHeader = request.headers.get("authorization");
    if (!config.cron.secret || authHeader !== `Bearer ${config.cron.secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logger.info("[CRON] Starting weekly newsletter send for all organizations...");

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
        logger.info(`[CRON] Processing organization: ${org.name}`);
        const db = createTenantClient(org.id);

        // Get this week's edition
        const edition = await db.edition.findFirst({
          where: { week, year },
        });

        // Human gate: only send editions a person finalized in the dashboard.
        if (!edition || edition.status === "DRAFT") {
          logger.info(
            `[CRON] ${org.name}: No human-finalized edition for week ${week}, skipping`
          );
          results.push({
            organizationId: org.id,
            organizationName: org.name,
            sent: 0,
            failed: 0,
            skipped: true,
            error: "Edition not finalized (human approval required)",
          });
          continue;
        }

        // Get related data separately since TenantClient doesn't support deep includes
        const editionArticles = await prisma.editionArticle.findMany({
          where: { editionId: edition.id },
          include: { article: true },
          orderBy: { order: "asc" },
        });
        const editionProjects = await prisma.editionProject.findMany({
          where: { editionId: edition.id },
          include: { project: true },
          orderBy: { order: "asc" },
        });

        if (editionArticles.length === 0) {
          logger.info(`[CRON] ${org.name}: Finalized edition has no articles, skipping`);
          results.push({
            organizationId: org.id,
            organizationName: org.name,
            sent: 0,
            failed: 0,
            skipped: true,
            error: "Finalized edition has no articles",
          });
          continue;
        }

        // Check if already sent
        if (edition.status === "SENT") {
          logger.info(`[CRON] ${org.name}: Edition already sent, skipping`);
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
          week: edition.week,
          year: edition.year,
        };

        // Get subscriber count for this org
        const subscriberCount = await db.subscriber.count({
          where: { active: true },
        });

        if (subscriberCount === 0) {
          logger.info(`[CRON] ${org.name}: No active subscribers, skipping`);
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

        logger.info(`[CRON] ${org.name}: Sending to ${subscriberCount} subscribers...`);

        // Send to all subscribers in this org
        const result = await sendNewsletterToAll(emailData, edition.id);

        // Mark edition as sent
        if (result.sent > 0) {
          await markEditionAsSent(edition.id);
        }

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          sent: result.sent,
          failed: result.failed,
          skipped: false,
        });

        logger.info(`[CRON] ${org.name}: ${result.sent} sent, ${result.failed} failed`);
      } catch (error) {
        logger.error(`[CRON] Error for ${org.name}:`, error);
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

    logger.info("[CRON] Weekly newsletter send complete for all organizations");

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
    logger.error("[CRON] Weekly send failed", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

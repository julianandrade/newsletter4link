import { NextResponse } from "next/server";
import { sendNewsletterToAll } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { markEditionAsSent } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/cron/weekly-send
 * Triggered by Vercel Cron every Sunday at 12:00 UTC
 * Auto-finalizes edition and sends newsletter
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

    console.log("[CRON] Starting weekly newsletter send...");

    const now = new Date();
    const week = getWeekNumber(now);
    const year = now.getFullYear();

    // Get or create edition for this week
    let edition = await prisma.edition.findUnique({
      where: {
        week_year: { week, year },
      },
      include: {
        articles: {
          include: { article: true },
          orderBy: { order: "asc" },
        },
        projects: {
          include: { project: true },
          orderBy: { order: "asc" },
        },
      },
    });

    // If edition doesn't exist or not finalized, auto-finalize
    if (!edition || edition.status === "DRAFT") {
      console.log("[CRON] Edition not finalized, auto-finalizing with top articles...");

      // Get top approved articles
      const topArticles = await prisma.article.findMany({
        where: { status: "APPROVED" },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: config.curation.maxArticlesPerEdition,
      });

      // Get featured projects
      const featuredProjects = await prisma.project.findMany({
        where: { featured: true },
        orderBy: { projectDate: "desc" },
        take: 3,
      });

      if (topArticles.length === 0) {
        console.log("[CRON] No approved articles found, skipping send");
        return NextResponse.json({
          success: false,
          error: "No approved articles found for this week",
          timestamp: new Date().toISOString(),
        });
      }

      // Create or update edition
      if (!edition) {
        edition = await prisma.edition.create({
          data: {
            week,
            year,
            status: "FINALIZED",
            finalizedAt: new Date(),
          },
          include: {
            articles: {
              include: { article: true },
              orderBy: { order: "asc" },
            },
            projects: {
              include: { project: true },
              orderBy: { order: "asc" },
            },
          },
        });
      } else {
        edition = await prisma.edition.update({
          where: { id: edition.id },
          data: {
            status: "FINALIZED",
            finalizedAt: new Date(),
          },
          include: {
            articles: {
              include: { article: true },
              orderBy: { order: "asc" },
            },
            projects: {
              include: { project: true },
              orderBy: { order: "asc" },
            },
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

      // Reload edition with articles and projects
      edition = await prisma.edition.findUnique({
        where: { id: edition.id },
        include: {
          articles: {
            include: { article: true },
            orderBy: { order: "asc" },
          },
          projects: {
            include: { project: true },
            orderBy: { order: "asc" },
          },
        },
      });

      console.log(
        `[CRON] Auto-finalized edition with ${topArticles.length} articles and ${featuredProjects.length} projects`
      );
    }

    // Check if already sent
    if (edition!.status === "SENT") {
      console.log("[CRON] Edition already sent, skipping");
      return NextResponse.json({
        success: false,
        error: "This edition has already been sent",
        timestamp: new Date().toISOString(),
      });
    }

    // Prepare email data
    const emailData = {
      articles: edition!.articles.map((ea: any) => ({
        title: ea.article.title,
        summary: ea.article.summary || "",
        sourceUrl: ea.article.sourceUrl,
        category: ea.article.category,
      })),
      projects: edition!.projects.map((ep: any) => ({
        name: ep.project.name,
        description: ep.project.description,
        team: ep.project.team,
        impact: ep.project.impact || undefined,
        projectDate: ep.project.projectDate.toISOString(),
      })),
      week: edition!.week,
      year: edition!.year,
    };

    // Get subscriber count
    const subscriberCount = await prisma.subscriber.count({
      where: { active: true },
    });

    if (subscriberCount === 0) {
      console.log("[CRON] No active subscribers, skipping send");
      return NextResponse.json({
        success: false,
        error: "No active subscribers found",
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[CRON] Sending newsletter to ${subscriberCount} subscribers...`);

    // Send to all subscribers
    const result = await sendNewsletterToAll(emailData, edition!.id);

    // Mark edition as sent
    if (result.sent > 0) {
      await markEditionAsSent(edition!.id);
    }

    console.log(
      `[CRON] Newsletter sent: ${result.sent} successful, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      message: `Newsletter sent to ${result.sent}/${result.sent + result.failed} subscribers`,
      data: {
        week,
        year,
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.slice(0, 5), // First 5 errors only
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

import { NextResponse } from "next/server";
import { sendNewsletterToAll } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { getCurrentEdition, markEditionAsSent } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/email/send-all
 * Send newsletter to all active subscribers
 *
 * Body: { editionId?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { editionId } = body;

    // Get edition
    let edition;
    if (editionId) {
      edition = await prisma.edition.findUnique({
        where: { id: editionId },
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
      // Get approved articles and featured projects
      const articles = await prisma.article.findMany({
        where: { status: "APPROVED" },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: 10,
      });

      const projects = await prisma.project.findMany({
        where: { featured: true },
        orderBy: { projectDate: "desc" },
        take: 3,
      });

      if (articles.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No approved articles found. Please approve some articles first.",
          },
          { status: 400 }
        );
      }

      // Create edition if doesn't exist
      const now = new Date();
      const week = getWeekNumber(now);
      const year = now.getFullYear();

      edition = await prisma.edition.upsert({
        where: {
          week_year: { week, year },
        },
        create: {
          week,
          year,
          status: "FINALIZED",
          finalizedAt: new Date(),
        },
        update: {},
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

      // Add articles and projects to edition if empty
      if (edition.articles.length === 0) {
        for (let i = 0; i < articles.length; i++) {
          await prisma.editionArticle.create({
            data: {
              editionId: edition.id,
              articleId: articles[i].id,
              order: i,
            },
          });
        }
      }

      if (edition.projects.length === 0) {
        for (let i = 0; i < projects.length; i++) {
          await prisma.editionProject.create({
            data: {
              editionId: edition.id,
              projectId: projects[i].id,
              order: i,
            },
          });
        }
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
    }

    if (!edition) {
      return NextResponse.json(
        {
          success: false,
          error: "Edition not found",
        },
        { status: 404 }
      );
    }

    // Check if already sent
    if (edition.status === "SENT") {
      return NextResponse.json(
        {
          success: false,
          error: "This edition has already been sent",
        },
        { status: 400 }
      );
    }

    // Get subscriber count
    const subscriberCount = await prisma.subscriber.count({
      where: { active: true },
    });

    if (subscriberCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active subscribers found",
        },
        { status: 400 }
      );
    }

    // Prepare email data
    const emailData = {
      articles: edition.articles.map((ea: any) => ({
        title: ea.article.title,
        summary: ea.article.summary || "",
        sourceUrl: ea.article.sourceUrl,
        category: ea.article.category,
      })),
      projects: edition.projects.map((ep: any) => ({
        name: ep.project.name,
        description: ep.project.description,
        team: ep.project.team,
        impact: ep.project.impact || undefined,
        projectDate: ep.project.projectDate.toISOString(),
      })),
      week: edition.week,
      year: edition.year,
    };

    console.log(
      `Starting batch send to ${subscriberCount} subscribers for Week ${edition.week}, ${edition.year}...`
    );

    // Send to all subscribers
    const result = await sendNewsletterToAll(emailData, edition.id);

    // Mark edition as sent
    if (result.sent > 0) {
      await markEditionAsSent(edition.id);
    }

    return NextResponse.json({
      success: result.success,
      message: `Newsletter sent to ${result.sent}/${result.sent + result.failed} subscribers`,
      data: {
        sent: result.sent,
        failed: result.failed,
        errors: result.errors.slice(0, 10), // Return first 10 errors
      },
    });
  } catch (error) {
    console.error("Error sending newsletter:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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

import { NextResponse } from "next/server";
import { renderNewsletterEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/email/preview
 * Generate preview HTML for the newsletter
 *
 * Body: { editionId?: string } or omit to use current edition
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { editionId } = body;

    // Get edition (use provided ID or get current)
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
      // Get approved articles
      const articles = await prisma.article.findMany({
        where: { status: "APPROVED" },
        orderBy: [
          { relevanceScore: "desc" },
          { publishedAt: "desc" },
        ],
        take: 10,
      });

      // Get featured projects
      const projects = await prisma.project.findMany({
        where: { featured: true },
        orderBy: { projectDate: "desc" },
        take: 3,
      });

      // Create temporary edition data
      const now = new Date();
      const week = getWeekNumber(now);
      const year = now.getFullYear();

      edition = {
        week,
        year,
        articles: articles.map((article: any, index: number) => ({
          article,
          order: index,
        })),
        projects: projects.map((project: any, index: number) => ({
          project,
          order: index,
        })),
      };
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

    // Prepare data for email
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
        impact: ep.project.impact,
        projectDate: ep.project.projectDate,
      })),
      week: edition.week,
      year: edition.year,
    };

    // Render HTML
    const html = await renderNewsletterEmail(emailData);

    return NextResponse.json({
      success: true,
      html,
      data: emailData,
    });
  } catch (error) {
    console.error("Error generating preview:", error);

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

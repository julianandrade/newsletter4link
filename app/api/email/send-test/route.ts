import { NextResponse } from "next/server";
import { sendTestNewsletter } from "@/lib/email/sender";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/email/send-test
 * Send a test newsletter to a specific email address
 *
 * Body: { email: string, editionId?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, editionId } = body;

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Email address is required",
        },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email format",
        },
        { status: 400 }
      );
    }

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

    // Prepare email data
    const now = new Date();
    const week = getWeekNumber(now);
    const year = now.getFullYear();

    const emailData = {
      articles: articles.map((article) => ({
        title: article.title,
        summary: article.summary || "",
        sourceUrl: article.sourceUrl,
        category: article.category,
      })),
      projects: projects.map((project) => ({
        name: project.name,
        description: project.description,
        team: project.team,
        impact: project.impact || undefined,
        projectDate: project.projectDate.toISOString(),
      })),
      week,
      year,
    };

    // Send test email
    const result = await sendTestNewsletter(email, emailData);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent to ${email}`,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to send test email",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error sending test email:", error);

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

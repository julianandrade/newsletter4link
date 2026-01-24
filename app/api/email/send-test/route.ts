import { NextResponse } from "next/server";
import { sendTestNewsletter, sendEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { renderTemplateById } from "@/lib/email/template-renderer";

export const dynamic = "force-dynamic";

/**
 * POST /api/email/send-test
 * Send a test newsletter to a specific email address
 *
 * Body: { email: string, editionId?: string, templateId?: string }
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, editionId, templateId } = body;

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
      articles: articles.map((article: any) => ({
        id: article.id,
        title: article.title,
        summary: article.summary || "",
        sourceUrl: article.sourceUrl,
        category: article.category,
        relevanceScore: article.relevanceScore,
      })),
      projects: projects.map((project: any) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        team: project.team,
        impact: project.impact || null,
        projectDate: project.projectDate.toISOString(),
      })),
      week,
      year,
    };

    // Send test email - use custom template if specified
    let result;
    if (templateId) {
      // Render using the custom template
      const templateResult = await renderTemplateById(templateId, emailData);
      if (!templateResult) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 }
        );
      }

      result = await sendEmail(
        email,
        `[TEST] Link AI Newsletter - Week ${week}, ${year}`,
        templateResult.html
      );
    } else {
      // Use the default React Email component
      result = await sendTestNewsletter(email, emailData);
    }

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

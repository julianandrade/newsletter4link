import { NextResponse } from "next/server";
import {
  sendTestNewsletter,
  sendEmail,
  renderNewsletterEmail,
  newsletterSubject,
} from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth/context";
import {
  renderTemplateById,
  injectCustomBlocks,
  type CustomBlock,
} from "@/lib/email/template-renderer";
import { isBuiltInTemplateId } from "@/lib/email/builtin-template";

export const dynamic = "force-dynamic";

interface CustomData {
  articles: Array<{
    title: string;
    summary: string;
    sourceUrl: string;
    category: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    team: string;
    impact?: string;
    projectDate?: string;
  }>;
  customBlocks?: CustomBlock[];
  week: number;
  year: number;
}

/**
 * POST /api/email/send-test
 * Send a test newsletter to a specific email address
 *
 * Body: { email: string, editionId?: string, templateId?: string, customData?: CustomData }
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 * - customData: custom edited data to use (optional, overrides database data)
 */
export async function POST(request: Request) {
  try {
    // RQ-003: needed for a template lookup scoped to this organization. The
    // rest of this route still reads through the untenanted client, which is a
    // separate pre-existing problem.
    const ctx = await requireOrgContext();
    const body = await request.json();
    const { email, editionId, templateId, customData } = body;

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

    let emailData: any;
    let week: number;
    let year: number;

    // Use custom data if provided, otherwise fetch from database
    if (customData) {
      // Using edited data from the email editor
      emailData = {
        articles: customData.articles,
        projects: customData.projects.map((p: any) => ({
          ...p,
          projectDate: p.projectDate || new Date().toISOString(),
        })),
        week: customData.week,
        year: customData.year,
        customBlocks: customData.customBlocks,
      };
      week = customData.week;
      year = customData.year;
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
      week = getWeekNumber(now);
      year = now.getFullYear();

      emailData = {
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
    }

    // Send test email - use custom template if specified
    let result;
    /**
     * RQ-003: honour which template is active.
     *
     * A send that names no template used the built-in edition unconditionally,
     * which is why the "Use this one" switch on the Templates screen did
     * nothing. The active stored template now wins; the built-in is used when
     * none is active, and when the built-in is explicitly named.
     */
    let effectiveTemplateId: string | null = templateId ?? null;
    if (!effectiveTemplateId) {
      const active = await ctx.db.emailTemplate.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      effectiveTemplateId = active?.id ?? null;
    }
    if (isBuiltInTemplateId(effectiveTemplateId)) {
      effectiveTemplateId = null;
    }

    if (effectiveTemplateId) {
      // Render using the custom template
      const templateResult = await renderTemplateById(effectiveTemplateId, emailData);
      if (!templateResult) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 }
        );
      }

      result = await sendEmail(
        email,
        `[TEST] ${newsletterSubject(emailData)}`,
        templateResult.html
      );
    } else if (customData?.customBlocks?.length) {
      // Built-in edition plus editor-authored blocks at the design's anchors.
      const html = injectCustomBlocks(
        await renderNewsletterEmail(emailData),
        customData.customBlocks
      );
      result = await sendEmail(email, `[TEST] ${newsletterSubject(emailData)}`, html);
    } else {
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

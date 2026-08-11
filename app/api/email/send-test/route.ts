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
import { isoWeekAndYear } from "@/lib/radar/week";
import { toEmailAside } from "@/lib/asides/select";

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
 * Body: { email: string, templateId?: string, customData?: CustomData,
 *         asideId?: string }
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 * - customData: custom edited data to use (optional, overrides database data)
 * - asideId: a closing "one more thing" block to include, so an editor can read a joke in
 *   a real inbox before it reaches eight hundred of them. This route builds from approved
 *   articles rather than from an edition, so there is no asideId to inherit.
 */
export async function POST(request: Request) {
  try {
    // RQ-003: needed for a template lookup scoped to this organization. The
    // rest of this route still reads through the untenanted client, which is a
    // separate pre-existing problem.
    const ctx = await requireOrgContext();
    const body = await request.json();
    const { email, templateId, asideId } = body;
    const customData: CustomData | undefined = body.customData;

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
      // Discarded rows are out. See lib/db/tenant.ts.
      const articles = await prisma.article.findMany({
        where: { discardedAt: null, status: "APPROVED" },
        orderBy: [
          { relevanceScore: "desc" },
          // Finding C1: nulls last, so an undated article does not head the list.
          { publishedAt: { sort: "desc", nulls: "last" } },
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
      ({ week, year } = isoWeekAndYear(now));

      emailData = {
        articles: articles.map((article: any) => ({
          id: article.id,
          title: article.title,
          summary: article.summary || "",
          sourceUrl: article.sourceUrl,
          category: article.category,
          relevanceScore: article.relevanceScore,
          // Only the lead's is read, to find the top story's image. See content-image.ts.
          content: article.content,
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

    /**
     * The closing block, when the caller named one.
     *
     * Read through the tenant client, so an id belonging to another organization resolves
     * to null rather than being sent. A test send never marks the aside as used: only a
     * real send does, or testing a joke would push it to the back of the picker.
     */
    if (asideId) {
      const aside = await ctx.db.aside.findUnique({ where: { id: asideId } });
      if (aside) emailData.oneMoreThing = toEmailAside(aside);
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


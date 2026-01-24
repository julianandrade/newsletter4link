import { NextResponse } from "next/server";
import { sendTestNewsletter, sendEmail, renderNewsletterEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";
import { renderTemplateById } from "@/lib/email/template-renderer";

export const dynamic = "force-dynamic";

interface CustomBlock {
  id: string;
  type: "text" | "image";
  content: string;
  position: "before-articles" | "after-articles" | "before-projects" | "after-projects";
}

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
      // Note: If customData has customBlocks, we need to render with custom blocks support
      if (customData?.customBlocks && customData.customBlocks.length > 0) {
        const html = await renderNewsletterEmailWithCustomBlocks(emailData);
        result = await sendEmail(
          email,
          `[TEST] Link AI Newsletter - Week ${week}, ${year}`,
          html
        );
      } else {
        result = await sendTestNewsletter(email, emailData);
      }
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

/**
 * Render newsletter email HTML with custom blocks support
 */
async function renderNewsletterEmailWithCustomBlocks(data: any): Promise<string> {
  // For now, render the base email and inject custom blocks
  const baseHtml = await renderNewsletterEmail(data);

  if (!data.customBlocks || data.customBlocks.length === 0) {
    return baseHtml;
  }

  // Inject custom blocks into the HTML
  // This is a simplified approach - in production you'd want to modify the React Email component
  let html = baseHtml;

  // Group blocks by position
  const blocksByPosition: Record<string, CustomBlock[]> = {};
  for (const block of data.customBlocks) {
    if (!blocksByPosition[block.position]) {
      blocksByPosition[block.position] = [];
    }
    blocksByPosition[block.position].push(block);
  }

  // Render and inject blocks at each position
  for (const [position, blocks] of Object.entries(blocksByPosition)) {
    const blocksHtml = blocks.map(block => {
      if (block.type === 'text') {
        return `
          <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border-left: 3px solid #3b82f6;">
            ${block.content}
          </div>
        `;
      } else if (block.type === 'image') {
        return `
          <div style="margin: 24px 0; text-align: center;">
            <img src="${escapeHtml(block.content)}" alt="Custom image" style="max-width: 100%; height: auto; border-radius: 8px;" />
          </div>
        `;
      }
      return '';
    }).join('');

    // Find and inject blocks based on position
    // This is a simplified approach - look for section markers in the HTML
    if (position === 'before-articles') {
      // Inject before the articles section (look for "This Week" or similar heading)
      html = html.replace(/(<h2[^>]*>.*This Week.*<\/h2>)/i, blocksHtml + '$1');
    } else if (position === 'after-articles' || position === 'before-projects') {
      // Inject between articles and projects (look for "Project Spotlight" or similar)
      html = html.replace(/(<h2[^>]*>.*Project.*<\/h2>)/i, blocksHtml + '$1');
    } else if (position === 'after-projects') {
      // Inject after projects (look for footer or end of content)
      html = html.replace(/(<div[^>]*style="[^"]*border-top[^"]*"[^>]*>)/i, blocksHtml + '$1');
    }
  }

  return html;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

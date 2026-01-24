import { NextResponse } from "next/server";
import { renderNewsletterEmail } from "@/lib/email/sender";
import { prisma } from "@/lib/db";

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
 * POST /api/email/preview
 * Generate preview HTML for the newsletter
 *
 * Body: { editionId?: string, templateId?: string, customData?: CustomData }
 * - editionId: specific edition to preview (optional, uses current approved articles if omitted)
 * - templateId: specific template to use (optional, uses React Email component if omitted)
 * - customData: custom edited data to use for preview (optional, overrides database data)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { editionId, templateId, customData } = body;

    let emailData: EmailDataForTemplate;

    // Use custom data if provided (from editor), otherwise fetch from database
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
    } else {
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
      emailData = {
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
          projectDate: ep.project.projectDate instanceof Date
            ? ep.project.projectDate.toISOString()
            : String(ep.project.projectDate),
        })),
        week: edition.week,
        year: edition.year,
      };
    }

    // Render HTML - use custom template if specified, otherwise use React Email component
    let html: string;
    let usedTemplate: { id: string; name: string } | null = null;

    if (templateId) {
      // Use a custom database template
      const template = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
        select: { id: true, name: true, html: true },
      });

      if (!template) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 }
        );
      }

      // Replace placeholders in template HTML with actual data
      html = renderTemplateWithData(template.html, emailData);
      usedTemplate = { id: template.id, name: template.name };
    } else {
      // Use the default React Email component
      html = await renderNewsletterEmail(emailData);
    }

    return NextResponse.json({
      success: true,
      html,
      data: emailData,
      template: usedTemplate,
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

interface EmailDataForTemplate {
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
    projectDate: string;
  }>;
  week: number;
  year: number;
  customBlocks?: CustomBlock[];
}

/**
 * Render custom blocks HTML by position
 */
function renderCustomBlocks(blocks: CustomBlock[] | undefined, position: CustomBlock['position']): string {
  if (!blocks || blocks.length === 0) return '';

  const positionBlocks = blocks.filter(b => b.position === position);
  if (positionBlocks.length === 0) return '';

  return positionBlocks.map(block => {
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
}

/**
 * Replace placeholders in template HTML with actual newsletter data.
 * Supports placeholders like {{week}}, {{year}}, {{articles}}, {{projects}}.
 */
function renderTemplateWithData(templateHtml: string, data: EmailDataForTemplate): string {
  let html = templateHtml;

  // Replace simple placeholders
  html = html.replace(/\{\{week\}\}/g, String(data.week));
  html = html.replace(/\{\{year\}\}/g, String(data.year));
  html = html.replace(/\{\{articleCount\}\}/g, String(data.articles.length));
  html = html.replace(/\{\{projectCount\}\}/g, String(data.projects.length));

  // Generate custom blocks HTML for different positions
  const beforeArticlesHtml = renderCustomBlocks(data.customBlocks, 'before-articles');
  const afterArticlesHtml = renderCustomBlocks(data.customBlocks, 'after-articles');
  const beforeProjectsHtml = renderCustomBlocks(data.customBlocks, 'before-projects');
  const afterProjectsHtml = renderCustomBlocks(data.customBlocks, 'after-projects');

  // Generate articles HTML
  const articlesHtml = data.articles.map((article, index) => `
    <div style="margin-bottom: 24px;">
      <h3 style="color: #334155; font-size: 18px; font-weight: 600; margin: 0 0 8px; line-height: 1.4;">
        ${index + 1}. ${escapeHtml(article.title)}
      </h3>
      ${article.category.length > 0 ? `
        <div style="margin-bottom: 12px;">
          ${article.category.map(cat => `
            <span style="display: inline-block; background-color: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; margin-right: 8px; margin-bottom: 8px;">
              ${escapeHtml(cat)}
            </span>
          `).join('')}
        </div>
      ` : ''}
      <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin: 12px 0;">
        ${article.summary}
      </p>
      <a href="${escapeHtml(article.sourceUrl)}" style="color: #3b82f6; font-size: 14px; font-weight: 500; text-decoration: none;">
        Read more &rarr;
      </a>
    </div>
  `).join('');

  // Generate projects HTML
  const projectsHtml = data.projects.map(project => `
    <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
      <h3 style="color: #334155; font-size: 18px; font-weight: 600; margin: 0 0 8px; line-height: 1.4;">
        ${escapeHtml(project.name)}
      </h3>
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 12px;">
        ${escapeHtml(project.team)} &bull; ${formatProjectDate(project.projectDate)}
      </p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 12px;">
        ${project.description}
      </p>
      ${project.impact ? `
        <div style="background-color: #f0fdf4; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #22c55e; margin-top: 12px;">
          <p style="color: #166534; font-size: 13px; font-weight: 600; margin: 0 0 4px;">Impact:</p>
          <p style="color: #15803d; font-size: 14px; margin: 0; line-height: 1.5;">${escapeHtml(project.impact)}</p>
        </div>
      ` : ''}
    </div>
  `).join('');

  // Replace placeholders with custom blocks support
  html = html.replace(/\{\{articles\}\}/g, beforeArticlesHtml + articlesHtml + afterArticlesHtml);
  html = html.replace(/\{\{projects\}\}/g, beforeProjectsHtml + projectsHtml + afterProjectsHtml);

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

function formatProjectDate(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

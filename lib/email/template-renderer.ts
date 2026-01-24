import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

interface Article {
  id: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  category: string[];
  relevanceScore: number | null;
}

interface Project {
  id: string;
  name: string;
  description: string;
  team: string;
  impact: string | null;
  imageUrl?: string | null;
  projectDate?: Date | string;
}

interface RenderContext {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
  subscriberId?: string;
}

/**
 * Get the active email template
 */
export async function getActiveTemplate() {
  return await prisma.emailTemplate.findFirst({
    where: { isActive: true },
  });
}

/**
 * Generate HTML for articles section
 */
function renderArticles(articles: Article[]): string {
  if (articles.length === 0) {
    return "<p>No articles this week.</p>";
  }

  return articles
    .map(
      (article) => `
    <div style="margin-bottom: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
      <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">
        <a href="${article.sourceUrl}" style="color: #2563eb; text-decoration: none;">${article.title}</a>
      </h3>
      ${article.summary ? `<p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px;">${article.summary}</p>` : ""}
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${article.category
          .map(
            (cat) =>
              `<span style="display: inline-block; padding: 2px 8px; background-color: #e5e7eb; border-radius: 4px; font-size: 12px; color: #374151;">${cat}</span>`
          )
          .join("")}
      </div>
    </div>
  `
    )
    .join("");
}

/**
 * Generate HTML for projects section
 */
function renderProjects(projects: Project[]): string {
  if (projects.length === 0) {
    return "<p>No project updates this week.</p>";
  }

  return projects
    .map(
      (project) => `
    <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
      ${project.imageUrl ? `<img src="${project.imageUrl}" alt="${project.name}" style="width: 100%; max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 12px; display: block;" />` : ""}
      <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">${project.name}</h3>
      <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px;">${project.description}</p>
      <p style="margin: 0; font-size: 12px; color: #6b7280;">Team: ${project.team}</p>
      ${project.impact ? `<p style="margin: 8px 0 0 0; font-style: italic; color: #059669; font-size: 14px;">"${project.impact}"</p>` : ""}
    </div>
  `
    )
    .join("");
}

/**
 * Generate unsubscribe URL
 */
function getUnsubscribeUrl(subscriberId?: string): string {
  const baseUrl = config.app.url;
  if (subscriberId) {
    return `${baseUrl}/unsubscribe?id=${subscriberId}`;
  }
  return `${baseUrl}/unsubscribe`;
}

/**
 * Render template with variable substitution
 */
export function renderTemplate(html: string, context: RenderContext): string {
  const { articles, projects, week, year, subscriberId } = context;

  // Replace all template variables
  let rendered = html;

  // Articles section
  rendered = rendered.replace(/\{\{articles\}\}/g, renderArticles(articles));

  // Projects section
  rendered = rendered.replace(/\{\{projects\}\}/g, renderProjects(projects));

  // Week and year
  rendered = rendered.replace(/\{\{week\}\}/g, String(week));
  rendered = rendered.replace(/\{\{year\}\}/g, String(year));

  // Unsubscribe URL
  rendered = rendered.replace(
    /\{\{unsubscribe_url\}\}/g,
    getUnsubscribeUrl(subscriberId)
  );

  return rendered;
}

/**
 * Get current week number
 */
export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Render the active template with context
 */
export async function renderActiveTemplate(context: RenderContext): Promise<string | null> {
  const template = await getActiveTemplate();

  if (!template) {
    return null;
  }

  return renderTemplate(template.html, context);
}

/**
 * Get a template by ID
 */
export async function getTemplateById(templateId: string) {
  return await prisma.emailTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, html: true },
  });
}

/**
 * Render a specific template by ID with the given context
 */
export async function renderTemplateById(
  templateId: string,
  context: RenderContext
): Promise<{ html: string; templateName: string } | null> {
  const template = await getTemplateById(templateId);

  if (!template) {
    return null;
  }

  return {
    html: renderTemplate(template.html, context),
    templateName: template.name,
  };
}

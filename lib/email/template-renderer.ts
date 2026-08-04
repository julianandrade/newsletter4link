/**
 * Rendering for database-stored email templates.
 *
 * The item markup used to exist in four places: here, and once in each of the
 * preview, test-send and batch-send routes. They had drifted apart, and three of
 * the four interpolated article summaries and project descriptions into HTML
 * unescaped. This is now the only implementation, it renders in the AI Radar
 * design language, and everything interpolated is escaped.
 */

import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import {
  BLOCK_ANCHORS,
  BLOCK_POSITIONS,
  escapeHtml,
  renderArticleItemsHtml,
  renderProjectItemsHtml,
  type BlockPosition,
} from "./edition-template";
import { publicationName } from "./edition-data";

export interface CustomBlock {
  id: string;
  type: "text" | "image";
  content: string;
  position: BlockPosition;
}

interface Article {
  id?: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  category?: string[];
  relevanceScore?: number | null;
}

interface Project {
  id?: string;
  name: string;
  description: string;
  team?: string;
  impact?: string | null;
  imageUrl?: string | null;
  projectDate?: Date | string;
}

interface RenderContext {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
  subscriberId?: string;
  customBlocks?: CustomBlock[];
}

/** The shape the preview route builds; a render context without a subscriber. */
export type TemplateData = RenderContext;

export function formatProjectDate(date: Date | string | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function renderArticles(articles: Article[]): string {
  return renderArticleItemsHtml(
    articles.map((article) => ({
      title: article.title,
      summary: article.summary ?? "",
      url: article.sourceUrl,
      source: publicationName(article.sourceUrl),
    }))
  );
}

function renderProjects(projects: Project[]): string {
  return renderProjectItemsHtml(
    projects.map((project) => ({
      name: project.name,
      description: project.description,
      team: [project.team, formatProjectDate(project.projectDate)]
        .filter(Boolean)
        .join(" · "),
      impact: project.impact ?? null,
    }))
  );
}

/**
 * Editor-authored custom blocks. Text blocks are inserted as markup by design,
 * since the editor produces the HTML; image blocks carry a URL, which is
 * scheme-checked and escaped.
 */
export function renderCustomBlocks(
  blocks: CustomBlock[] | undefined,
  position: BlockPosition
): string {
  if (!blocks?.length) return "";

  return blocks
    .filter((block) => block.position === position)
    .map((block) => {
      if (block.type === "text") {
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr>
  <td class="tint t-body" style="background-color:#e9eeee; border-left:3px solid #ff7901; padding:16px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; color:#3c4547;">${block.content}</td>
</tr></table>`;
      }

      let src: string | null = null;
      try {
        const url = new URL(block.content);
        if (url.protocol === "http:" || url.protocol === "https:") src = url.toString();
      } catch {
        src = null;
      }
      if (!src) return "";

      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr>
  <td align="center"><img src="${escapeHtml(
    src
  )}" alt="" style="display:block; max-width:100%; height:auto; border:0;"></td>
</tr></table>`;
    })
    .join("");
}

/**
 * Place custom blocks into a rendered edition at the design's anchor points.
 *
 * The anchors sit between table rows, so each position gets its own row.
 * Positions with no blocks are stripped, leaving no trace in the sent HTML.
 * The previous implementation injected blocks by regex-matching a heading's
 * text ("This Week", "Project"), so any wording change silently dropped them.
 */
export function injectCustomBlocks(
  html: string,
  blocks: CustomBlock[] | undefined
): string {
  let result = html;

  for (const position of BLOCK_POSITIONS) {
    const inner = renderCustomBlocks(blocks, position);
    const row = inner
      ? `<tr><td class="px" style="padding:0 40px;">${inner}</td></tr>`
      : "";
    result = result.split(BLOCK_ANCHORS[position]).join(row);
  }

  return result;
}

function getUnsubscribeUrl(subscriberId?: string): string {
  const baseUrl = config.app.url.replace(/\/$/, "");
  if (subscriberId) {
    return `${baseUrl}/unsubscribe?id=${encodeURIComponent(subscriberId)}`;
  }
  return `${baseUrl}/unsubscribe`;
}

/**
 * Substitute template variables. Custom blocks bracket the articles and
 * projects sections at the same four positions the built-in edition uses.
 */
export function renderTemplate(html: string, context: RenderContext): string {
  const { articles, projects, week, year, subscriberId, customBlocks } = context;

  const values: Record<string, string> = {
    articles:
      renderCustomBlocks(customBlocks, "before-articles") +
      renderArticles(articles) +
      renderCustomBlocks(customBlocks, "after-articles"),
    projects:
      renderCustomBlocks(customBlocks, "before-projects") +
      renderProjects(projects) +
      renderCustomBlocks(customBlocks, "after-projects"),
    week: String(week),
    year: String(year),
    articleCount: String(articles.length),
    projectCount: String(projects.length),
    unsubscribe_url: getUnsubscribeUrl(subscriberId),
  };

  // One pass with a callback, so rendered content that happens to contain a
  // placeholder is never substituted a second time.
  return html.replace(
    /\{\{(articles|projects|week|year|articleCount|projectCount|unsubscribe_url)\}\}/g,
    (match, tag: string) => values[tag] ?? match
  );
}

/** Kept as an alias: the preview route reads better with this name. */
export const renderTemplateWithData = renderTemplate;

export async function getActiveTemplate() {
  return await prisma.emailTemplate.findFirst({
    where: { isActive: true },
  });
}

export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export async function renderActiveTemplate(
  context: RenderContext
): Promise<string | null> {
  const template = await getActiveTemplate();
  if (!template) return null;
  return renderTemplate(template.html, context);
}

export async function getTemplateById(templateId: string) {
  return await prisma.emailTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, html: true },
  });
}

export async function renderTemplateById(
  templateId: string,
  context: RenderContext
): Promise<{ html: string; templateName: string } | null> {
  const template = await getTemplateById(templateId);
  if (!template) return null;

  return {
    html: renderTemplate(template.html, context),
    templateName: template.name,
  };
}

export { escapeHtml };

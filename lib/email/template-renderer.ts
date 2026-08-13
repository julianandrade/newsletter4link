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
  type EmailAside,
} from "./edition-template";
import { buildEditionEmail, publicationName } from "./edition-data";
import { editionMergeValues, isHeadlessTemplate, renderMergeTags } from "./merge-tags";
import { buildUnsubscribeUrl } from "./unsubscribe-token";

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
  /** Read only to find the lead story's image. See lib/email/content-image.ts. */
  content?: string | null;
  /** Set only when this edition flagged the story to send its Link Take. */
  linkTake?: { title: string; body: string; language: string } | null;
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
  /**
   * RQ-008: what the edition is called, so the subject and the eyebrow can name it.
   *
   * Optional because the preview builds a context from ad-hoc articles with no edition
   * behind them, and there is nothing to name in that case.
   */
  label?: string;
  subscriberId?: string;
  customBlocks?: CustomBlock[];
  /**
   * The closing "one more thing" block.
   *
   * Dropped here once and it cost the whole feature on the path that matters most: a send
   * uses the active stored template when there is one, so an aside would have rendered in
   * the built-in edition and in nothing an editor had actually built.
   */
  oneMoreThing?: EmailAside;
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
      linkTake: article.linkTake ?? null,
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

/**
 * Substitute template variables. Custom blocks bracket the articles and
 * projects sections at the same four positions the built-in edition uses.
 *
 * The accepted vocabulary comes from `lib/email/merge-tags.ts`, not from a regex written here.
 * It used to be written here, and it had drifted from the browser preview's copy: this
 * function accepted `{{articleCount}}` and the preview did not, so the tag worked in a real
 * send and rendered as literal text on screen.
 *
 * `keepPerRecipient` leaves the three signed URLs standing so the send loop can resolve them
 * once per subscriber. Without it a whole send gets one recipient's links, which is what used
 * to happen.
 */
export function renderTemplate(
  html: string,
  context: RenderContext,
  options: { keepPerRecipient?: boolean } = {}
): string {
  const { articles, projects, week, year, label, subscriberId, customBlocks, oneMoreThing } =
    context;

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
    unsubscribe_url: buildUnsubscribeUrl(subscriberId),
    // Unsigned fallbacks, for a preview or a test send that has no subscriber. A real send
    // leaves these standing through keepPerRecipient and signs them inside its batch loop.
    archive_url: `${config.app.url.replace(/\/$/, "")}/editions`,
    portal_url: `${config.app.url.replace(/\/$/, "")}/editions`,
    // wrapInTable: this renders HTML exported from Unlayer, where a block lands inside Unlayer's
    // own table cell and a bare <tr> would be invalid.
    ...editionMergeValues(
      buildEditionEmail({
        articles: articles.map((article) => ({
          title: article.title,
          summary: article.summary,
          sourceUrl: article.sourceUrl,
          category: article.category,
          relevanceScore: article.relevanceScore,
          // Dropped here once, which meant the top story's image reached the built-in edition and
          // not a single stored template. Only the lead's is read. linkTake was dropped here too,
          // the same mistake one field over: renderArticles below carried the flagged story's
          // take into {{articles}}, but {{sections}} and {{top_story}}, built through
          // buildEditionEmail, kept reading the ordinary summary because this map never copied it.
          content: article.content,
          linkTake: article.linkTake ?? null,
        })),
        projects: projects.map((project) => ({
          name: project.name,
          description: project.description,
          team: project.team,
          impact: project.impact,
          projectDate: project.projectDate,
        })),
        week,
        year,
        label,
        oneMoreThing,
      }),
      // The template says whether it owns the block headings. v3 does; v2 and the hand-built
      // templates do not.
      { wrapInTable: true, headless: isHeadlessTemplate(html) }
    ),
  };

  return renderMergeTags(html, values, options);
}

/** Kept as an alias: the preview route reads better with this name. */
export const renderTemplateWithData = renderTemplate;

export async function getActiveTemplate() {
  return await prisma.emailTemplate.findFirst({
    where: { isActive: true },
  });
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
  context: RenderContext,
  options: { keepPerRecipient?: boolean } = {}
): Promise<{ html: string; templateName: string } | null> {
  const template = await getTemplateById(templateId);
  if (!template) return null;

  return {
    html: renderTemplate(template.html, context, options),
    templateName: template.name,
  };
}

export { escapeHtml };

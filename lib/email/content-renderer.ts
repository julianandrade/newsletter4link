/**
 * Merge-tag renderer for the Unlayer editor.
 *
 * A hand-built Unlayer template gets its {{articles}} and {{projects}} blocks
 * from here, so they arrive in the same visual language as the built-in AI Radar
 * edition rather than looking like a different product.
 *
 * Every interpolated value is escaped: titles and summaries come from RSS and
 * from model output, and a stray angle bracket must not be able to break the
 * markup of mail that has already left.
 */

import { config } from "@/lib/config";
import {
  escapeHtml,
  renderArticleItemsHtml,
  renderProjectItemsHtml,
} from "./edition-template";
import { buildEditionEmail, publicationName } from "./edition-data";
import { editionMergeValues, renderMergeTags, RADAR_MERGE_TAGS } from "./merge-tags";
import { weekRangeLabel } from "@/lib/radar/week";

export interface Article {
  id: string;
  title: string;
  summary: string | null;
  sourceUrl: string;
  category: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  team: string;
  impact?: string | null;
  imageUrl?: string | null;
}

export interface ContentRenderContext {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
  /**
   * RQ-008: what the edition is called, for the {{edition_label}} tag and the eyebrow.
   *
   * Optional, because the preview can be built from ad-hoc articles with no edition behind
   * them, and there is nothing to name in that case.
   */
  label?: string;
  // Pre-built signed URL; must be generated server-side (this module is
  // imported by client components, so it cannot sign tokens itself)
  unsubscribeUrl?: string;
}

export function renderArticlesHtml(articles: Article[]): string {
  return renderArticleItemsHtml(
    articles.map((article) => ({
      title: article.title,
      summary: article.summary ?? "",
      url: article.sourceUrl,
      source: publicationName(article.sourceUrl),
    }))
  );
}

export function renderProjectsHtml(projects: Project[]): string {
  return renderProjectItemsHtml(
    projects.map((project) => ({
      name: project.name,
      description: project.description,
      team: project.team,
      impact: project.impact ?? null,
    }))
  );
}

/**
 * Replace content merge tags in HTML exported from Unlayer with real content.
 *
 * The unsubscribe URL arrives pre-signed from the caller: this module is
 * imported by client components, so it cannot mint HMAC tokens itself.
 */
export function replaceContentMergeTags(
  html: string,
  context: ContentRenderContext,
  options: { keepPerRecipient?: boolean } = {}
): string {
  const { articles, projects, week, year, label, unsubscribeUrl } = context;
  const appUrl = config.app.url.replace(/\/$/, "");

  const values: Record<string, string> = {
    articles: renderArticlesHtml(articles),
    projects: renderProjectsHtml(projects),
    week: String(week),
    year: String(year),
    articleCount: String(articles.length),
    projectCount: String(projects.length),
    unsubscribe_url: unsubscribeUrl || `${appUrl}/unsubscribe`,
    // Unsigned here. This module cannot mint HMAC tokens, so the browser preview shows where
    // the links go and the send loop substitutes the signed ones per subscriber.
    archive_url: `${appUrl}/editions`,
    portal_url: `${appUrl}/editions`,
    ...editionMergeValues(
      buildEditionEmail({
        articles: articles.map((article) => ({
          title: article.title,
          summary: article.summary,
          sourceUrl: article.sourceUrl,
          category: article.category,
        })),
        projects: projects.map((project) => ({
          name: project.name,
          description: project.description,
          team: project.team,
          impact: project.impact,
        })),
        week,
        year,
        label,
      })
    ),
  };

  return renderMergeTags(html, values, options);
}

/**
 * Placeholder content for merge tags inside the Unlayer editor, so the editor
 * shows where content lands without pasting a whole edition into the canvas.
 */
export function generateMergeTagSamples(
  articles: Article[],
  projects: Project[],
  week: number,
  year: number,
  label?: string
): Record<string, string> {
  const note = (
    count: number,
    noun: string,
    names: string[],
    emptyLabel: string
  ): string => {
    if (count === 0) {
      return `<div style="padding:14px 16px; border:1px dashed #cbd3d1; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:#6b7674;">${escapeHtml(
        emptyLabel
      )}</div>`;
    }

    return `<div style="padding:14px 16px; background-color:#e9eeee; border-left:3px solid #ff7901;">
      <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:bold; letter-spacing:1.4px; color:#2d4449; text-transform:uppercase;">${count} ${escapeHtml(
        noun
      )}${count === 1 ? "" : "s"} render here</div>
      <div style="padding-top:5px; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#3c4547;">${escapeHtml(
        names.slice(0, 2).join(", ") + (names.length > 2 ? ", and more" : "")
      )}</div>
    </div>`;
  };

  return {
    articles: note(
      articles.length,
      "article",
      articles.map((article) => article.title),
      "No articles selected yet."
    ),
    projects: note(
      projects.length,
      "project",
      projects.map((project) => project.name),
      "No projects selected yet."
    ),
    week: String(week),
    year: String(year),
    articleCount: String(articles.length),
    projectCount: String(projects.length),
    unsubscribe_url: "#unsubscribe-preview",
    archive_url: "#this-edition-preview",
    portal_url: "#edition-index-preview",
    edition_label: label ?? `Week ${week}`,
    date_range: weekRangeLabel(week, year),
    tldr: note(
      Math.min(articles.length, 3),
      "headline",
      articles.map((article) => article.title),
      "No headlines yet."
    ),
    top_story: note(
      articles.length > 0 ? 1 : 0,
      "lead story",
      articles.slice(0, 1).map((article) => article.title),
      "No lead story yet."
    ),
    sections: note(
      articles.length,
      "article",
      articles.map((article) => article.title),
      "No topic sections yet."
    ),
    trend_radar: note(0, "trend", [], "The trend radar renders here when topics accelerate."),
    internal: note(
      projects.length > 0 ? 1 : 0,
      "internal item",
      projects.slice(0, 1).map((project) => project.name),
      "No internal work selected yet."
    ),
  };
}

/**
 * Every tag has a sample, so the Unlayer palette never shows a name the canvas cannot preview.
 *
 * Asserted by a test rather than trusted: the palette is built from RADAR_MERGE_TAGS, so a tag
 * added to the table with no sample here would silently show its own literal `{{name}}`.
 */
export function mergeTagSampleNames(): string[] {
  return RADAR_MERGE_TAGS.map((tag) => tag.name);
}

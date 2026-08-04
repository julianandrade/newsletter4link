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
import { publicationName } from "./edition-data";

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
  context: ContentRenderContext
): string {
  const { articles, projects, week, year, unsubscribeUrl } = context;

  // Replacements are computed first and applied with a function callback, so
  // content that happens to contain "{{projects}}" is never re-substituted.
  const values: Record<string, string> = {
    articles: renderArticlesHtml(articles),
    projects: renderProjectsHtml(projects),
    week: String(week),
    year: String(year),
    unsubscribe_url:
      unsubscribeUrl || `${config.app.url.replace(/\/$/, "")}/unsubscribe`,
  };

  return html.replace(
    /\{\{(articles|projects|week|year|unsubscribe_url)\}\}/g,
    (match, tag: string) => values[tag] ?? match
  );
}

/**
 * Placeholder content for merge tags inside the Unlayer editor, so the editor
 * shows where content lands without pasting a whole edition into the canvas.
 */
export function generateMergeTagSamples(
  articles: Article[],
  projects: Project[],
  week: number,
  year: number
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
    unsubscribe_url: "#unsubscribe-preview",
  };
}

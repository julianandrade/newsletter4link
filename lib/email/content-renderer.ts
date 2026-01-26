/**
 * Content renderer for Unlayer email editor
 * Renders articles and projects as HTML and replaces merge tags
 */

import { config } from "@/lib/config";

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
  subscriberId?: string;
}

/**
 * Generate HTML for a single article
 */
function renderArticleItem(article: Article): string {
  const categoryTags = article.category
    .map(
      (cat) =>
        `<span style="display: inline-block; padding: 2px 8px; background-color: #e5e7eb; border-radius: 4px; font-size: 12px; color: #374151; margin-right: 6px;">${cat}</span>`
    )
    .join("");

  return `
    <div style="margin-bottom: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
      <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">
        <a href="${article.sourceUrl}" style="color: #2563eb; text-decoration: none;">${article.title}</a>
      </h3>
      ${article.summary ? `<p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px; line-height: 1.5;">${article.summary}</p>` : ""}
      <div style="margin-top: 8px;">
        ${categoryTags}
      </div>
    </div>
  `;
}

/**
 * Generate HTML for articles section
 */
export function renderArticlesHtml(articles: Article[]): string {
  if (articles.length === 0) {
    return `<p style="color: #6b7280; font-style: italic;">No articles this week.</p>`;
  }

  return articles.map(renderArticleItem).join("");
}

/**
 * Generate HTML for a single project
 */
function renderProjectItem(project: Project): string {
  const imageHtml = project.imageUrl
    ? `<img src="${project.imageUrl}" alt="${project.name}" style="width: 100%; max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 12px; display: block;" />`
    : "";

  const impactHtml = project.impact
    ? `<p style="margin: 8px 0 0 0; font-style: italic; color: #059669; font-size: 14px;">"${project.impact}"</p>`
    : "";

  return `
    <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
      ${imageHtml}
      <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">${project.name}</h3>
      <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px; line-height: 1.5;">${project.description}</p>
      <p style="margin: 0; font-size: 12px; color: #6b7280;">Team: ${project.team}</p>
      ${impactHtml}
    </div>
  `;
}

/**
 * Generate HTML for projects section
 */
export function renderProjectsHtml(projects: Project[]): string {
  if (projects.length === 0) {
    return `<p style="color: #6b7280; font-style: italic;">No project updates this week.</p>`;
  }

  return projects.map(renderProjectItem).join("");
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
 * Replace content merge tags in HTML with rendered content
 * This is used after exporting HTML from Unlayer to replace
 * {{articles}}, {{projects}}, etc. with actual content
 */
export function replaceContentMergeTags(
  html: string,
  context: ContentRenderContext
): string {
  const { articles, projects, week, year, subscriberId } = context;

  let rendered = html;

  // Replace articles merge tag
  rendered = rendered.replace(/\{\{articles\}\}/g, renderArticlesHtml(articles));

  // Replace projects merge tag
  rendered = rendered.replace(/\{\{projects\}\}/g, renderProjectsHtml(projects));

  // Replace week and year
  rendered = rendered.replace(/\{\{week\}\}/g, String(week));
  rendered = rendered.replace(/\{\{year\}\}/g, String(year));

  // Replace unsubscribe URL
  rendered = rendered.replace(
    /\{\{unsubscribe_url\}\}/g,
    getUnsubscribeUrl(subscriberId)
  );

  return rendered;
}

/**
 * Generate sample content for merge tags in Unlayer editor
 * This provides a preview of what the content will look like
 */
export function generateMergeTagSamples(
  articles: Article[],
  projects: Project[],
  week: number,
  year: number
): Record<string, string> {
  // Generate abbreviated samples for the editor preview
  const articlesPreview =
    articles.length > 0
      ? `<div style="padding: 12px; background: #f0f9ff; border: 1px dashed #3b82f6; border-radius: 6px;">
           <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 500;">
             ${articles.length} article${articles.length !== 1 ? "s" : ""} will appear here
           </p>
           <p style="margin: 4px 0 0 0; color: #3b82f6; font-size: 12px;">
             ${articles
               .slice(0, 2)
               .map((a) => a.title)
               .join(", ")}${articles.length > 2 ? "..." : ""}
           </p>
         </div>`
      : `<p style="color: #6b7280; font-style: italic;">No articles selected</p>`;

  const projectsPreview =
    projects.length > 0
      ? `<div style="padding: 12px; background: #f0fdf4; border: 1px dashed #22c55e; border-radius: 6px;">
           <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 500;">
             ${projects.length} project${projects.length !== 1 ? "s" : ""} will appear here
           </p>
           <p style="margin: 4px 0 0 0; color: #22c55e; font-size: 12px;">
             ${projects
               .slice(0, 2)
               .map((p) => p.name)
               .join(", ")}${projects.length > 2 ? "..." : ""}
           </p>
         </div>`
      : `<p style="color: #6b7280; font-style: italic;">No projects selected</p>`;

  return {
    articles: articlesPreview,
    projects: projectsPreview,
    week: String(week),
    year: String(year),
    unsubscribe_url: "#unsubscribe-preview",
  };
}

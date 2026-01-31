/**
 * SharePoint Page Builder
 *
 * Converts newsletter content into SharePoint page web parts
 * with AI Radar branding.
 */

import { createTextWebPart, TextWebPart } from "./client";

// AI Radar brand colors
const COLORS = {
  navy: "#1e3a5f",
  teal: "#00b4d8",
  gray: "#64748b",
  lightCyan: "#e0f7fa",
  white: "#ffffff",
};

interface Article {
  title: string;
  summary: string;
  sourceUrl: string;
  category: string[];
}

interface Project {
  name: string;
  description: string;
  team: string;
  impact?: string;
  projectDate: string;
  imageUrl?: string;
}

interface NewsletterContent {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
}

/**
 * Build SharePoint page web parts from newsletter content
 */
export function buildPageContent(content: NewsletterContent): TextWebPart[] {
  const webParts: TextWebPart[] = [];

  // Header section
  webParts.push(createTextWebPart(buildHeader(content.week, content.year)));

  // Articles section
  if (content.articles.length > 0) {
    webParts.push(createTextWebPart(buildArticlesSection(content.articles)));
  }

  // Projects section (Radar Picks)
  if (content.projects.length > 0) {
    webParts.push(createTextWebPart(buildProjectsSection(content.projects)));
  }

  // Footer
  webParts.push(createTextWebPart(buildFooter(content.year)));

  return webParts;
}

/**
 * Build page title for the edition
 */
export function buildPageTitle(week: number, year: number): string {
  return `AI Radar - Week ${week}, ${year}`;
}

/**
 * Build URL-safe page name
 */
export function buildPageName(week: number, year: number): string {
  return `week-${String(week).padStart(2, "0")}-${year}`;
}

function buildHeader(week: number, year: number): string {
  return `
    <div style="text-align: center; padding: 40px 20px; background: linear-gradient(135deg, ${COLORS.navy} 0%, #2d5a87 100%); border-radius: 12px; margin-bottom: 32px;">
      <h1 style="color: ${COLORS.white}; font-size: 36px; margin: 0 0 8px 0; font-weight: 700;">AI Radar</h1>
      <p style="color: ${COLORS.teal}; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0; font-weight: 500;">Link's AI Intelligence Hub</p>
      <p style="color: rgba(255,255,255,0.8); font-size: 16px; margin: 0;">Week ${week}, ${year}</p>
    </div>
    <p style="color: ${COLORS.gray}; font-size: 16px; line-height: 1.6; text-align: center; max-width: 600px; margin: 0 auto 40px;">
      Your AI intelligence, delivered. This week's curated insights on artificial intelligence and emerging technology.
    </p>
  `;
}

function buildArticlesSection(articles: Article[]): string {
  const articleCards = articles
    .map((article, index) => buildArticleCard(article, index + 1))
    .join("");

  return `
    <div style="margin-bottom: 48px;">
      <h2 style="color: ${COLORS.navy}; font-size: 24px; font-weight: 600; margin: 0 0 24px 0; padding-bottom: 12px; border-bottom: 2px solid ${COLORS.lightCyan};">
        On the Radar
      </h2>
      ${articleCards}
    </div>
  `;
}

function buildArticleCard(article: Article, index: number): string {
  const categories = article.category
    .map(
      (cat) =>
        `<span style="display: inline-block; background-color: ${COLORS.lightCyan}; color: #0891b2; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; margin-right: 8px; margin-bottom: 8px;">${escapeHtml(cat)}</span>`
    )
    .join("");

  return `
    <div style="margin-bottom: 28px; padding: 20px; background: ${COLORS.white}; border: 1px solid #e2e8f0; border-radius: 8px; border-left: 4px solid ${COLORS.teal};">
      <h3 style="color: #334155; font-size: 18px; font-weight: 600; margin: 0 0 8px 0; line-height: 1.4;">
        ${index}. ${escapeHtml(article.title)}
      </h3>
      ${categories ? `<div style="margin-bottom: 12px;">${categories}</div>` : ""}
      <p style="color: ${COLORS.gray}; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">
        ${escapeHtml(article.summary)}
      </p>
      <a href="${escapeHtml(article.sourceUrl)}" style="color: ${COLORS.teal}; font-size: 14px; font-weight: 500; text-decoration: none;" target="_blank">
        Read more &rarr;
      </a>
    </div>
  `;
}

function buildProjectsSection(projects: Project[]): string {
  const projectCards = projects.map((project) => buildProjectCard(project)).join("");

  return `
    <div style="background: #f8fafc; padding: 32px; border-radius: 12px; margin-bottom: 48px;">
      <h2 style="color: ${COLORS.navy}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">
        Radar Picks
      </h2>
      <p style="color: ${COLORS.gray}; font-size: 16px; margin: 0 0 24px 0;">
        Spotlighting Link's latest AI achievements and innovations.
      </p>
      ${projectCards}
    </div>
  `;
}

function buildProjectCard(project: Project): string {
  const formattedDate = new Date(project.projectDate).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const impactSection = project.impact
    ? `
      <div style="background: #f0fdf4; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #22c55e; margin-top: 12px;">
        <p style="color: #166534; font-size: 13px; font-weight: 600; margin: 0 0 4px 0;">Impact:</p>
        <p style="color: #15803d; font-size: 14px; margin: 0; line-height: 1.5;">${escapeHtml(project.impact)}</p>
      </div>
    `
    : "";

  const imageSection = project.imageUrl
    ? `<img src="${escapeHtml(project.imageUrl)}" alt="${escapeHtml(project.name)}" style="width: 100%; height: auto; border-radius: 6px; margin-bottom: 16px;" />`
    : "";

  return `
    <div style="background: ${COLORS.white}; padding: 20px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
      ${imageSection}
      <h3 style="color: #334155; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">
        ${escapeHtml(project.name)}
      </h3>
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 12px 0;">
        ${escapeHtml(project.team)} &bull; ${formattedDate}
      </p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0;">
        ${escapeHtml(project.description)}
      </p>
      ${impactSection}
    </div>
  `;
}

function buildFooter(year: number): string {
  return `
    <div style="text-align: center; padding: 24px; border-top: 1px solid #e2e8f0; margin-top: 32px;">
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px 0;">
        AI Radar is curated using AI and reviewed by the Link Consulting team.
      </p>
      <p style="color: #cbd5e1; font-size: 12px; margin: 0;">
        &copy; ${year} Link Consulting. All rights reserved.
      </p>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

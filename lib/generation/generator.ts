/**
 * Newsletter Generator
 *
 * Main service for generating complete newsletters using AI.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import { BrandVoice } from "@prisma/client";
import {
  getOpeningHookPrompt,
  getArticleSummaryPrompt,
  getTransitionPrompt,
  getClosingPrompt,
  getSubjectLinesPrompt,
  getFullNewsletterPrompt,
} from "./prompts";
import {
  planNewsletter,
  ArticleForPlanning,
  NewsletterPlan,
} from "./content-planner";

const anthropic = new Anthropic({
  apiKey: config.ai.anthropic.apiKey,
});

export interface GeneratedArticle {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  isHero: boolean;
}

export interface GeneratedSection {
  name: string;
  articles: GeneratedArticle[];
  transition?: string;
}

export interface GeneratedNewsletter {
  opening: string;
  sections: GeneratedSection[];
  closing: string;
  subjectLines: string[];
  plan: NewsletterPlan;
  generatedAt: Date;
}

export interface GenerationProgress {
  stage: "planning" | "opening" | "articles" | "transitions" | "closing" | "subjects" | "complete";
  current: number;
  total: number;
  message: string;
}

/**
 * Generate a complete newsletter from approved articles
 */
export async function generateNewsletter(
  articles: ArticleForPlanning[],
  edition: { week: number; year: number },
  brandVoice: BrandVoice | null,
  onProgress?: (progress: GenerationProgress) => void
): Promise<GeneratedNewsletter> {
  // Stage 1: Plan the newsletter structure
  onProgress?.({
    stage: "planning",
    current: 0,
    total: 6,
    message: "Planning newsletter structure...",
  });

  const plan = await planNewsletter(articles);

  // Stage 2: Generate opening
  onProgress?.({
    stage: "opening",
    current: 1,
    total: 6,
    message: "Writing opening hook...",
  });

  const opening = await generateOpening(plan.heroArticle, edition, brandVoice);

  // Stage 3: Generate article summaries
  onProgress?.({
    stage: "articles",
    current: 2,
    total: 6,
    message: "Rewriting article summaries...",
  });

  const sections = await generateSections(plan, brandVoice, (current, total) => {
    onProgress?.({
      stage: "articles",
      current: 2,
      total: 6,
      message: `Rewriting article ${current}/${total}...`,
    });
  });

  // Stage 4: Generate transitions
  onProgress?.({
    stage: "transitions",
    current: 3,
    total: 6,
    message: "Adding transitions...",
  });

  await addTransitions(sections, brandVoice);

  // Stage 5: Generate closing
  onProgress?.({
    stage: "closing",
    current: 4,
    total: 6,
    message: "Writing closing...",
  });

  const closing = await generateClosing(plan.totalArticles, brandVoice);

  // Stage 6: Generate subject lines
  onProgress?.({
    stage: "subjects",
    current: 5,
    total: 6,
    message: "Generating subject lines...",
  });

  const subjectLines = await generateSubjectLines(plan, edition, brandVoice);

  onProgress?.({
    stage: "complete",
    current: 6,
    total: 6,
    message: "Newsletter generated!",
  });

  return {
    opening,
    sections,
    closing,
    subjectLines,
    plan,
    generatedAt: new Date(),
  };
}

/**
 * Generate the opening hook
 */
async function generateOpening(
  heroArticle: ArticleForPlanning,
  edition: { week: number; year: number },
  brandVoice: BrandVoice | null
): Promise<string> {
  const prompt = getOpeningHookPrompt(
    brandVoice,
    { title: heroArticle.title, summary: heroArticle.summary },
    edition,
    brandVoice?.greetings?.[0]
  );

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text"
    ? message.content[0].text.trim()
    : "Welcome to this week's newsletter.";
}

/**
 * Generate sections with rewritten article summaries
 */
async function generateSections(
  plan: NewsletterPlan,
  brandVoice: BrandVoice | null,
  onArticleProgress?: (current: number, total: number) => void
): Promise<GeneratedSection[]> {
  const sections: GeneratedSection[] = [];
  let articleCount = 0;
  const totalArticles = plan.totalArticles;

  // Generate hero section
  const heroSummary = await generateArticleSummary(plan.heroArticle, brandVoice, true);
  articleCount++;
  onArticleProgress?.(articleCount, totalArticles);

  sections.push({
    name: "Featured",
    articles: [
      {
        id: plan.heroArticle.id,
        title: plan.heroArticle.title,
        summary: heroSummary,
        sourceUrl: plan.heroArticle.sourceUrl,
        isHero: true,
      },
    ],
  });

  // Generate other sections
  for (const section of plan.sections) {
    const generatedArticles: GeneratedArticle[] = [];

    for (const article of section.articles) {
      const summary = await generateArticleSummary(article, brandVoice, false);
      articleCount++;
      onArticleProgress?.(articleCount, totalArticles);

      generatedArticles.push({
        id: article.id,
        title: article.title,
        summary,
        sourceUrl: article.sourceUrl,
        isHero: false,
      });

      // Rate limiting
      await delay(300);
    }

    sections.push({
      name: section.name,
      articles: generatedArticles,
    });
  }

  return sections;
}

/**
 * Generate a single article summary
 */
async function generateArticleSummary(
  article: ArticleForPlanning,
  brandVoice: BrandVoice | null,
  isHero: boolean
): Promise<string> {
  const prompt = getArticleSummaryPrompt(
    brandVoice,
    {
      title: article.title,
      content: article.content,
      summary: article.summary,
    },
    isHero
  );

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 250,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text"
    ? message.content[0].text.trim()
    : article.summary || "Read more about this development.";
}

/**
 * Add transitions between sections
 */
async function addTransitions(
  sections: GeneratedSection[],
  brandVoice: BrandVoice | null
): Promise<void> {
  // Skip if only one section
  if (sections.length <= 1) return;

  // Add transitions between sections (not before first)
  for (let i = 1; i < sections.length; i++) {
    const fromSection = sections[i - 1].name;
    const toSection = sections[i].name;

    const prompt = getTransitionPrompt(brandVoice, fromSection, toSection);

    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    sections[i].transition =
      message.content[0].type === "text"
        ? message.content[0].text.trim()
        : undefined;

    await delay(200);
  }
}

/**
 * Generate the closing paragraph
 */
async function generateClosing(
  articleCount: number,
  brandVoice: BrandVoice | null
): Promise<string> {
  const prompt = getClosingPrompt(
    brandVoice,
    articleCount,
    brandVoice?.closings?.[0]
  );

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text"
    ? message.content[0].text.trim()
    : "Thanks for reading. See you next week!";
}

/**
 * Generate subject line variants
 */
async function generateSubjectLines(
  plan: NewsletterPlan,
  edition: { week: number; year: number },
  brandVoice: BrandVoice | null
): Promise<string[]> {
  const otherTopics = plan.sections
    .flatMap((s) => s.articles)
    .slice(0, 3)
    .map((a) => a.title);

  const prompt = getSubjectLinesPrompt(
    brandVoice,
    { title: plan.heroArticle.title, summary: plan.heroArticle.summary },
    edition,
    otherTopics
  );

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

  try {
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const subjects = JSON.parse(cleanJson);
    if (Array.isArray(subjects) && subjects.length > 0) {
      return subjects.slice(0, 5);
    }
  } catch (e) {
    console.error("Failed to parse subject lines:", e);
  }

  // Fallback subject lines
  return [
    `Week ${edition.week}: ${plan.heroArticle.title.slice(0, 40)}`,
    `This Week in AI: ${plan.totalArticles} Stories You Need`,
    `AI Newsletter W${edition.week}: Top Developments`,
    `Don't Miss: ${plan.heroArticle.title.slice(0, 35)}...`,
    `Your AI Briefing: Week ${edition.week}`,
  ];
}

/**
 * Generate only subject lines (for regeneration)
 */
export async function regenerateSubjectLines(
  heroTitle: string,
  heroSummary: string | null,
  edition: { week: number; year: number },
  brandVoice: BrandVoice | null
): Promise<string[]> {
  const prompt = getSubjectLinesPrompt(
    brandVoice,
    { title: heroTitle, summary: heroSummary },
    edition,
    []
  );

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

  try {
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const subjects = JSON.parse(cleanJson);
    if (Array.isArray(subjects)) {
      return subjects.slice(0, 5);
    }
  } catch (e) {
    console.error("Failed to parse subject lines:", e);
  }

  return [`Week ${edition.week}: ${heroTitle.slice(0, 50)}`];
}

/**
 * Quick generation using single prompt (faster but less control)
 */
export async function quickGenerateNewsletter(
  articles: ArticleForPlanning[],
  edition: { week: number; year: number },
  brandVoice: BrandVoice | null
): Promise<GeneratedNewsletter> {
  const prompt = getFullNewsletterPrompt(brandVoice, articles, edition);

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

  try {
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const generated = JSON.parse(cleanJson);

    const plan = await planNewsletter(articles);
    const subjectLines = await generateSubjectLines(plan, edition, brandVoice);

    return {
      opening: generated.opening || "Welcome to this week's newsletter.",
      sections: [
        {
          name: "This Week",
          articles: (generated.articles || []).map((a: { title: string; summary: string; url: string }, i: number) => ({
            id: articles[i]?.id || `article-${i}`,
            title: a.title,
            summary: a.summary,
            sourceUrl: a.url,
            isHero: i === 0,
          })),
        },
      ],
      closing: generated.closing || "Thanks for reading!",
      subjectLines,
      plan,
      generatedAt: new Date(),
    };
  } catch (e) {
    console.error("Quick generation failed:", e);
    throw new Error("Failed to generate newsletter content");
  }
}

// Utility
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

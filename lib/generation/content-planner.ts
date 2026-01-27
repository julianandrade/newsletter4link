/**
 * Content Planner
 *
 * Organizes articles into a coherent newsletter structure.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import { getCategoryGroupingPrompt } from "./prompts";

const anthropic = new Anthropic({
  apiKey: config.ai.anthropic.apiKey,
});

export interface ArticleForPlanning {
  id: string;
  title: string;
  content: string;
  summary?: string | null;
  sourceUrl: string;
  category?: string[];
  relevanceScore?: number | null;
}

export interface NewsletterSection {
  name: string;
  theme: string;
  articles: ArticleForPlanning[];
}

export interface NewsletterPlan {
  heroArticle: ArticleForPlanning;
  sections: NewsletterSection[];
  totalArticles: number;
}

/**
 * Plan the newsletter structure from approved articles
 */
export async function planNewsletter(
  articles: ArticleForPlanning[]
): Promise<NewsletterPlan> {
  if (articles.length === 0) {
    throw new Error("No articles to plan newsletter from");
  }

  // For very small newsletters, use simple planning
  if (articles.length <= 3) {
    return simpleNewsletter(articles);
  }

  // Use AI for larger newsletters
  try {
    return await aiPlanNewsletter(articles);
  } catch (error) {
    console.error("AI planning failed, falling back to simple planning:", error);
    return simpleNewsletter(articles);
  }
}

/**
 * Simple newsletter planning for small article counts
 */
function simpleNewsletter(articles: ArticleForPlanning[]): NewsletterPlan {
  // Sort by relevance score (highest first)
  const sorted = [...articles].sort(
    (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
  );

  const heroArticle = sorted[0];
  const otherArticles = sorted.slice(1);

  // Group remaining articles by category
  const categoryGroups = new Map<string, ArticleForPlanning[]>();

  for (const article of otherArticles) {
    const category = article.category?.[0] || "News";
    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, []);
    }
    categoryGroups.get(category)!.push(article);
  }

  // Convert to sections
  const sections: NewsletterSection[] = [];

  for (const [category, categoryArticles] of categoryGroups) {
    sections.push({
      name: category,
      theme: `${category} updates and insights`,
      articles: categoryArticles,
    });
  }

  // If no sections (all articles were hero), create a default section
  if (sections.length === 0 && otherArticles.length > 0) {
    sections.push({
      name: "This Week's Highlights",
      theme: "Notable developments",
      articles: otherArticles,
    });
  }

  return {
    heroArticle,
    sections,
    totalArticles: articles.length,
  };
}

/**
 * AI-powered newsletter planning for larger newsletters
 */
async function aiPlanNewsletter(
  articles: ArticleForPlanning[]
): Promise<NewsletterPlan> {
  const prompt = getCategoryGroupingPrompt(
    articles.map((a) => ({
      title: a.title,
      category: a.category,
      summary: a.summary,
    }))
  );

  const message = await anthropic.messages.create({
    model: config.ai.anthropic.model,
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

  try {
    // Clean up potential markdown formatting
    const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const plan = JSON.parse(cleanJson);

    // Validate and build the plan
    const heroIndex = typeof plan.heroIndex === "number" ? plan.heroIndex : 0;
    const heroArticle = articles[heroIndex] || articles[0];

    const sections: NewsletterSection[] = [];

    if (Array.isArray(plan.sections)) {
      for (const section of plan.sections) {
        if (section.name && Array.isArray(section.articleIndices)) {
          const sectionArticles = section.articleIndices
            .filter((i: number) => i !== heroIndex && i >= 0 && i < articles.length)
            .map((i: number) => articles[i]);

          if (sectionArticles.length > 0) {
            sections.push({
              name: section.name,
              theme: section.theme || section.name,
              articles: sectionArticles,
            });
          }
        }
      }
    }

    // If AI didn't produce valid sections, fall back
    if (sections.length === 0) {
      const otherArticles = articles.filter((_, i) => i !== heroIndex);
      if (otherArticles.length > 0) {
        sections.push({
          name: "More Stories",
          theme: "Additional coverage",
          articles: otherArticles,
        });
      }
    }

    return {
      heroArticle,
      sections,
      totalArticles: articles.length,
    };
  } catch (parseError) {
    console.error("Failed to parse AI plan:", parseError);
    return simpleNewsletter(articles);
  }
}

/**
 * Suggest section names based on article categories
 */
export function suggestSectionName(categories: string[]): string {
  if (categories.length === 0) return "Updates";

  // Common category mappings to better names
  const nameMap: Record<string, string> = {
    "Machine Learning": "ML & AI Research",
    "Natural Language Processing": "NLP Advances",
    "Large Language Models": "LLM News",
    "AI Applications": "AI in Action",
    "AI Business": "Industry Moves",
    "AI Tools": "Tools & Resources",
    "AI Research": "Research Spotlight",
    "AI Ethics": "Ethics & Governance",
    "AI Regulation": "Policy & Regulation",
  };

  // Find the most common category
  const categoryCounts = new Map<string, number>();
  for (const cat of categories) {
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  let topCategory = categories[0];
  let topCount = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > topCount) {
      topCategory = cat;
      topCount = count;
    }
  }

  return nameMap[topCategory] || topCategory;
}

/**
 * Estimate reading time for articles
 */
export function estimateReadingTime(articles: ArticleForPlanning[]): number {
  const totalWords = articles.reduce((sum, article) => {
    const contentWords = article.content.split(/\s+/).length;
    const summaryWords = article.summary?.split(/\s+/).length || 0;
    // Use summary length as estimate for newsletter content
    return sum + Math.min(contentWords, 200) + summaryWords;
  }, 0);

  // Average reading speed: 200 words per minute
  return Math.ceil(totalWords / 200);
}

/**
 * Validate that a newsletter plan is complete
 */
export function validatePlan(plan: NewsletterPlan): string[] {
  const issues: string[] = [];

  if (!plan.heroArticle) {
    issues.push("Missing hero article");
  }

  if (plan.sections.length === 0 && plan.totalArticles > 1) {
    issues.push("No sections defined for multi-article newsletter");
  }

  // Check for duplicate articles
  const articleIds = new Set<string>();
  articleIds.add(plan.heroArticle.id);

  for (const section of plan.sections) {
    for (const article of section.articles) {
      if (articleIds.has(article.id)) {
        issues.push(`Duplicate article: ${article.title}`);
      }
      articleIds.add(article.id);
    }
  }

  // Check article count matches
  const plannedCount = 1 + plan.sections.reduce((sum, s) => sum + s.articles.length, 0);
  if (plannedCount !== plan.totalArticles) {
    issues.push(`Article count mismatch: planned ${plannedCount}, expected ${plan.totalArticles}`);
  }

  return issues;
}

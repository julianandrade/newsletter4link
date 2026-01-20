import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

const anthropic = new Anthropic({
  apiKey: config.ai.anthropic.apiKey,
});

/**
 * Score article relevance for Link Consulting's AI newsletter
 * Returns a score from 0-10
 */
export async function scoreArticleRelevance(
  title: string,
  content: string
): Promise<number> {
  try {
    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are an AI content curator for Link Consulting's internal AI/tech newsletter. The audience is tech professionals and executives interested in AI developments, practical applications, and industry trends.

Score the following article for relevance on a scale of 0-10, where:
- 10 = Highly relevant, groundbreaking AI news that everyone should know
- 7-9 = Very relevant, significant AI/tech development
- 5-6 = Somewhat relevant, interesting but not critical
- 3-4 = Low relevance, tangentially related to AI
- 0-2 = Not relevant, off-topic

Consider:
- Direct relevance to AI, machine learning, or advanced tech
- Impact on business or technology landscape
- Practical applications and real-world implications
- Quality and credibility of the source
- Timeliness and novelty of the information

Title: ${title}

Content: ${content.substring(0, 1500)}

Respond with ONLY a single number from 0-10. No explanation needed.`,
        },
      ],
    });

    const scoreText = message.content[0].type === "text"
      ? message.content[0].text.trim()
      : "0";

    const score = parseFloat(scoreText);

    // Validate score is between 0-10
    if (isNaN(score) || score < 0 || score > 10) {
      console.warn(`Invalid score received: ${scoreText}, defaulting to 5`);
      return 5;
    }

    return score;
  } catch (error) {
    console.error("Error scoring article:", error);
    throw new Error(
      `Failed to score article: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate a comprehensive summary of an article
 */
export async function summarizeArticle(
  title: string,
  content: string
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are writing summaries for Link Consulting's internal AI newsletter.

Write a concise, engaging 2-3 sentence summary of this article. Focus on:
- The key development or finding
- Why it matters to AI/tech professionals
- Practical implications

Be clear, direct, and avoid hype. Target audience: tech professionals and executives.

Title: ${title}

Content: ${content.substring(0, 2000)}

Write only the summary, no preamble or extra text.`,
        },
      ],
    });

    const summary = message.content[0].type === "text"
      ? message.content[0].text.trim()
      : "";

    return summary;
  } catch (error) {
    console.error("Error summarizing article:", error);
    throw new Error(
      `Failed to summarize article: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Categorize an article into relevant topics
 */
export async function categorizeArticle(
  title: string,
  content: string
): Promise<string[]> {
  try {
    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Categorize this article into 1-3 relevant categories from this list:
- Machine Learning
- Natural Language Processing
- Computer Vision
- AI Research
- AI Applications
- AI Ethics
- AI Regulation
- Large Language Models
- Robotics
- Autonomous Systems
- AI Business
- AI Tools
- Data Science
- Cloud AI
- Edge AI

Title: ${title}

Content: ${content.substring(0, 1000)}

Respond with ONLY the category names, separated by commas. Maximum 3 categories.`,
        },
      ],
    });

    const categoriesText = message.content[0].type === "text"
      ? message.content[0].text.trim()
      : "";

    const categories = categoriesText
      .split(",")
      .map((cat) => cat.trim())
      .filter((cat) => cat.length > 0)
      .slice(0, 3); // Max 3 categories

    return categories.length > 0 ? categories : ["AI News"];
  } catch (error) {
    console.error("Error categorizing article:", error);
    return ["AI News"]; // Default category on error
  }
}

/**
 * Batch score multiple articles
 */
export async function scoreArticlesBatch(
  articles: Array<{ title: string; content: string }>
): Promise<number[]> {
  const scores: number[] = [];

  for (const article of articles) {
    try {
      const score = await scoreArticleRelevance(article.title, article.content);
      scores.push(score);

      // Add delay to avoid rate limiting (Anthropic rate limits)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error scoring article "${article.title}":`, error);
      scores.push(5); // Default score on error
    }
  }

  return scores;
}

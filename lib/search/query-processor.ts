/**
 * Query Processor
 *
 * Uses Claude to analyze and expand search queries for better results.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

const anthropic = new Anthropic({
  apiKey: config.ai.anthropic.apiKey,
});

export interface QueryAnalysis {
  intent: "news" | "trends" | "research" | "competitive" | "general";
  timeScope: "recent" | "this_week" | "this_month" | "any";
  expandedQueries: string[];
  topics: string[];
  suggestedProviders: string[];
}

export interface QueryExpansion {
  original: string;
  expanded: string;
  analysis: QueryAnalysis;
}

/**
 * Analyze and expand a natural language search query
 */
export async function processQuery(query: string): Promise<QueryExpansion> {
  try {
    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Analyze this search query and help optimize it for web search.

Query: "${query}"

Respond with a JSON object containing:
{
  "intent": "news" | "trends" | "research" | "competitive" | "general",
  "timeScope": "recent" | "this_week" | "this_month" | "any",
  "expandedQueries": ["query1", "query2", "query3"],
  "topics": ["topic1", "topic2"],
  "suggestedProviders": ["tavily"]
}

Guidelines:
- intent: What type of information is the user looking for?
  - "news" = current events, breaking news
  - "trends" = emerging patterns, what's popular
  - "research" = deep dives, academic or technical content
  - "competitive" = company/product analysis
  - "general" = other types of searches
- timeScope: How recent should results be?
  - "recent" = last 24-48 hours
  - "this_week" = last 7 days
  - "this_month" = last 30 days
  - "any" = no time restriction
- expandedQueries: Generate 2-4 alternative search queries that might find relevant results. Include:
  - The original query (cleaned up if needed)
  - Variations with synonyms
  - More specific versions
  - Related angle approaches
- topics: 2-4 key topics/themes extracted from the query
- suggestedProviders: Always include "tavily" for now

Respond with ONLY the JSON object, no explanation.`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

    // Parse the JSON response
    let analysis: QueryAnalysis;
    try {
      // Remove any markdown code blocks if present
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse query analysis:", parseError);
      // Return default analysis
      analysis = {
        intent: "general",
        timeScope: "this_week",
        expandedQueries: [query],
        topics: [],
        suggestedProviders: ["tavily"],
      };
    }

    // Ensure we have valid data
    if (!analysis.expandedQueries || analysis.expandedQueries.length === 0) {
      analysis.expandedQueries = [query];
    }
    if (!analysis.suggestedProviders || analysis.suggestedProviders.length === 0) {
      analysis.suggestedProviders = ["tavily"];
    }

    // Build the expanded query by combining the best variations
    const expanded = analysis.expandedQueries.slice(0, 2).join(" OR ");

    return {
      original: query,
      expanded,
      analysis,
    };
  } catch (error) {
    console.error("Error processing query:", error);
    // Return basic expansion on error
    return {
      original: query,
      expanded: query,
      analysis: {
        intent: "general",
        timeScope: "this_week",
        expandedQueries: [query],
        topics: [],
        suggestedProviders: ["tavily"],
      },
    };
  }
}

/**
 * Map query time scope to search provider time range
 */
export function mapTimeScopeToTimeRange(
  timeScope: QueryAnalysis["timeScope"]
): "day" | "week" | "month" | "year" {
  switch (timeScope) {
    case "recent":
      return "day";
    case "this_week":
      return "week";
    case "this_month":
      return "month";
    case "any":
      return "year";
    default:
      return "week";
  }
}

/**
 * Quick query expansion without full Claude analysis (for simple queries)
 */
export function quickExpandQuery(query: string): string[] {
  const queries = [query];

  // Add common expansions
  const lowerQuery = query.toLowerCase();

  // If query mentions news, add "latest" variant
  if (!lowerQuery.includes("latest") && !lowerQuery.includes("recent")) {
    queries.push(`latest ${query}`);
  }

  // If query is about a technology/topic, add "news" and "developments"
  if (!lowerQuery.includes("news")) {
    queries.push(`${query} news`);
  }

  return queries.slice(0, 3);
}

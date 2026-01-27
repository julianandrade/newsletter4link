/**
 * Result Analyzer
 *
 * Uses Claude to score and analyze search results for relevance.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import { SearchProviderResult } from "./providers/types";

const anthropic = new Anthropic({
  apiKey: config.ai.anthropic.apiKey,
});

export interface AnalyzedResult extends SearchProviderResult {
  aiScore: number;
  aiSummary: string;
  aiTopics: string[];
  aiSentiment: "positive" | "negative" | "neutral";
  aiRelevanceNote: string;
}

export interface ResultAnalysis {
  score: number;
  summary: string;
  topics: string[];
  sentiment: "positive" | "negative" | "neutral";
  relevanceNote: string;
}

/**
 * Analyze a single search result for relevance and extract insights
 */
export async function analyzeResult(
  result: SearchProviderResult,
  originalQuery: string,
  brandVoicePrompt?: string | null
): Promise<ResultAnalysis> {
  try {
    const brandContext = brandVoicePrompt
      ? `\n\nBRAND/INDUSTRY CONTEXT:\n${brandVoicePrompt}\n\nConsider this context when scoring relevance.`
      : "";

    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Analyze this search result for relevance to the query.

Original Query: "${originalQuery}"
${brandContext}

Result:
Title: ${result.title}
URL: ${result.url}
Source: ${result.source || "Unknown"}
Snippet: ${result.snippet}
${result.content ? `Content: ${result.content.slice(0, 1500)}` : ""}

Respond with a JSON object:
{
  "score": <number 1-10>,
  "summary": "<2-3 sentence summary of the content>",
  "topics": ["<topic1>", "<topic2>"],
  "sentiment": "positive" | "negative" | "neutral",
  "relevanceNote": "<1 sentence explaining why this is or isn't relevant>"
}

Scoring guide:
- 9-10: Directly addresses the query, high-quality source, timely
- 7-8: Highly relevant, good source, useful information
- 5-6: Somewhat relevant, tangentially related
- 3-4: Low relevance, only loosely connected
- 1-2: Not relevant to the query

Respond with ONLY the JSON object.`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text.trim() : "{}";

    // Parse JSON response
    try {
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const analysis = JSON.parse(cleanJson);

      return {
        score: Math.min(10, Math.max(1, Number(analysis.score) || 5)),
        summary: analysis.summary || "",
        topics: Array.isArray(analysis.topics) ? analysis.topics : [],
        sentiment: ["positive", "negative", "neutral"].includes(analysis.sentiment)
          ? analysis.sentiment
          : "neutral",
        relevanceNote: analysis.relevanceNote || "",
      };
    } catch (parseError) {
      console.error("Failed to parse result analysis:", parseError);
      return {
        score: 5,
        summary: result.snippet,
        topics: [],
        sentiment: "neutral",
        relevanceNote: "Analysis failed",
      };
    }
  } catch (error) {
    console.error("Error analyzing result:", error);
    return {
      score: 5,
      summary: result.snippet,
      topics: [],
      sentiment: "neutral",
      relevanceNote: "Analysis error",
    };
  }
}

/**
 * Analyze multiple results with rate limiting
 */
export async function analyzeResults(
  results: SearchProviderResult[],
  originalQuery: string,
  brandVoicePrompt?: string | null,
  onProgress?: (completed: number, total: number) => void
): Promise<AnalyzedResult[]> {
  const analyzedResults: AnalyzedResult[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    try {
      const analysis = await analyzeResult(result, originalQuery, brandVoicePrompt);

      analyzedResults.push({
        ...result,
        aiScore: analysis.score,
        aiSummary: analysis.summary,
        aiTopics: analysis.topics,
        aiSentiment: analysis.sentiment,
        aiRelevanceNote: analysis.relevanceNote,
      });

      if (onProgress) {
        onProgress(i + 1, results.length);
      }

      // Rate limiting - wait between requests
      if (i < results.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Error analyzing result ${i}:`, error);
      // Add result with default scores on error
      analyzedResults.push({
        ...result,
        aiScore: 5,
        aiSummary: result.snippet,
        aiTopics: [],
        aiSentiment: "neutral",
        aiRelevanceNote: "Analysis failed",
      });
    }
  }

  return analyzedResults;
}

/**
 * Batch analyze results more efficiently (single API call)
 */
export async function batchAnalyzeResults(
  results: SearchProviderResult[],
  originalQuery: string,
  brandVoicePrompt?: string | null
): Promise<AnalyzedResult[]> {
  if (results.length === 0) return [];

  // For small batches, use individual analysis
  if (results.length <= 3) {
    return analyzeResults(results, originalQuery, brandVoicePrompt);
  }

  try {
    const brandContext = brandVoicePrompt
      ? `\n\nBRAND/INDUSTRY CONTEXT:\n${brandVoicePrompt}`
      : "";

    // Build a compact representation of results
    const resultsText = results
      .map(
        (r, i) => `[${i}] "${r.title}" - ${r.source || "Unknown"}: ${r.snippet.slice(0, 200)}`
      )
      .join("\n\n");

    const message = await anthropic.messages.create({
      model: config.ai.anthropic.model,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Score these search results for relevance to the query.

Query: "${originalQuery}"${brandContext}

Results:
${resultsText}

For each result [0] through [${results.length - 1}], provide:
- score (1-10)
- topics (1-3 keywords)
- sentiment (positive/negative/neutral)

Respond with a JSON array:
[
  {"index": 0, "score": 8, "topics": ["AI", "news"], "sentiment": "positive"},
  ...
]

Respond with ONLY the JSON array.`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text.trim() : "[]";

    try {
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const analyses = JSON.parse(cleanJson);

      return results.map((result, i) => {
        const analysis = analyses.find((a: { index: number }) => a.index === i) || {};
        return {
          ...result,
          aiScore: Math.min(10, Math.max(1, Number(analysis.score) || 5)),
          aiSummary: result.snippet,
          aiTopics: Array.isArray(analysis.topics) ? analysis.topics : [],
          aiSentiment: ["positive", "negative", "neutral"].includes(analysis.sentiment)
            ? analysis.sentiment
            : "neutral",
          aiRelevanceNote: "",
        };
      });
    } catch (parseError) {
      console.error("Failed to parse batch analysis:", parseError);
      // Fall back to individual analysis
      return analyzeResults(results.slice(0, 5), originalQuery, brandVoicePrompt);
    }
  } catch (error) {
    console.error("Error in batch analysis:", error);
    // Return results with default scores
    return results.map((result) => ({
      ...result,
      aiScore: 5,
      aiSummary: result.snippet,
      aiTopics: [],
      aiSentiment: "neutral" as const,
      aiRelevanceNote: "Batch analysis failed",
    }));
  }
}

/**
 * Filter and sort results by AI score
 */
export function filterAndSortResults(
  results: AnalyzedResult[],
  minScore: number = 5
): AnalyzedResult[] {
  return results
    .filter((r) => r.aiScore >= minScore)
    .sort((a, b) => b.aiScore - a.aiScore);
}

/**
 * Deduplicate results by URL
 */
export function deduplicateResults<T extends { url: string }>(results: T[]): T[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    // Normalize URL for comparison
    const normalizedUrl = r.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(normalizedUrl)) {
      return false;
    }
    seen.add(normalizedUrl);
    return true;
  });
}

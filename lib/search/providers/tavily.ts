/**
 * Tavily Search Provider
 *
 * AI-optimized web search API for content discovery.
 * https://tavily.com/
 */

import {
  SearchProvider,
  SearchProviderOptions,
  SearchProviderResponse,
  SearchProviderResult,
  TIME_RANGE_DAYS,
} from "./types";
import { pgSafe } from "@/lib/pg-safe-text";

interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  raw_content?: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  results: TavilySearchResult[];
  response_time: number;
}

export class TavilyProvider implements SearchProvider {
  name = "tavily";
  private apiKey: string | undefined;
  private baseUrl = "https://api.tavily.com";

  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async search(options: SearchProviderOptions): Promise<SearchProviderResponse> {
    if (!this.apiKey) {
      throw new Error("Tavily API key not configured");
    }

    const { query, maxResults = 10, timeRange = "week", includeDomains, excludeDomains } = options;

    // Calculate days for time filter
    const days = TIME_RANGE_DAYS[timeRange] || 7;

    const requestBody: Record<string, unknown> = {
      api_key: this.apiKey,
      query,
      max_results: Math.min(maxResults, 20), // Tavily max is 20
      search_depth: "advanced", // More thorough search
      include_answer: false,
      include_raw_content: true,
      days, // Time filter
    };

    if (includeDomains?.length) {
      requestBody.include_domains = includeDomains;
    }

    if (excludeDomains?.length) {
      requestBody.exclude_domains = excludeDomains;
    }

    const response = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily search failed: ${response.status} ${errorText}`);
    }

    const data: TavilyResponse = await response.json();

    /**
     * Cleaned here, at the boundary the text arrives through.
     *
     * `include_raw_content` above means whole scraped pages come back as strings, and
     * scraped text carries NUL bytes. A NUL cannot be stored by Postgres, in jsonb or in
     * text, so leaving it means the search runs, costs its model calls, and then fails on
     * the write with the database's own message: "unsupported Unicode escape sequence".
     *
     * The slice is the other half of it. Cutting at 500 characters lands mid-character on
     * any emoji near the boundary and leaves a lone surrogate, which jsonb refuses too, so
     * the clean happens after the cut rather than before.
     */
    const results: SearchProviderResult[] = data.results.map((result) => ({
      url: result.url,
      title: pgSafe(result.title),
      snippet: pgSafe(result.content.slice(0, 500)),
      content: pgSafe(result.raw_content || result.content),
      publishedAt: result.published_date ? new Date(result.published_date) : undefined,
      source: this.extractDomain(result.url),
      rawScore: result.score,
    }));

    return {
      results,
      totalResults: results.length,
      searchTime: data.response_time,
      provider: this.name,
    };
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }
}

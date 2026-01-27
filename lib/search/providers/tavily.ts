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

    const results: SearchProviderResult[] = data.results.map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.content.slice(0, 500),
      content: result.raw_content || result.content,
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

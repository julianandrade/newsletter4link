/**
 * Search Provider Interface
 *
 * Defines the contract for web search providers (Tavily, Brave, Perplexity, etc.)
 */

export interface SearchProviderOptions {
  query: string;
  maxResults?: number;
  timeRange?: "day" | "week" | "month" | "year";
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SearchProviderResult {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  publishedAt?: Date;
  source?: string;
  author?: string;
  imageUrl?: string;
  rawScore?: number;
}

export interface SearchProviderResponse {
  results: SearchProviderResult[];
  totalResults?: number;
  searchTime?: number;
  provider: string;
}

export interface SearchProvider {
  name: string;

  /**
   * Check if the provider is configured and available
   */
  isAvailable(): boolean;

  /**
   * Execute a search query
   */
  search(options: SearchProviderOptions): Promise<SearchProviderResponse>;
}

/**
 * Time range mapping to provider-specific formats
 */
export const TIME_RANGE_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

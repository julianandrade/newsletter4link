/**
 * Mock Search Provider
 *
 * Deterministic results for tests/CI (MOCK_SEARCH=true). Mirrors the mock
 * convention used by query-processor.ts and result-analyzer.ts so the whole
 * search pipeline runs without external API keys.
 */

import {
  SearchProvider,
  SearchProviderOptions,
  SearchProviderResponse,
} from "./types";

const MOCK_ENABLED =
  process.env.MOCK_SEARCH === "true" || process.env.MOCK_GENERATION === "true";

export class MockSearchProvider implements SearchProvider {
  name = "mock";

  isAvailable(): boolean {
    return MOCK_ENABLED;
  }

  async search(options: SearchProviderOptions): Promise<SearchProviderResponse> {
    const { query, maxResults = 10 } = options;
    const now = Date.now();

    const results = Array.from({ length: Math.min(maxResults, 3) }, (_, i) => ({
      url: `https://example.com/mock-result-${i + 1}`,
      title: `Mock result ${i + 1} for "${query.slice(0, 60)}"`,
      snippet: `Deterministic mock snippet ${i + 1} covering: ${query.slice(0, 120)}`,
      content: `Mock content body for result ${i + 1}. Query: ${query}`,
      publishedAt: new Date(now - (i + 1) * 24 * 60 * 60 * 1000),
      source: "example.com",
      rawScore: 0.9 - i * 0.1,
    }));

    return {
      results,
      totalResults: results.length,
      searchTime: 5,
      provider: this.name,
    };
  }
}

/**
 * Search Provider Registry
 *
 * Manages and provides access to all configured search providers.
 */

import { SearchProvider, SearchProviderOptions, SearchProviderResponse } from "./types";
import { TavilyProvider } from "./tavily";

// Registry of all provider instances
const providers: Map<string, SearchProvider> = new Map();

// Initialize providers
function initializeProviders() {
  const tavily = new TavilyProvider();
  if (tavily.isAvailable()) {
    providers.set(tavily.name, tavily);
  }

  // Future providers can be added here:
  // const brave = new BraveProvider();
  // if (brave.isAvailable()) providers.set(brave.name, brave);
}

// Initialize on module load
initializeProviders();

/**
 * Get a specific provider by name
 */
export function getProvider(name: string): SearchProvider | undefined {
  return providers.get(name);
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): SearchProvider[] {
  return Array.from(providers.values());
}

/**
 * Get names of all available providers
 */
export function getAvailableProviderNames(): string[] {
  return Array.from(providers.keys());
}

/**
 * Check if a specific provider is available
 */
export function isProviderAvailable(name: string): boolean {
  return providers.has(name) && providers.get(name)!.isAvailable();
}

/**
 * Execute a search using a specific provider
 */
export async function searchWithProvider(
  providerName: string,
  options: SearchProviderOptions
): Promise<SearchProviderResponse> {
  const provider = providers.get(providerName);
  if (!provider) {
    throw new Error(`Search provider "${providerName}" not found or not configured`);
  }

  if (!provider.isAvailable()) {
    throw new Error(`Search provider "${providerName}" is not available`);
  }

  return provider.search(options);
}

/**
 * Execute a search across multiple providers and merge results
 */
export async function searchMultiProvider(
  providerNames: string[],
  options: SearchProviderOptions
): Promise<SearchProviderResponse> {
  const availableProviders = providerNames
    .map((name) => providers.get(name))
    .filter((p): p is SearchProvider => p !== undefined && p.isAvailable());

  if (availableProviders.length === 0) {
    throw new Error("No search providers available");
  }

  // Execute searches in parallel
  const searchPromises = availableProviders.map((provider) =>
    provider.search(options).catch((error) => {
      console.error(`Search failed for provider ${provider.name}:`, error);
      return null;
    })
  );

  const responses = await Promise.all(searchPromises);
  const validResponses = responses.filter((r): r is SearchProviderResponse => r !== null);

  if (validResponses.length === 0) {
    throw new Error("All search providers failed");
  }

  // Merge results, deduplicating by URL
  const seenUrls = new Set<string>();
  const mergedResults = validResponses.flatMap((response) =>
    response.results.filter((result) => {
      if (seenUrls.has(result.url)) {
        return false;
      }
      seenUrls.add(result.url);
      return true;
    })
  );

  // Sort by raw score if available
  mergedResults.sort((a, b) => (b.rawScore || 0) - (a.rawScore || 0));

  return {
    results: mergedResults.slice(0, options.maxResults || 20),
    totalResults: mergedResults.length,
    provider: validResponses.map((r) => r.provider).join("+"),
  };
}

// Re-export types
export * from "./types";

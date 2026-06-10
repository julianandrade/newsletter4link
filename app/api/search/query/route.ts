import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { processQuery, mapTimeScopeToTimeRange } from "@/lib/search/query-processor";
import {
  searchMultiProvider,
  getAvailableProviderNames,
} from "@/lib/search/providers";
import { batchAnalyzeResults, filterAndSortResults } from "@/lib/search/result-analyzer";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for search + analysis

// Ad-hoc search runs LLM query expansion + per-result LLM analysis + paid provider calls.
const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

/**
 * POST /api/search/query
 * Execute an ad-hoc search query
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();

    const rl = checkRateLimit(
      rateLimitKey([
        ctx.organization.id,
        ctx.membership.supabaseUserId,
        "search:query",
      ]),
      RATE_LIMIT
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Please retry shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const { query, maxResults = 10, providers } = body;

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Query is required and must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Check if search feature is available (PROFESSIONAL plan or higher)
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    // Get available providers
    const availableProviders = getAvailableProviderNames();
    if (availableProviders.length === 0) {
      return NextResponse.json(
        { error: "No search providers configured. Please add TAVILY_API_KEY to environment." },
        { status: 503 }
      );
    }

    // Process the query with Claude
    const queryExpansion = await processQuery(query.trim());

    // Determine which providers to use
    const providersToUse = providers?.length
      ? providers.filter((p: string) => availableProviders.includes(p))
      : availableProviders;

    if (providersToUse.length === 0) {
      return NextResponse.json(
        { error: "No valid search providers specified" },
        { status: 400 }
      );
    }

    // Execute search
    const searchResponse = await searchMultiProvider(providersToUse, {
      query: queryExpansion.expanded,
      maxResults: Math.min(maxResults, 20),
      timeRange: mapTimeScopeToTimeRange(queryExpansion.analysis.timeScope),
    });

    // Get org settings for brand voice
    const orgSettings = await ctx.db.orgSettings.findUnique();

    // Analyze results with Claude
    const analyzedResults = await batchAnalyzeResults(
      searchResponse.results,
      query.trim(),
      orgSettings?.brandVoicePrompt
    );

    // Filter and sort by AI score
    const sortedResults = filterAndSortResults(analyzedResults, 3);

    return NextResponse.json({
      success: true,
      data: {
        query: query.trim(),
        queryExpansion,
        results: sortedResults,
        totalResults: sortedResults.length,
        providers: searchResponse.provider,
        searchTime: searchResponse.searchTime,
      },
    });
  } catch (error) {
    console.error("Search error:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message.includes("not configured") || error.message.includes("not available")) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
    }

    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    );
  }
}

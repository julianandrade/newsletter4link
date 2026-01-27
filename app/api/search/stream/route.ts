/**
 * Trend Radar Streaming Search API
 *
 * GET /api/search/stream?query=...&maxResults=15
 *
 * Streams search progress using Server-Sent Events.
 * Uses the generic job system from lib/jobs.
 *
 * Events:
 * - start: { jobId }
 * - query_expanded: { original, expanded, intent, topics }
 * - searching: { provider: "tavily" }
 * - analyzing: { current: 3, total: 15, title: "Article being analyzed..." }
 * - complete: { results: [...], totalFound: 15 }
 * - error/cancelled
 */

import { NextRequest } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { createJobStream } from "@/lib/jobs";
import { JobType } from "@prisma/client";
import { processQuery, mapTimeScopeToTimeRange } from "@/lib/search/query-processor";
import {
  searchMultiProvider,
  getAvailableProviderNames,
} from "@/lib/search/providers";
import {
  analyzeResults,
  filterAndSortResults,
} from "@/lib/search/result-analyzer";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes for search + analysis

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const maxResultsParam = searchParams.get("maxResults");
  const parsedMax = maxResultsParam ? parseInt(maxResultsParam, 10) : 15;
  const maxResults = Number.isNaN(parsedMax) ? 15 : Math.min(Math.max(parsedMax, 1), 20);

  if (!query || query.trim().length < 2) {
    return new Response(
      JSON.stringify({ error: "Query is required and must be at least 2 characters" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get org context
  let organizationId: string;
  let brandVoicePrompt: string | null = null;
  try {
    const ctx = await requireOrgContext();
    organizationId = ctx.organization.id;

    // Check if search feature is available (PROFESSIONAL plan or higher)
    if (!ctx.features.trendRadar) {
      return new Response(
        JSON.stringify({ error: "Search feature requires Professional plan or higher" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get org settings for brand voice
    const orgSettings = await ctx.db.orgSettings.findUnique();
    brandVoicePrompt = orgSettings?.brandVoicePrompt || null;
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check if providers are configured
  const availableProviders = getAvailableProviderNames();
  if (availableProviders.length === 0) {
    return new Response(
      JSON.stringify({ error: "No search providers configured. Please add TAVILY_API_KEY to environment." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return createJobStream({
    organizationId,
    jobType: JobType.SEARCH,
    metadata: { query: query.trim(), maxResults },
    runner: async (jobId, sendProgress) => {
      // Step 1: Process/expand the query with Claude
      await sendProgress("query_processing", 5, "Analyzing search query...");

      const queryExpansion = await processQuery(query.trim());

      // Send query_expanded event via custom progress
      await sendProgress("query_expanded", 15, JSON.stringify({
        original: queryExpansion.original,
        expanded: queryExpansion.expanded,
        intent: queryExpansion.analysis.intent,
        topics: queryExpansion.analysis.topics,
        timeScope: queryExpansion.analysis.timeScope,
      }));

      // Step 2: Search with providers
      await sendProgress("searching", 20, `Searching with ${availableProviders.join(", ")}...`);

      const searchResponse = await searchMultiProvider(availableProviders, {
        query: queryExpansion.expanded,
        maxResults,
        timeRange: mapTimeScopeToTimeRange(queryExpansion.analysis.timeScope),
      });

      if (searchResponse.results.length === 0) {
        return {
          results: [],
          totalFound: 0,
          queryExpansion: {
            original: queryExpansion.original,
            expanded: queryExpansion.expanded,
            analysis: queryExpansion.analysis,
          },
        };
      }

      // Step 3: Analyze results with progress
      await sendProgress("analyzing", 30, `Analyzing ${searchResponse.results.length} results...`);

      // Use analyzeResults with onProgress callback
      const analyzedResults = await analyzeResults(
        searchResponse.results,
        query.trim(),
        brandVoicePrompt,
        async (completed: number, total: number) => {
          // Calculate progress (30% to 90% during analysis)
          const analysisProgress = 30 + Math.floor((completed / total) * 60);
          const currentResult = searchResponse.results[completed - 1];

          await sendProgress(
            "analyzing",
            analysisProgress,
            JSON.stringify({
              current: completed,
              total,
              title: currentResult?.title || "Analyzing...",
            })
          );
        }
      );

      // Filter and sort by AI score
      const sortedResults = filterAndSortResults(analyzedResults, 3);

      await sendProgress("complete", 100, "Search complete");

      return {
        results: sortedResults,
        totalFound: sortedResults.length,
        queryExpansion: {
          original: queryExpansion.original,
          expanded: queryExpansion.expanded,
          analysis: queryExpansion.analysis,
        },
        providers: searchResponse.provider,
      };
    },
  });
}

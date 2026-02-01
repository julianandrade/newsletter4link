/**
 * Search History API
 *
 * POST /api/search/history - Save current search results
 * GET /api/search/history - List saved searches (paginated)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import type { AnalyzedResult } from "@/lib/search/result-analyzer";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface QueryAnalysis {
  intent: string;
  timeScope: string;
  topics: string[];
}

interface SaveSearchBody {
  query: string;
  queryExpanded?: string;
  queryAnalysis?: QueryAnalysis;
  results: AnalyzedResult[];
}

/**
 * POST /api/search/history
 * Save current search results to history
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    const body: SaveSearchBody = await request.json();
    const { query, queryExpanded, queryAnalysis, results } = body;

    // Validation
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Query is required and must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (!Array.isArray(results)) {
      return NextResponse.json(
        { error: "Results must be an array" },
        { status: 400 }
      );
    }

    // Create search history entry (cast to Function - tenant client adds organizationId)
    const searchHistory = await (ctx.db.searchHistory.create as Function)({
      data: {
        query: query.trim(),
        queryExpanded: queryExpanded?.trim() || null,
        queryAnalysis: queryAnalysis ?? Prisma.DbNull,
        resultCount: results.length,
        results: results,
      },
    });

    return NextResponse.json(
      {
        id: searchHistory.id,
        searchedAt: searchHistory.searchedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error saving search history:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to save search history" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/search/history
 * List saved searches (paginated)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));
    const skip = (validPage - 1) * validLimit;

    // Get total count
    const total = await ctx.db.searchHistory.count();

    // Get paginated history without full results array
    const historyRecords = await ctx.db.searchHistory.findMany({
      orderBy: { searchedAt: "desc" },
      skip,
      take: validLimit,
      select: {
        id: true,
        query: true,
        queryExpanded: true,
        queryAnalysis: true,
        resultCount: true,
        searchedAt: true,
        convertedToTopicId: true,
      },
    });

    const totalPages = Math.ceil(total / validLimit);

    return NextResponse.json({
      history: historyRecords,
      total,
      page: validPage,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching search history:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch search history" },
      { status: 500 }
    );
  }
}

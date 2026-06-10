/**
 * Search History Convert to Topic API
 *
 * POST /api/search/history/[id]/convert - Convert search history to SearchTopic
 */

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface ConvertBody {
  name?: string;
}

/**
 * POST /api/search/history/[id]/convert
 * Convert a saved search to a SearchTopic for ongoing monitoring
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireOrgContext();
    const { id } = await params;

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    // Get the search history entry
    const searchHistory = await ctx.db.searchHistory.findUnique({
      where: { id },
    });

    if (!searchHistory) {
      return NextResponse.json(
        { error: "Search history not found" },
        { status: 404 }
      );
    }

    // Check if already converted
    if (searchHistory.convertedToTopicId) {
      const existingTopic = await ctx.db.searchTopic.findUnique({
        where: { id: searchHistory.convertedToTopicId },
      });

      if (existingTopic) {
        return NextResponse.json(
          { error: "Search already converted to topic", topicId: existingTopic.id },
          { status: 400 }
        );
      }
    }

    // Parse optional body for custom name
    let customName: string | undefined;
    try {
      const body: ConvertBody = await request.json();
      customName = body.name?.trim();
    } catch {
      // Body is optional, ignore parse errors
    }

    // Create the topic name from query or custom name
    const topicName = customName || `Search: ${searchHistory.query.slice(0, 50)}${searchHistory.query.length > 50 ? "..." : ""}`;

    // Create the SearchTopic (cast to Function to bypass type check - tenant client adds organizationId)
    const topic = await (ctx.db.searchTopic.create as Function)({
      data: {
        name: topicName,
        query: searchHistory.query,
        queryExpanded: searchHistory.queryExpanded,
        providers: ["tavily"],
        schedule: "MANUAL",
        timeRange: "WEEK",
        maxResults: 20,
        isActive: true,
      },
    });

    // Import results from history to the new topic
    const results = searchHistory.results as Array<{
      url: string;
      title: string;
      snippet: string;
      content?: string;
      publishedAt?: string;
      source?: string;
      author?: string;
      imageUrl?: string;
      rawScore?: number;
      aiScore?: number;
      aiSummary?: string;
      aiTopics?: string[];
      aiSentiment?: string;
      aiRelevanceNote?: string;
    }>;

    if (Array.isArray(results) && results.length > 0) {
      // Import results to the new topic
      for (const result of results) {
        try {
          await prisma.searchResult.create({
            data: {
              searchTopicId: topic.id,
              url: result.url,
              title: result.title,
              snippet: result.snippet,
              content: result.content || null,
              publishedAt: result.publishedAt ? new Date(result.publishedAt) : null,
              source: result.source || null,
              author: result.author || null,
              imageUrl: result.imageUrl || null,
              provider: "tavily",
              rawScore: result.rawScore || null,
              aiScore: result.aiScore || null,
              aiSummary: result.aiSummary || null,
              aiTopics: result.aiTopics || [],
              aiSentiment: result.aiSentiment || null,
              aiRelevanceNote: result.aiRelevanceNote || null,
              status: "NEW",
            },
          });
        } catch (e) {
          // Skip duplicate URLs silently
          logger.error("Error importing result to topic", e);
        }
      }
    }

    // Update the search history with the converted topic ID
    await ctx.db.searchHistory.update({
      where: { id },
      data: { convertedToTopicId: topic.id },
    });

    // Return the topic with result count
    const resultCount = await prisma.searchResult.count({
      where: { searchTopicId: topic.id },
    });

    return NextResponse.json({
      topicId: topic.id,
      topic: {
        ...topic,
        resultCount,
      },
    });
  } catch (error) {
    logger.error("Error converting search to topic", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to convert search to topic" },
      { status: 500 }
    );
  }
}

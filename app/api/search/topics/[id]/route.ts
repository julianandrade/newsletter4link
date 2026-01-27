import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { searchMultiProvider } from "@/lib/search/providers";
import { batchAnalyzeResults } from "@/lib/search/result-analyzer";
import { SearchTimeRange } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/search/topics/[id]
 * Get a search topic with its results
 */
export async function GET(
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

    const topic = await ctx.db.searchTopic.findUnique({
      where: { id },
    });

    if (!topic) {
      return NextResponse.json(
        { error: "Search topic not found" },
        { status: 404 }
      );
    }

    // Get results separately
    const results = await prisma.searchResult.findMany({
      where: { searchTopicId: id },
      orderBy: { aiScore: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...topic,
        results,
      },
    });
  } catch (error) {
    console.error("Error fetching search topic:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch search topic" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/search/topics/[id]
 * Run a search for a topic (manual trigger)
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

    const topic = await ctx.db.searchTopic.findUnique({
      where: { id },
    });

    if (!topic) {
      return NextResponse.json(
        { error: "Search topic not found" },
        { status: 404 }
      );
    }

    // Map time range enum to provider format
    const timeRangeMap: Record<SearchTimeRange, "day" | "week" | "month" | "year"> = {
      DAY: "day",
      WEEK: "week",
      MONTH: "month",
      YEAR: "year",
    };

    // Execute search
    const searchResponse = await searchMultiProvider(topic.providers, {
      query: topic.queryExpanded || topic.query,
      maxResults: topic.maxResults,
      timeRange: timeRangeMap[topic.timeRange],
    });

    // Get org settings for brand voice
    const orgSettings = await ctx.db.orgSettings.findUnique();

    // Analyze results
    const analyzedResults = await batchAnalyzeResults(
      searchResponse.results,
      topic.query,
      orgSettings?.brandVoicePrompt
    );

    // Save results to database
    let newResultsCount = 0;
    for (const result of analyzedResults) {
      try {
        await prisma.searchResult.upsert({
          where: {
            url_searchTopicId: {
              url: result.url,
              searchTopicId: topic.id,
            },
          },
          create: {
            searchTopicId: topic.id,
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            content: result.content,
            publishedAt: result.publishedAt,
            source: result.source,
            author: result.author,
            imageUrl: result.imageUrl,
            provider: searchResponse.provider,
            rawScore: result.rawScore,
            aiScore: result.aiScore,
            aiSummary: result.aiSummary,
            aiTopics: result.aiTopics,
            aiSentiment: result.aiSentiment,
            aiRelevanceNote: result.aiRelevanceNote,
          },
          update: {
            aiScore: result.aiScore,
            aiSummary: result.aiSummary,
            aiTopics: result.aiTopics,
            aiSentiment: result.aiSentiment,
            aiRelevanceNote: result.aiRelevanceNote,
          },
        });
        newResultsCount++;
      } catch (e) {
        console.error("Error saving search result:", e);
      }
    }

    // Update topic last run time
    const nextRunAt = topic.schedule === "DAILY"
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : topic.schedule === "WEEKLY"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : null;

    await ctx.db.searchTopic.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
      },
    });

    // Fetch updated topic with results
    const updatedTopic = await ctx.db.searchTopic.findUnique({
      where: { id },
    });

    const updatedResults = await prisma.searchResult.findMany({
      where: { searchTopicId: id },
      orderBy: { aiScore: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updatedTopic,
        results: updatedResults,
      },
      message: `Search completed. Found ${newResultsCount} results.`,
    });
  } catch (error) {
    console.error("Error running search:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to run search" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/search/topics/[id]
 * Update a search topic
 */
export async function PATCH(
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

    const topic = await ctx.db.searchTopic.findUnique({
      where: { id },
    });

    if (!topic) {
      return NextResponse.json(
        { error: "Search topic not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, schedule, timeRange, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (schedule !== undefined) updateData.schedule = schedule;
    if (timeRange !== undefined) updateData.timeRange = timeRange;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await ctx.db.searchTopic.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating search topic:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to update search topic" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/search/topics/[id]
 * Delete a search topic and its results
 */
export async function DELETE(
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

    const topic = await ctx.db.searchTopic.findUnique({
      where: { id },
    });

    if (!topic) {
      return NextResponse.json(
        { error: "Search topic not found" },
        { status: 404 }
      );
    }

    await ctx.db.searchTopic.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Search topic deleted",
    });
  } catch (error) {
    console.error("Error deleting search topic:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to delete search topic" },
      { status: 500 }
    );
  }
}

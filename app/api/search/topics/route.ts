import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { processQuery } from "@/lib/search/query-processor";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/search/topics
 * List all saved search topics for the organization
 */
export async function GET() {
  try {
    const ctx = await requireOrgContext();

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    const topics = await ctx.db.searchTopic.findMany({
      orderBy: { updatedAt: "desc" },
    });

    // Get result counts for each topic
    const topicsWithCounts = await Promise.all(
      topics.map(async (topic) => {
        const resultCount = await prisma.searchResult.count({
          where: { searchTopicId: topic.id },
        });
        return {
          id: topic.id,
          name: topic.name,
          description: topic.description,
          query: topic.query,
          schedule: topic.schedule,
          timeRange: topic.timeRange,
          isActive: topic.isActive,
          lastRunAt: topic.lastRunAt,
          nextRunAt: topic.nextRunAt,
          resultCount,
          createdAt: topic.createdAt,
          updatedAt: topic.updatedAt,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: topicsWithCounts,
    });
  } catch (error) {
    console.error("Error fetching search topics:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to fetch search topics" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/search/topics
 * Create a new saved search topic
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();

    // Check feature access
    if (!ctx.features.trendRadar) {
      return NextResponse.json(
        { error: "Search feature requires Professional plan or higher" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, query, description, schedule = "MANUAL", timeRange = "WEEK" } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name is required and must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json(
        { error: "Query is required and must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Process query with Claude to get expanded version
    const queryExpansion = await processQuery(query.trim());

    // Calculate next run time based on schedule
    let nextRunAt: Date | null = null;
    if (schedule === "DAILY") {
      nextRunAt = new Date();
      nextRunAt.setHours(nextRunAt.getHours() + 24);
    } else if (schedule === "WEEKLY") {
      nextRunAt = new Date();
      nextRunAt.setDate(nextRunAt.getDate() + 7);
    }

    // Note: TenantClient auto-adds organizationId
    const topic = await (ctx.db.searchTopic.create as Function)({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        query: query.trim(),
        queryExpanded: queryExpansion.expanded,
        schedule,
        timeRange,
        nextRunAt,
        providers: ["tavily"],
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: topic,
        message: "Search topic created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating search topic:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to create search topic" },
      { status: 500 }
    );
  }
}

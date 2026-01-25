import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type DateRange = "7d" | "14d" | "30d" | "90d" | "custom";

function getDateRangeFilter(
  dateRange: DateRange | null,
  startDate: string | null,
  endDate: string | null
): Date | null {
  if (dateRange === "custom" && startDate) {
    return new Date(startDate);
  }

  const daysMap: Record<string, number> = {
    "7d": 7,
    "14d": 14,
    "30d": 30,
    "90d": 90,
  };

  const days = dateRange ? daysMap[dateRange] : 14; // Default to 14 days
  if (!days) return null;

  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function getEndDateFilter(
  dateRange: DateRange | null,
  endDate: string | null
): Date | null {
  if (dateRange === "custom" && endDate) {
    // Set to end of day
    const date = new Date(endDate);
    date.setHours(23, 59, 59, 999);
    return date;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");
    const dateRange = searchParams.get("dateRange") as DateRange | null;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Get all sent editions
    const editions = await prisma.edition.findMany({
      where: { status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        week: true,
        year: true,
        sentAt: true,
      },
    });

    // Build where clause for email events
    const whereClause = editionId ? { editionId } : {};

    // Get aggregated event counts
    const eventCounts = await prisma.emailEvent.groupBy({
      by: ["eventType"],
      where: whereClause,
      _count: { id: true },
    });

    // Convert to metrics object
    const counts: Record<string, number> = {};
    for (const event of eventCounts) {
      counts[event.eventType] = event._count.id;
    }

    const sent = counts["SENT"] || 0;
    const delivered = counts["DELIVERED"] || 0;
    const opened = counts["OPENED"] || 0;
    const clicked = counts["CLICKED"] || 0;
    const bounced = counts["BOUNCED"] || 0;
    const unsubscribed = counts["UNSUBSCRIBED"] || 0;

    const metrics = {
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      unsubscribed,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      unsubscribeRate: delivered > 0 ? (unsubscribed / delivered) * 100 : 0,
    };

    // Get top clicked links
    const clickEvents = await prisma.emailEvent.findMany({
      where: {
        ...whereClause,
        eventType: "CLICKED",
      },
      select: { metadata: true },
    });

    // Aggregate click counts by URL
    const linkCounts: Record<string, number> = {};
    for (const event of clickEvents) {
      const metadata = event.metadata as { url?: string } | null;
      if (metadata?.url) {
        linkCounts[metadata.url] = (linkCounts[metadata.url] || 0) + 1;
      }
    }

    const topLinks = Object.entries(linkCounts)
      .map(([url, clicks]) => ({ url, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Get engagement timeline based on date range
    const timelineStartDate = getDateRangeFilter(dateRange, startDate, endDate);
    const timelineEndDate = getEndDateFilter(dateRange, endDate);

    const timelineTimestampFilter: { gte?: Date; lte?: Date } = {};
    if (timelineStartDate) {
      timelineTimestampFilter.gte = timelineStartDate;
    }
    if (timelineEndDate) {
      timelineTimestampFilter.lte = timelineEndDate;
    }

    const timelineEvents = await prisma.emailEvent.findMany({
      where: {
        ...whereClause,
        eventType: { in: ["OPENED", "CLICKED"] },
        ...(Object.keys(timelineTimestampFilter).length > 0
          ? { timestamp: timelineTimestampFilter }
          : {}),
      },
      select: {
        eventType: true,
        timestamp: true,
      },
      orderBy: { timestamp: "asc" },
    });

    // Group by date
    const timelineMap: Record<string, { opens: number; clicks: number }> = {};

    for (const event of timelineEvents) {
      const dateKey = event.timestamp.toISOString().split("T")[0];
      if (!timelineMap[dateKey]) {
        timelineMap[dateKey] = { opens: 0, clicks: 0 };
      }
      if (event.eventType === "OPENED") {
        timelineMap[dateKey].opens++;
      } else if (event.eventType === "CLICKED") {
        timelineMap[dateKey].clicks++;
      }
    }

    const timeline = Object.entries(timelineMap)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      editions,
      metrics,
      topLinks,
      timeline,
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

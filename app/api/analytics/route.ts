import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type DateRange = "7d" | "14d" | "30d" | "90d" | "custom";

// Language label mappings
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  "pt-pt": "Portuguese (PT)",
  "pt-br": "Portuguese (BR)",
  es: "Spanish",
  ar: "Arabic",
};

// Style labels are title case of the value
function getStyleLabel(style: string): string {
  return style.charAt(0).toUpperCase() + style.slice(1);
}

interface SegmentData {
  count: number;
  subscriberIds: string[];
}

interface SegmentResult {
  language?: string;
  style?: string;
  label: string;
  count: number;
  openRate: number;
}

function getDateRangeFilter(
  dateRange: DateRange | null,
  startDate: string | null,
  endDate: string | null
): Date | null {
  if (dateRange === "custom" && startDate) {
    const date = new Date(startDate);
    if (isNaN(date.getTime())) {
      return null; // Invalid date, fall back to default
    }
    return date;
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
    const date = new Date(endDate);
    if (isNaN(date.getTime())) {
      return null; // Invalid date, fall back to default
    }
    // Set to end of day
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

    const topLinksBasic = Object.entries(linkCounts)
      .map(([url, clicks]) => ({ url, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Extract URLs to query for article information
    const urls = topLinksBasic.map((link) => link.url);

    // Query Article table to match URLs with article titles
    const articles = await prisma.article.findMany({
      where: { sourceUrl: { in: urls } },
      select: { sourceUrl: true, title: true, category: true },
    });

    // Build a map of URL -> article info for quick lookup
    const articleMap = new Map(
      articles.map((article) => [
        article.sourceUrl,
        { title: article.title, category: article.category },
      ])
    );

    // Enhance topLinks with article information
    const topLinks = topLinksBasic.map((link) => {
      const articleInfo = articleMap.get(link.url);
      return {
        url: link.url,
        clicks: link.clicks,
        title: articleInfo?.title || humanizeUrl(link.url),
        category: articleInfo?.category || [],
        isArticle: !!articleInfo,
      };
    });

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

    // Get subscriber segmentation data
    const activeSubscribers = await prisma.subscriber.findMany({
      where: { active: true },
      select: {
        id: true,
        preferredLanguage: true,
        preferredStyle: true,
      },
    });

    // Group subscribers by language and style
    const byLanguageMap: Record<string, SegmentData> = {};
    const byStyleMap: Record<string, SegmentData> = {};

    for (const subscriber of activeSubscribers) {
      const lang = subscriber.preferredLanguage || "en";
      const style = subscriber.preferredStyle || "comprehensive";

      if (!byLanguageMap[lang]) {
        byLanguageMap[lang] = { count: 0, subscriberIds: [] };
      }
      byLanguageMap[lang].count++;
      byLanguageMap[lang].subscriberIds.push(subscriber.id);

      if (!byStyleMap[style]) {
        byStyleMap[style] = { count: 0, subscriberIds: [] };
      }
      byStyleMap[style].count++;
      byStyleMap[style].subscriberIds.push(subscriber.id);
    }

    // Get all subscriber IDs for open rate calculation
    const allSubscriberIds = activeSubscribers.map((s) => s.id);

    // Get DELIVERED and OPENED events per subscriber for open rate calculation
    // We need delivered count per subscriber to calculate accurate open rates
    const deliveredEvents = await prisma.emailEvent.groupBy({
      by: ["subscriberId"],
      where: {
        ...whereClause,
        subscriberId: { in: allSubscriberIds },
        eventType: "DELIVERED",
      },
      _count: { id: true },
    });

    const openedEvents = await prisma.emailEvent.groupBy({
      by: ["subscriberId"],
      where: {
        ...whereClause,
        subscriberId: { in: allSubscriberIds },
        eventType: "OPENED",
      },
      _count: { id: true },
    });

    // Create maps for quick lookup
    const deliveredBySubscriber = new Map(
      deliveredEvents.map((e) => [e.subscriberId, e._count.id])
    );
    const openedBySubscriber = new Map(
      openedEvents.map((e) => [e.subscriberId, e._count.id])
    );

    // Calculate open rate for each segment
    function calculateSegmentOpenRate(subscriberIds: string[]): number {
      let totalDelivered = 0;
      let totalOpened = 0;

      for (const id of subscriberIds) {
        totalDelivered += deliveredBySubscriber.get(id) || 0;
        totalOpened += openedBySubscriber.get(id) || 0;
      }

      return totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    }

    // Build segmentation results
    const byLanguage: SegmentResult[] = Object.entries(byLanguageMap)
      .map(([language, data]) => ({
        language,
        label: LANGUAGE_LABELS[language] || language,
        count: data.count,
        openRate: calculateSegmentOpenRate(data.subscriberIds),
      }))
      .sort((a, b) => b.count - a.count);

    const byStyle: SegmentResult[] = Object.entries(byStyleMap)
      .map(([style, data]) => ({
        style,
        label: getStyleLabel(style),
        count: data.count,
        openRate: calculateSegmentOpenRate(data.subscriberIds),
      }))
      .sort((a, b) => b.count - a.count);

    const segmentation = {
      byLanguage,
      byStyle,
    };

    return NextResponse.json({
      editions,
      metrics,
      topLinks,
      timeline,
      segmentation,
    });
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

/**
 * Creates a human-readable title from a URL
 * e.g., "https://techcrunch.com/2026/01/ai-breakthrough/" -> "AI Breakthrough - TechCrunch"
 */
function humanizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");

    // Extract domain name and format it nicely
    const domainParts = hostname.split(".");
    const siteName =
      domainParts.length > 1
        ? domainParts[domainParts.length - 2]
        : domainParts[0];
    const formattedSiteName =
      siteName.charAt(0).toUpperCase() + siteName.slice(1);

    // Extract meaningful path segments
    const pathSegments = parsed.pathname
      .split("/")
      .filter((segment) => {
        // Filter out empty segments, numeric-only segments (dates, IDs), and common noise
        return (
          segment &&
          !/^\d+$/.test(segment) &&
          !/^\d{4}$/.test(segment) && // year
          !/^\d{2}$/.test(segment) && // month/day
          !["index", "article", "post", "blog", "news"].includes(
            segment.toLowerCase()
          )
        );
      })
      .slice(-2); // Take last 2 meaningful segments

    if (pathSegments.length > 0) {
      // Convert slug to title case: "ai-breakthrough" -> "AI Breakthrough"
      const title = pathSegments
        .map((segment) =>
          segment
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase())
        )
        .join(" - ");
      return `${title} - ${formattedSiteName}`;
    }

    return formattedSiteName;
  } catch {
    // If URL parsing fails, return a truncated version
    return url.length > 60 ? url.substring(0, 57) + "..." : url;
  }
}

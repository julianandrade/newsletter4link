import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

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

// Engagement health thresholds
const NEW_SUBSCRIBER_THRESHOLD = 3; // Subscribers with fewer than this many sends are "New"

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
    const ctx = await requireOrgContext();
    const { db, organization } = ctx;

    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get("editionId");
    const dateRange = searchParams.get("dateRange") as DateRange | null;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Get all sent editions (tenant-scoped)
    const editions = await db.edition.findMany({
      where: { status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: {
        id: true,
        week: true,
        year: true,
        sentAt: true,
      },
    });

    // Get all edition IDs for this organization for filtering email events
    const orgEditionIds = editions.map((e) => e.id);

    // Build where clause for email events - filter by org's editions
    const whereClause = editionId
      ? { editionId }
      : { editionId: { in: orgEditionIds } };

    // Get aggregated event counts
    const eventCounts = await db.$raw.emailEvent.groupBy({
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
    const clickEvents = await db.$raw.emailEvent.findMany({
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

    // Query Article table to match URLs with article titles (tenant-scoped)
    const articles = await db.article.findMany({
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

    const timelineEvents = await db.$raw.emailEvent.findMany({
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
    const activeSubscribers = await db.subscriber.findMany({
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
    const deliveredEvents = await db.$raw.emailEvent.groupBy({
      by: ["subscriberId"],
      where: {
        ...whereClause,
        subscriberId: { in: allSubscriberIds },
        eventType: "DELIVERED",
      },
      _count: { id: true },
    });

    const openedEvents = await db.$raw.emailEvent.groupBy({
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

    // Calculate engagement health scoring with subscriber classification
    // Priority: New (if <3 sends) -> Active (if activity in 30d) -> Dormant (if activity in 30-90d) -> At Risk
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Get SENT events count per subscriber to identify "New" subscribers
    const sentEventsPerSubscriber = await db.$raw.emailEvent.groupBy({
      by: ["subscriberId"],
      where: {
        subscriberId: { in: allSubscriberIds },
        eventType: "SENT",
      },
      _count: { id: true },
    });

    const sentCountBySubscriber = new Map(
      sentEventsPerSubscriber.map((e) => [e.subscriberId, e._count.id])
    );

    // Get latest OPENED or CLICKED event timestamp per subscriber
    // Only query events from last 90 days since older events won't change classification
    // (subscribers with no activity in 90+ days automatically fall to "At Risk")
    const activityEvents = await db.$raw.emailEvent.findMany({
      where: {
        subscriberId: { in: allSubscriberIds },
        eventType: { in: ["OPENED", "CLICKED"] },
        timestamp: { gte: ninetyDaysAgo },
      },
      select: {
        subscriberId: true,
        timestamp: true,
      },
      orderBy: { timestamp: "desc" },
    });

    // Build map of subscriber -> latest activity timestamp
    const latestActivityBySubscriber = new Map<string, Date>();
    for (const event of activityEvents) {
      if (!latestActivityBySubscriber.has(event.subscriberId)) {
        latestActivityBySubscriber.set(event.subscriberId, event.timestamp);
      }
    }

    // Classify subscribers
    let activeCount = 0;
    let dormantCount = 0;
    let atRiskCount = 0;
    let newCount = 0;

    for (const subscriberId of allSubscriberIds) {
      const sentCount = sentCountBySubscriber.get(subscriberId) || 0;
      const lastActivity = latestActivityBySubscriber.get(subscriberId);

      // Priority 1: New subscriber (received fewer than threshold SENT events)
      if (sentCount < NEW_SUBSCRIBER_THRESHOLD) {
        newCount++;
        continue;
      }

      // Priority 2: Active (opened/clicked in last 30 days)
      if (lastActivity && lastActivity >= thirtyDaysAgo) {
        activeCount++;
        continue;
      }

      // Priority 3: Dormant (last activity 30-90 days ago)
      if (lastActivity && lastActivity >= ninetyDaysAgo && lastActivity < thirtyDaysAgo) {
        dormantCount++;
        continue;
      }

      // Priority 4: At Risk (no activity in 90+ days or never engaged)
      atRiskCount++;
    }

    const totalSubscribers = allSubscriberIds.length;
    const engagementHealth = {
      active: {
        count: activeCount,
        percentage: totalSubscribers > 0 ? (activeCount / totalSubscribers) * 100 : 0,
      },
      dormant: {
        count: dormantCount,
        percentage: totalSubscribers > 0 ? (dormantCount / totalSubscribers) * 100 : 0,
      },
      atRisk: {
        count: atRiskCount,
        percentage: totalSubscribers > 0 ? (atRiskCount / totalSubscribers) * 100 : 0,
      },
      new: {
        count: newCount,
        percentage: totalSubscribers > 0 ? (newCount / totalSubscribers) * 100 : 0,
      },
    };

    return NextResponse.json({
      editions,
      metrics,
      topLinks,
      timeline,
      segmentation,
      engagementHealth,
    });
  } catch (error) {
    console.error("Analytics API error:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

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

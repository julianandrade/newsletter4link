import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface TrendDriver {
  name: string;
  pct: number;
}

export interface TrendArticle {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  relevanceScore: number | null;
}

export interface Trend {
  key: string;
  name: string;
  /** Weekly mention counts, oldest bucket first. */
  series: number[];
  /** Percentage change of the last 14 days against the 14 before it. */
  delta: number | null;
  mentions: number;
  /** Days between the first and latest mention in the window. */
  spanDays: number;
  drivers: TrendDriver[];
  articles: TrendArticle[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

/**
 * GET /api/trends
 *
 * There is no stored velocity table in this schema, so movement is computed on
 * request from Article.category[] over the requested window. Every figure here
 * is derived from real rows: nothing is seeded or estimated.
 *
 * Query params:
 * - days: window length, 14-365 (default 90)
 * - limit: how many topics to return (default 12)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const { db } = ctx;

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      365,
      Math.max(14, parseInt(searchParams.get("days") || "90", 10) || 90)
    );
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "12", 10) || 12)
    );

    const now = Date.now();
    const from = new Date(now - days * 24 * 60 * 60 * 1000);

    const articles = await db.article.findMany({
      where: {
        publishedAt: { gte: from },
        status: { not: "REJECTED" },
      },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        publishedAt: true,
        relevanceScore: true,
        category: true,
      },
    });

    const bucketCount = Math.max(4, Math.min(16, Math.round(days / 7)));
    const bucketMs = (days * 24 * 60 * 60 * 1000) / bucketCount;

    interface Accumulator {
      series: number[];
      recent: number;
      previous: number;
      mentions: number;
      hosts: Map<string, number>;
      articles: TrendArticle[];
      firstSeen: number;
      lastSeen: number;
    }

    const byTopic = new Map<string, Accumulator>();

    for (const article of articles) {
      const at = article.publishedAt.getTime();
      const age = now - at;
      const bucket = Math.min(
        bucketCount - 1,
        Math.max(0, bucketCount - 1 - Math.floor(age / bucketMs))
      );

      for (const rawTopic of article.category) {
        const topic = rawTopic.trim();
        if (!topic) continue;

        let entry = byTopic.get(topic);
        if (!entry) {
          entry = {
            series: new Array(bucketCount).fill(0),
            recent: 0,
            previous: 0,
            mentions: 0,
            hosts: new Map(),
            articles: [],
            firstSeen: at,
            lastSeen: at,
          };
          byTopic.set(topic, entry);
        }

        entry.series[bucket] += 1;
        entry.mentions += 1;
        entry.firstSeen = Math.min(entry.firstSeen, at);
        entry.lastSeen = Math.max(entry.lastSeen, at);

        if (age <= 2 * WEEK_MS) entry.recent += 1;
        else if (age <= 4 * WEEK_MS) entry.previous += 1;

        const host = hostOf(article.sourceUrl);
        entry.hosts.set(host, (entry.hosts.get(host) ?? 0) + 1);

        // Articles arrive newest-first, so the first few are the freshest.
        if (entry.articles.length < 8) {
          entry.articles.push({
            id: article.id,
            title: article.title,
            sourceUrl: article.sourceUrl,
            publishedAt: article.publishedAt.toISOString(),
            relevanceScore: article.relevanceScore,
          });
        }
      }
    }

    const trends: Trend[] = [...byTopic.entries()]
      .map(([name, entry]) => {
        // A topic with no prior-fortnight baseline has no honest percentage.
        const delta =
          entry.previous > 0
            ? Math.round(((entry.recent - entry.previous) / entry.previous) * 100)
            : null;

        const driverTotal = [...entry.hosts.values()].reduce((a, b) => a + b, 0);
        const drivers = [...entry.hosts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([host, count]) => ({
            name: host,
            pct: driverTotal ? Math.round((count / driverTotal) * 100) : 0,
          }));

        return {
          key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name,
          series: entry.series,
          delta,
          mentions: entry.mentions,
          spanDays: Math.max(
            1,
            Math.round((entry.lastSeen - entry.firstSeen) / (24 * 60 * 60 * 1000))
          ),
          drivers,
          articles: entry.articles,
        };
      })
      // Movement first, then volume, so an accelerating niche topic can outrank noise.
      .sort((a, b) => {
        const da = a.delta ?? -Infinity;
        const dbv = b.delta ?? -Infinity;
        if (da !== dbv) return dbv - da;
        return b.mentions - a.mentions;
      })
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      data: trends,
      meta: {
        days,
        bucketCount,
        bucketLabel: "week",
        articlesConsidered: articles.length,
        topicsFound: byTopic.size,
        /** Below this the window is too short for movement to mean anything. */
        hasEnoughHistory: articles.length >= 20 && byTopic.size > 0,
      },
    });
  } catch (error) {
    console.error("Error computing trends:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Topic movement, computed from articles rather than stored.
 *
 * There is no velocity table in this schema, so both the Trends screen and the
 * newsletter's trend radar derive their figures here. Keeping it in one pure
 * function is the point: if the two surfaces computed movement separately they
 * would eventually disagree, and the newsletter is the copy that leaves the
 * building.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

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

export interface TrendMeta {
  days: number;
  bucketCount: number;
  bucketLabel: "week";
  articlesConsidered: number;
  topicsFound: number;
  /** Below this the window is too short for movement to mean anything. */
  hasEnoughHistory: boolean;
}

/** The article shape the computation needs, so callers can select only these. */
export interface TrendInputArticle {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: Date;
  relevanceScore: number | null;
  category: string[];
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

export function clampDays(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 90;
  return Math.min(365, Math.max(14, parsed));
}

export function clampLimit(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(50, Math.max(1, parsed));
}

/**
 * @param articles newest first, already filtered to the window
 * @param now window end, passed in rather than read from the clock so this stays testable
 */
export function computeTrends(
  articles: TrendInputArticle[],
  options: { days: number; limit: number; now: number }
): { trends: Trend[]; meta: TrendMeta } {
  const { days, limit, now } = options;

  const bucketCount = Math.max(4, Math.min(16, Math.round(days / 7)));
  const bucketMs = (days * DAY_MS) / bucketCount;

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
        spanDays: Math.max(1, Math.round((entry.lastSeen - entry.firstSeen) / DAY_MS)),
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

  return {
    trends,
    meta: {
      days,
      bucketCount,
      bucketLabel: "week",
      articlesConsidered: articles.length,
      topicsFound: byTopic.size,
      hasEnoughHistory: articles.length >= 20 && byTopic.size > 0,
    },
  };
}

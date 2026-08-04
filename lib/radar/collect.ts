import { prisma } from "@/lib/db";
import {
  countArxiv,
  countHackerNews,
  RATE_LIMIT_MS,
  SourceUnavailable,
  utcDay,
} from "@/lib/radar/sources";
import { PRECISION_THRESHOLD } from "@/lib/radar/watchlist";

/**
 * RQ-004 phase A: collect one day, for every active entity, from both sources.
 *
 * Deliberately small. No scoring, no stage classification, no snapshots, no report:
 * phase A exists to accumulate the history that phase B's gate will be measured
 * against, and the gate can kill the feature. Building the scorer first would be
 * paying for eight sub-requirements before knowing the premise holds.
 *
 * Written against `prisma` rather than a tenant client on purpose. Signal points are
 * global: how often an entity was mentioned on Hacker News is a fact about the
 * world, counted once, read by every organization that watches it. Nothing here
 * reads or writes anything organization-scoped.
 */

export type CollectSource = "HN" | "ARXIV";

export interface CollectResult {
  date: string;
  entities: number;
  requested: number;
  written: number;
  skipped: number;
  gaps: number;
  /** Per source, so a source being down is visible rather than averaged away. */
  bySource: Record<CollectSource, { written: number; gaps: number }>;
  durationMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A day is only collected once it is over.
 *
 * Counting today at 09:00 records a partial day that later looks like a quiet one,
 * and because collection is forward-only that wrong number can never be corrected
 * from an archive. So the collector always works on yesterday.
 */
export function targetDay(now: Date = new Date()): Date {
  return utcDay(new Date(now.getTime() - 86_400_000));
}

interface Job {
  entityId: string;
  slug: string;
  source: CollectSource;
  query: string;
}

/**
 * Collect one day.
 *
 * Sequential, with the interval each source asks for. Parallelism would finish
 * sooner and is exactly what gets an unauthenticated client rate limited: at 23
 * entities this takes about 25 seconds for Hacker News and 70 for arXiv, which fits
 * inside one cron invocation with room to spare.
 */
export async function collectDay(options: {
  date?: Date;
  /** Restrict to one source, for a retry after one of them was down. */
  only?: CollectSource;
  now?: Date;
} = {}): Promise<CollectResult> {
  const startedAt = Date.now();
  const date = options.date ? utcDay(options.date) : targetDay(options.now);

  const entities = await prisma.radarEntity.findMany({
    where: { active: true },
    select: { id: true, slug: true, hnQuery: true, arxivQuery: true },
    orderBy: { slug: "asc" },
  });

  const jobs: Job[] = [];

  for (const entity of entities) {
    if (entity.hnQuery && options.only !== "ARXIV") {
      jobs.push({ entityId: entity.id, slug: entity.slug, source: "HN", query: entity.hnQuery });
    }
    if (entity.arxivQuery && options.only !== "HN") {
      jobs.push({
        entityId: entity.id,
        slug: entity.slug,
        source: "ARXIV",
        query: entity.arxivQuery,
      });
    }
  }

  // Already-collected pairs are skipped rather than re-fetched. The unique key makes
  // a re-run harmless either way, but a cron that fires twice should not spend two
  // minutes on the same numbers.
  const existing = await prisma.signalPoint.findMany({
    where: { date, entityId: { in: entities.map((entity) => entity.id) } },
    select: { entityId: true, source: true },
  });

  const done = new Set(existing.map((row) => `${row.entityId}:${row.source}`));

  const result: CollectResult = {
    date: date.toISOString().slice(0, 10),
    entities: entities.length,
    requested: jobs.length,
    written: 0,
    skipped: 0,
    gaps: 0,
    bySource: { HN: { written: 0, gaps: 0 }, ARXIV: { written: 0, gaps: 0 } },
    durationMs: 0,
  };

  for (const job of jobs) {
    if (done.has(`${job.entityId}:${job.source}`)) {
      result.skipped += 1;
      continue;
    }

    try {
      const counted =
        job.source === "HN"
          ? await countHackerNews(job.query, { date })
          : await countArxiv(job.query, { date });

      // Upsert, so the same day collected twice updates rather than duplicates.
      await prisma.signalPoint.upsert({
        where: {
          entityId_source_date: { entityId: job.entityId, source: job.source, date },
        },
        create: {
          entityId: job.entityId,
          source: job.source,
          date,
          count: counted.count,
          query: counted.query,
        },
        update: { count: counted.count, query: counted.query, collectedAt: new Date() },
      });

      result.written += 1;
      result.bySource[job.source].written += 1;
    } catch (error) {
      // A failed fetch is recorded as a gap, never as a zero. Phase B's baseline has
      // to be able to tell "nobody mentioned it" from "we could not look".
      const reason =
        error instanceof SourceUnavailable
          ? `${error.source}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "unknown error";

      await prisma.signalGap.create({
        data: { entityId: job.entityId, source: job.source, date, reason },
      });

      result.gaps += 1;
      result.bySource[job.source].gaps += 1;
      console.error(`[RADAR] ${job.slug} ${job.source} on ${result.date}: ${reason}`);
    }

    await sleep(RATE_LIMIT_MS[job.source]);
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

/**
 * Days in the recent past with no point and no gap for an active entity.
 *
 * A missing row is not a zero, and forward-only collection means a day nobody
 * collected is lost for good. This is what makes that visible while it can still be
 * explained, rather than at week twelve when the baseline is already built on it.
 */
export async function findMissingDays(
  lookbackDays = 14,
  now: Date = new Date()
): Promise<Array<{ date: string; missing: number }>> {
  const entities = await prisma.radarEntity.findMany({
    where: { active: true },
    select: { id: true, hnQuery: true, arxivQuery: true },
  });

  const expectedPerDay = entities.reduce(
    (total, entity) => total + (entity.hnQuery ? 1 : 0) + (entity.arxivQuery ? 1 : 0),
    0
  );

  if (expectedPerDay === 0) return [];

  /**
   * The window starts at the later of the lookback and the first day ever collected.
   *
   * Without that floor this reports every day before collection began as incomplete,
   * for ever, because forward-only means those days were never collected and never
   * will be. A warning that is always on is a warning nobody reads, and the point of
   * this function is to catch the day the schedule actually missed.
   */
  const earliest = await prisma.signalPoint.findFirst({
    orderBy: { date: "asc" },
    select: { date: true },
  });

  if (!earliest) return [];

  const lookbackFrom = utcDay(new Date(now.getTime() - lookbackDays * 86_400_000));
  const from = lookbackFrom > earliest.date ? lookbackFrom : utcDay(earliest.date);

  const points = await prisma.signalPoint.groupBy({
    by: ["date"],
    where: { date: { gte: from } },
    _count: { _all: true },
  });

  const counted = new Map(
    points.map((row) => [row.date.toISOString().slice(0, 10), row._count._all])
  );

  const days: Array<{ date: string; missing: number }> = [];
  const lastDay = targetDay(now);

  for (let cursor = new Date(from); cursor <= lastDay; ) {
    const key = cursor.toISOString().slice(0, 10);
    const have = counted.get(key) ?? 0;

    if (have < expectedPerDay) {
      days.push({ date: key, missing: expectedPerDay - have });
    }

    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return days;
}

/** Entities whose measured precision is below the bar, and so should not count. */
export async function entitiesBelowThreshold() {
  const entities = await prisma.radarEntity.findMany({
    where: { active: true },
    select: {
      slug: true,
      hnQuery: true,
      arxivQuery: true,
      hnPrecision: true,
      arxivPrecision: true,
    },
  });

  return entities.filter(
    (entity) =>
      (entity.hnQuery !== null &&
        entity.hnPrecision !== null &&
        entity.hnPrecision < PRECISION_THRESHOLD) ||
      (entity.arxivQuery !== null &&
        entity.arxivPrecision !== null &&
        entity.arxivPrecision < PRECISION_THRESHOLD)
  );
}

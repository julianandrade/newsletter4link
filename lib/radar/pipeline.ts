/**
 * RQ-005 tech spec 4.2.2, story 5: the machine says what it is doing.
 *
 * Story 5 exists so nobody has to start a collection run in order to find out
 * whether one is needed (AC-5.3).
 *
 * Read tenant-scoped, which is the point of AC-5.5. Deliberately does not call
 * `getCurrentJob` or `getJobs` from `lib/curation/job-manager.ts`: both read
 * `prisma.curationJob` with no organization filter, so a count shown to one
 * organization would include another's rows. Those functions are left alone
 * because the collect route and the curation jobs screen depend on their current
 * signatures.
 */

import type { TenantClient } from "@/lib/db/tenant";

/** Hours after which a completed run stops counting as current. */
export const STALE_AFTER_HOURS = 24;

export type FinishedRunStatus = "COMPLETED" | "FAILED" | "CANCELLED";

export type RunReason =
  | "never-run"
  | "last-run-failed"
  | "stale"
  | "current"
  | "running";

export interface RunDecision {
  needed: boolean;
  reason: RunReason;
}

/**
 * RQ-005 AC-5.3, AC-5.6: pure, so "is a run needed" is testable without a
 * database.
 *
 * Order matters. A run in progress answers first, because "needed" while one is
 * already going would put a second run in the queue. A failure answers before
 * staleness so the status can say the last run failed and when, rather than
 * reporting the last successful run as current and hiding the failure (AC-5.6).
 */
export function decideRunNeeded(input: {
  lastRun: { status: FinishedRunStatus; completedAt: Date | null } | null;
  running: boolean;
  now: Date;
}): RunDecision {
  const { lastRun, running, now } = input;

  if (running) return { needed: false, reason: "running" };
  if (!lastRun) return { needed: true, reason: "never-run" };
  if (lastRun.status === "FAILED") return { needed: true, reason: "last-run-failed" };

  // A cancelled run left the week no more collected than before it started, and a
  // completed run with no completion time cannot be aged, so both are treated as
  // "nothing usable has landed" rather than as current.
  if (lastRun.status === "CANCELLED" || !lastRun.completedAt) {
    return { needed: true, reason: "stale" };
  }

  const ageHours =
    (now.getTime() - lastRun.completedAt.getTime()) / (60 * 60 * 1000);

  if (ageHours > STALE_AFTER_HOURS) return { needed: true, reason: "stale" };

  return { needed: false, reason: "current" };
}

export interface PipelineLastRun {
  status: FinishedRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  totalFound: number;
  curated: number;
  duplicates: number;
  lowScore: number;
  errorsCount: number;
}

export interface PipelineStatus {
  running: boolean;
  /** Items processed so far by a run in flight, null when nothing is running. */
  current: number | null;
  total: number | null;
  lastRun: PipelineLastRun | null;
  runNeeded: boolean;
  runReason: RunReason;
}

const iso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

/**
 * The pipeline as this organization sees it.
 *
 * The two reads are independent: a run in flight is not the last finished run, and
 * showing the finished one while another is going is what lets the band report
 * both progress and the previous outcome at once.
 */
export async function readPipelineStatus(
  db: TenantClient,
  now: Date = new Date()
): Promise<PipelineStatus> {
  const [running, finished] = await Promise.all([
    db.curationJob.findFirst({
      where: { status: "RUNNING" },
      orderBy: { startedAt: "desc" },
    }),
    db.curationJob.findFirst({
      where: { status: { in: ["COMPLETED", "FAILED", "CANCELLED"] } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const lastRun: PipelineLastRun | null = finished
    ? {
        status: finished.status as FinishedRunStatus,
        startedAt: iso(finished.startedAt),
        completedAt: iso(finished.completedAt),
        totalFound: finished.totalFound,
        curated: finished.curated,
        duplicates: finished.duplicates,
        lowScore: finished.lowScore,
        errorsCount: finished.errorsCount,
      }
    : null;

  const decision = decideRunNeeded({
    lastRun: finished
      ? {
          status: finished.status as FinishedRunStatus,
          completedAt: finished.completedAt,
        }
      : null,
    running: running !== null,
    now,
  });

  return {
    running: running !== null,
    // `totalFound` is zero until the collector has finished counting feeds, and a
    // total of zero would render as a full progress bar. Null means "no number
    // yet", which the band shows as an indeterminate run.
    current: running ? running.processed : null,
    total: running && running.totalFound > 0 ? running.totalFound : null,
    lastRun,
    runNeeded: decision.needed,
    runReason: decision.reason,
  };
}

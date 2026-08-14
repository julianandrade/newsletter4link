"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  Num,
  PageHeading,
  radarButtonClass,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import {
  EmptyState,
  RadarPanel,
  SkeletonRows,
  StatTile,
} from "@/components/radar/controls";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

interface CurationJob {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalFound: number;
  processed: number;
  duplicates: number;
  lowScore: number;
  curated: number;
  errorsCount: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  logs: LogEntry[];
}

const STATUS_TONE: Record<
  CurationJob["status"],
  "ok" | "warn" | "err" | "info" | "neutral"
> = {
  RUNNING: "info",
  COMPLETED: "ok",
  FAILED: "err",
  CANCELLED: "neutral",
};

const STATUS_LABEL: Record<CurationJob["status"], string> = {
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const LOG_TONE: Record<LogEntry["level"], string> = {
  info: "bg-radar-primary2",
  warn: "bg-radar-warn",
  error: "bg-radar-err",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function CurationJobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [job, setJob] = useState<CurationJob | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [levelFilter, setLevelFilter] = useState<"all" | LogEntry["level"]>("all");

  useEffect(() => {
    if (!jobId) return;

    fetch(`/api/curation/jobs/${jobId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setJob(data);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [jobId]);

  const toggleLogExpand = (index: number) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <>
        <AppHeader />
        <RadarMain width="form">
          <PageHeading eyebrow="Curation run" title="Loading the run" />
          <SkeletonRows rows={6} />
        </RadarMain>
      </>
    );
  }

  if (!job) {
    return (
      <>
        <AppHeader />
        <RadarMain width="form">
          <PageHeading eyebrow="Curation run" title="That run is not here" />
          <EmptyState
            title="No run with that id"
            actions={
              <Link href="/dashboard/curation" className={radarButtonClass("accent")}>
                Back to the run history
              </Link>
            }
          >
            It may have been deleted by the 30-day cleanup, or the link may be stale.
          </EmptyState>
        </RadarMain>
      </>
    );
  }

  const logs = job.logs ?? [];
  const errorCount = logs.filter((log) => log.level === "error").length;
  const warnCount = logs.filter((log) => log.level === "warn").length;
  const shownLogs =
    levelFilter === "all" ? logs : logs.filter((log) => log.level === levelFilter);

  return (
    <>
      <AppHeader />

      <RadarMain width="form">
        <PageHeading
          eyebrow="Curation run"
          title={
            job.status === "COMPLETED"
              ? `Kept ${job.curated} of ${job.totalFound} stories`
              : job.status === "FAILED"
                ? "The run failed"
                : job.status === "RUNNING"
                  ? "Running now"
                  : "The run was cancelled"
          }
          subtitle={
            <>
              Started {formatDateTime(job.startedAt)} ({relativeTime(job.startedAt)})
              {job.durationMs ? ` · took ${formatDuration(job.durationMs)}` : ""}
            </>
          }
          actions={
            <>
              <StatusChip tone={STATUS_TONE[job.status]}>
                {STATUS_LABEL[job.status]}
              </StatusChip>
              <Link href="/dashboard/curation" className={radarButtonClass()}>
                All runs
              </Link>
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Found" value={job.totalFound} />
          <StatTile
            label="Kept"
            value={job.curated}
            color="var(--r-ok)"
            note="above your score threshold"
          />
          <StatTile label="Duplicates" value={job.duplicates} />
          <StatTile
            label="Below threshold"
            value={job.lowScore}
            note="scored and dropped"
          />
          <StatTile
            label="Errors"
            value={job.errorsCount}
            color={job.errorsCount > 0 ? "var(--r-err)" : undefined}
          />
        </div>

        {job.completedAt && (
          <p className="mt-3 mb-0 text-[11.5px] text-radar-ink3">
            Finished {formatDateTime(job.completedAt)}. Processed{" "}
            <Num>{job.processed}</Num> of <Num>{job.totalFound}</Num> items.
          </p>
        )}

        <div className="mt-8">
          <RadarPanel
            title="Run log"
            note={
              logs.length === 0
                ? "Nothing was recorded for this run."
                : `${logs.length} entries${errorCount > 0 ? `, ${errorCount} errors` : ""}${warnCount > 0 ? `, ${warnCount} warnings` : ""}`
            }
            actions={
              logs.length > 0 ? (
                <div className="flex gap-1.5">
                  {(["all", "info", "warn", "error"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={levelFilter === level}
                      onClick={() => setLevelFilter(level)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
                        levelFilter === level
                          ? "border-radar-accent text-radar-ink"
                          : "border-radar-line text-radar-ink3 hover:text-radar-ink"
                      )}
                    >
                      {level === "all" ? "Everything" : level}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
            padded={false}
          >
            {shownLogs.length === 0 ? (
              <p className="m-0 px-4 py-10 text-center text-[12.5px] text-radar-ink3">
                {logs.length === 0
                  ? "This run finished without writing a log."
                  : `No ${levelFilter} entries in this run.`}
              </p>
            ) : (
              <ol className="m-0 max-h-[480px] list-none overflow-y-auto p-0">
                {shownLogs.map((log, index) => {
                  const hasData = log.data && Object.keys(log.data).length > 0;
                  const isExpanded = expandedLogs.has(index);

                  return (
                    <li
                      key={`${log.timestamp}-${index}`}
                      className="border-b border-radar-line2 last:border-0"
                    >
                      <div className="flex items-start gap-3 px-4 py-2.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                            LOG_TONE[log.level]
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "m-0 text-[12.5px] break-words",
                              log.level === "error"
                                ? "text-radar-err"
                                : log.level === "warn"
                                  ? "text-radar-warn"
                                  : "text-radar-ink"
                            )}
                          >
                            {log.message}
                          </p>
                          {hasData && isExpanded && (
                            <pre className="font-num mt-2 mb-0 overflow-x-auto rounded-lg border border-radar-line2 bg-radar-surface2 p-2.5 text-[11px] text-radar-ink2">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          )}
                        </div>
                        <time
                          dateTime={log.timestamp}
                          className="font-num shrink-0 text-[10.5px] text-radar-ink3"
                        >
                          {formatTime(log.timestamp)}
                        </time>
                        {hasData && (
                          <button
                            type="button"
                            onClick={() => toggleLogExpand(index)}
                            aria-expanded={isExpanded}
                            className="shrink-0 rounded px-1.5 text-[11px] text-radar-ink3 transition-colors hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                          >
                            {isExpanded ? "Hide" : "Detail"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </RadarPanel>
        </div>

        <div className="mt-4">
          <SectionLabel>Run id</SectionLabel>
          <p className="font-num mt-1 mb-0 text-[11.5px] text-radar-ink3">{job.id}</p>
        </div>
      </RadarMain>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import {
  Callout,
  EmptyState,
  Pagination,
  RadarCheckbox,
  RadarField,
  RadarInput,
  RadarProgress,
  RadarSelect,
  SkeletonRows,
} from "@/components/radar/controls";
import { RSSSourceManager } from "@/components/rss-source-manager";
import {
  SortSelect,
  SortAnnouncement,
  applySortParams,
  type SortOption,
  type SortState,
} from "@/components/radar/sortable";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

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
}

interface RssSourceOption {
  id: string;
  name: string;
  category: string;
}

/** Mirrors `JOB_SORT_FIELDS` in `lib/curation/job-manager.ts`. */
type SortField =
  | "startedAt"
  | "status"
  | "durationMs"
  | "totalFound"
  | "curated"
  | "errorsCount";
type View = "jobs" | "sources";

const JOB_SORT_OPTIONS: SortOption<SortField>[] = [
  { field: "startedAt", direction: "desc", label: "Newest run first" },
  { field: "startedAt", direction: "asc", label: "Oldest run first" },
  { field: "durationMs", direction: "desc", label: "Slowest first" },
  { field: "durationMs", direction: "asc", label: "Fastest first" },
  { field: "totalFound", direction: "desc", label: "Most found first" },
  { field: "curated", direction: "desc", label: "Most kept first" },
  { field: "errorsCount", direction: "desc", label: "Most errors first" },
  { field: "status", direction: "asc", label: "Grouped by status" },
];

const JOB_SORT_LABELS: Record<SortField, string> = {
  startedAt: "when it started",
  status: "status",
  durationMs: "how long it took",
  totalFound: "stories found",
  curated: "stories kept",
  errorsCount: "errors",
};

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatStamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CurationHistoryPage() {
  const [view, setView] = useState<View>("jobs");

  const [isLoading, setIsLoading] = useState(true);
  const [jobs, setJobs] = useState<CurationJob[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortState<SortField>>({
    field: "startedAt",
    direction: "desc",
  });
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Bulk delete state
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Re-run state
  const [rerunningJobId, setRerunningJobId] = useState<string | null>(null);

  // Curation state
  const [curationStatus, setCurationStatus] = useState<{
    running: boolean;
    message: string;
    progress?: { current: number; total: number };
    jobId?: string;
    failed?: boolean;
  }>({
    running: false,
    message: "",
  });
  const [isCancelling, setIsCancelling] = useState(false);
  const [rssSources, setRssSources] = useState<RssSourceOption[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  /**
   * The dates and the order are the server's job now.
   *
   * They used to be applied here, to the ten rows the route had already chosen, with two
   * visible consequences. "Slowest first" ordered page one and presented it as the slowest
   * runs in the history, so the actual slowest run sat on page four and never surfaced.
   * And a date range filtered those ten rows away, leaving three runs under a pager that
   * still read "Page 1 of 12" and a Next button that showed nothing.
   */
  const fetchJobs = () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: "10" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    applySortParams(params, sort);

    fetch(`/api/curation/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setJobs(data.jobs || []);
        setTotalPages(data.totalPages || 1);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, sort, dateFrom, dateTo]);

  // Fetch RSS sources on mount
  useEffect(() => {
    fetch("/api/rss-sources")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRssSources(data.filter((s: { active: boolean }) => s.active));
        }
      })
      .catch(console.error)
      .finally(() => setSourcesLoading(false));
  }, []);

  const handleRunCuration = async () => {
    setCurationStatus({ running: true, message: "Connecting to the collector" });

    try {
      const url =
        selectedSourceIds.length > 0
          ? `/api/curation/collect?sourceIds=${selectedSourceIds.join(",")}`
          : "/api/curation/collect";

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      const processEvent = (eventType: string, dataStr: string) => {
        try {
          const data = JSON.parse(dataStr);
          switch (eventType) {
            case "start":
              setCurationStatus({
                running: true,
                message: data.message,
                jobId: data.jobId,
              });
              break;
            case "progress":
              setCurationStatus((prev) => ({
                running: true,
                message: data.message || "Processing",
                progress:
                  data.current && data.total
                    ? { current: data.current, total: data.total }
                    : undefined,
                jobId: data.jobId || prev.jobId,
              }));
              break;
            case "complete":
              setCurationStatus({ running: false, message: data.message });
              setTimeout(() => {
                fetchJobs();
                setCurationStatus({ running: false, message: "" });
              }, 3000);
              break;
            case "cancelled":
              setCurationStatus({ running: false, message: "Run cancelled" });
              setTimeout(() => {
                fetchJobs();
                setCurationStatus({ running: false, message: "" });
              }, 3000);
              break;
            case "error":
              setCurationStatus({
                running: false,
                failed: true,
                message: data.error || "The run failed",
              });
              break;
          }
        } catch {
          // Ignore parse errors
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.substring(6);
            }
          }

          if (dataStr) {
            processEvent(eventType, dataStr);
          }
        }
      }
    } catch (error) {
      setCurationStatus({
        running: false,
        failed: true,
        message:
          error instanceof Error ? error.message : "The connection failed",
      });
    }
  };

  const handleCancelCuration = async () => {
    setIsCancelling(true);
    try {
      const response = await fetch("/api/curation/cancel", { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel");
      }
      setCurationStatus((prev) => ({ ...prev, message: "Cancelling" }));
    } catch (error) {
      console.error("Failed to cancel curation:", error);
      toast.error("Could not cancel the run");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch("/api/curation/jobs?olderThanDays=30", {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || `Deleted ${data.deletedCount} jobs`);
        setIsBulkDeleteDialogOpen(false);
        fetchJobs();
      } else {
        toast.error(data.error || "Could not delete the old jobs");
      }
    } catch {
      toast.error("Could not delete the old jobs");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRerun = async (jobId: string) => {
    setRerunningJobId(jobId);

    try {
      const response = await fetch(`/api/curation/jobs/${jobId}/rerun`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to re-run job");
      }

      // The re-run streams on the server; give it a beat, then show the new job.
      toast.success("Re-run started");
      setTimeout(() => {
        fetchJobs();
        setRerunningJobId(null);
      }, 2000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not re-run that job"
      );
      setRerunningJobId(null);
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setSort({ field: "startedAt", direction: "desc" });
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // The order is not a filter: it shows the same runs, so counting it here offered
  // "Clear all" for something that hides nothing and made the empty state blame it.
  const hasActiveFilters =
    statusFilter !== "all" || Boolean(dateFrom) || Boolean(dateTo);

  const runningJob = jobs.find((job) => job.status === "RUNNING");
  const lastCompleted = jobs.find((job) => job.status === "COMPLETED");

  const heading = curationStatus.running
    ? "Collecting now"
    : runningJob
      ? "A run is in progress"
      : lastCompleted
        ? `Last run kept ${lastCompleted.curated} of ${lastCompleted.totalFound}`
        : jobs.length > 0
          ? "Curation history"
          : "No runs yet";

  const progressPct = curationStatus.progress
    ? (curationStatus.progress.current / curationStatus.progress.total) * 100
    : 0;

  return (
    <>
      <AppHeader />

      <RadarMain width="1180px">
        <PageHeading
          eyebrow="Curation"
          title={heading}
          subtitle="Curation fetches every active feed, drops duplicates, scores what is left against your brand voice, and sends anything above the threshold to the review queue."
          actions={
            <>
              <ChipGroup<View>
                label="Curation views"
                idBase="curation-view"
                value={view}
                onChange={setView}
                options={[
                  { value: "jobs", label: "Runs" },
                  {
                    value: "sources",
                    label: `Feeds${rssSources.length > 0 ? ` · ${rssSources.length}` : ""}`,
                  },
                ]}
              />
              <RadarButton
                variant="accent"
                onClick={handleRunCuration}
                disabled={curationStatus.running}
              >
                {curationStatus.running ? "Running…" : "Run curation"}
              </RadarButton>
            </>
          }
        />

        {view === "jobs" && (
          <div
            role="tabpanel"
            id="curation-view-panel-jobs"
            aria-labelledby="curation-view-tab-jobs"
            className="flex flex-col gap-5"
          >
            {/* Live run */}
            {curationStatus.message && (
              <Callout
                tone={curationStatus.failed ? "err" : "info"}
                live
                title={curationStatus.message}
                actions={
                  curationStatus.running ? (
                    <RadarButton
                      size="sm"
                      onClick={handleCancelCuration}
                      disabled={isCancelling}
                      className="hover:border-radar-err hover:text-radar-err"
                    >
                      {isCancelling ? "Cancelling…" : "Cancel the run"}
                    </RadarButton>
                  ) : undefined
                }
              >
                {curationStatus.progress ? (
                  <>
                    <div className="flex items-center gap-3">
                      <RadarProgress value={progressPct} className="flex-1" />
                      <Num className="shrink-0 text-[12px] text-radar-ink2">
                        {curationStatus.progress.current} /{" "}
                        {curationStatus.progress.total}
                      </Num>
                    </div>
                  </>
                ) : null}
              </Callout>
            )}

            {/* Which feeds to collect */}
            <div className="rounded-xl border border-radar-line bg-radar-surface px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <SectionLabel>Feeds in the next run</SectionLabel>
                <span className="text-[12.5px] text-radar-ink2">
                  {sourcesLoading
                    ? "loading the feed list…"
                    : selectedSourceIds.length === 0
                      ? `all ${rssSources.length} active feeds`
                      : `${selectedSourceIds.length} of ${rssSources.length} selected`}
                </span>
                <span className="flex-1" />
                <RadarButton
                  size="sm"
                  onClick={() => setShowSourcePicker((previous) => !previous)}
                  aria-expanded={showSourcePicker}
                  disabled={sourcesLoading || rssSources.length === 0}
                >
                  {showSourcePicker ? "Done choosing" : "Choose feeds"}
                </RadarButton>
                {selectedSourceIds.length > 0 && (
                  <RadarButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedSourceIds([])}
                  >
                    Use all
                  </RadarButton>
                )}
              </div>

              {showSourcePicker && (
                <div className="radar-enter mt-3.5 grid gap-2 border-t border-radar-line2 pt-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {rssSources.map((source) => (
                    <RadarCheckbox
                      key={source.id}
                      checked={selectedSourceIds.includes(source.id)}
                      disabled={curationStatus.running}
                      onChange={(event) =>
                        setSelectedSourceIds((previous) =>
                          event.target.checked
                            ? [...previous, source.id]
                            : previous.filter((id) => id !== source.id)
                        )
                      }
                      label={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{source.name}</span>
                          <span className="shrink-0 text-[10.5px] text-radar-ink3">
                            {source.category}
                          </span>
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <RadarSelect
                  aria-label="Filter by status"
                  className="w-auto min-w-[150px]"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Every status</option>
                  <option value="RUNNING">Running</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </RadarSelect>

                <RadarButton
                  onClick={() => setShowFilters((previous) => !previous)}
                  aria-expanded={showFilters}
                >
                  Dates
                </RadarButton>

                {/* Out of the disclosure, beside the status chip group. The order is the
                    control people reach for first, and it was two selects behind a button. */}
                <SortSelect
                  label="Sort runs"
                  options={JOB_SORT_OPTIONS}
                  sort={sort}
                  onChange={(next) => {
                    setSort(next);
                    // A new order is a new first page: page 4 of the old one holds
                    // different runs, which is what made the pager feel broken.
                    setPage(1);
                  }}
                />

                {hasActiveFilters && (
                  <RadarButton variant="ghost" onClick={clearFilters}>
                    Clear all
                  </RadarButton>
                )}

                <span className="flex-1" />

                <RadarButton
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                  className="hover:border-radar-err hover:text-radar-err"
                >
                  Delete runs over 30 days old
                </RadarButton>
              </div>

              {showFilters && (
                <div className="radar-enter grid gap-4 rounded-xl border border-radar-line bg-radar-surface p-4 sm:grid-cols-2">
                  <RadarField label="Started from">
                    <RadarInput
                      type="date"
                      value={dateFrom}
                      onChange={(event) => {
                        setDateFrom(event.target.value);
                        setPage(1);
                      }}
                    />
                  </RadarField>
                  <RadarField
                    label="Started to"
                    hint="Includes the whole of the day you name."
                  >
                    <RadarInput
                      type="date"
                      value={dateTo}
                      onChange={(event) => {
                        setDateTo(event.target.value);
                        setPage(1);
                      }}
                    />
                  </RadarField>
                </div>
              )}
            </div>

            {/* Runs */}
            {isLoading && jobs.length === 0 ? (
              <SkeletonRows rows={5} />
            ) : jobs.length === 0 ? (
              <EmptyState
                title={
                  hasActiveFilters
                    ? "No runs match those filters"
                    : "Curation has never run here"
                }
                actions={
                  hasActiveFilters ? (
                    <RadarButton variant="accent" onClick={clearFilters}>
                      Clear filters
                    </RadarButton>
                  ) : (
                    <RadarButton variant="accent" onClick={handleRunCuration}>
                      Run it now
                    </RadarButton>
                  )
                }
              >
                {hasActiveFilters
                  ? "Widen the dates, or set the status back to every status."
                  : "A run takes a couple of minutes and fills the review queue with scored stories."}
              </EmptyState>
            ) : (
              <>
                <SortAnnouncement
                  sort={sort}
                  labels={JOB_SORT_LABELS}
                  count={jobs.length}
                  noun={jobs.length === 1 ? "run" : "runs"}
                />
                <div className="border-t border-radar-line">
                  {jobs.map((job) => {
                    const canRerun = ["FAILED", "COMPLETED", "CANCELLED"].includes(
                      job.status
                    );
                    const isRerunning = rerunningJobId === job.id;

                    return (
                      <div
                        key={job.id}
                        className="flex flex-col gap-3 border-b border-radar-line2 py-4 transition-colors hover:bg-radar-surface2 lg:flex-row lg:items-center lg:gap-6"
                      >
                        <div className="min-w-0 lg:w-[210px]">
                          <div className="flex items-center gap-2.5">
                            <StatusChip tone={STATUS_TONE[job.status]}>
                              {STATUS_LABEL[job.status]}
                            </StatusChip>
                            {job.status === "RUNNING" && (
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 animate-pulse rounded-full bg-radar-primary2"
                              />
                            )}
                          </div>
                          <p className="mt-1.5 mb-0 text-[12.5px] text-radar-ink">
                            {formatStamp(job.startedAt)}
                          </p>
                          <p className="mt-0.5 mb-0 text-[11px] text-radar-ink3">
                            {relativeTime(job.startedAt)}
                            {job.durationMs
                              ? ` · took ${formatDuration(job.durationMs)}`
                              : ""}
                          </p>
                        </div>

                        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                          {[
                            { label: "Found", value: job.totalFound, tone: "" },
                            {
                              label: "Kept",
                              value: job.curated,
                              tone: "text-radar-ok",
                            },
                            {
                              label: "Duplicates",
                              value: job.duplicates,
                              tone: "text-radar-ink2",
                            },
                            {
                              label: "Errors",
                              value: job.errorsCount,
                              tone:
                                job.errorsCount > 0
                                  ? "text-radar-err"
                                  : "text-radar-ink3",
                            },
                          ].map((stat) => (
                            <div key={stat.label}>
                              <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-radar-ink3">
                                {stat.label}
                              </dt>
                              <dd
                                className={cn(
                                  "font-num m-0 mt-0.5 text-[15px] tabular-nums text-radar-ink",
                                  stat.tone
                                )}
                              >
                                {stat.value}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {job.status === "RUNNING" && (
                            <RadarButton
                              size="sm"
                              onClick={handleCancelCuration}
                              disabled={isCancelling}
                              className="hover:border-radar-err hover:text-radar-err"
                            >
                              Cancel
                            </RadarButton>
                          )}
                          {canRerun && (
                            <RadarButton
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRerun(job.id)}
                              disabled={rerunningJobId !== null}
                            >
                              {isRerunning ? "Starting…" : "Re-run"}
                            </RadarButton>
                          )}
                          <Link
                            href={`/dashboard/curation/${job.id}`}
                            className={radarButtonClass("outline", "sm")}
                          >
                            Details
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPage={setPage}
                  busy={isLoading}
                />
              </>
            )}
          </div>
        )}

        {view === "sources" && (
          <div
            role="tabpanel"
            id="curation-view-panel-sources"
            aria-labelledby="curation-view-tab-sources"
          >
            <RSSSourceManager />
          </div>
        )}
      </RadarMain>

      {/* Bulk delete */}
      <Dialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete runs over 30 days old?</DialogTitle>
            <DialogDescription>
              Only the run records go. The stories they collected stay in the feed,
              the review queue and any edition that used them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton
              onClick={() => setIsBulkDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Keep them
            </RadarButton>
            <RadarButton
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="border-radar-err text-radar-err"
            >
              {isDeleting ? "Deleting…" : "Delete old runs"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

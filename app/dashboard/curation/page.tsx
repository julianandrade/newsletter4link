"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  Ban,
  Trash2,
  RefreshCw,
  Calendar,
  ArrowUpDown,
  Rss,
} from "lucide-react";
import { RSSSourceManager } from "@/components/rss-source-manager";

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

const statusConfig = {
  RUNNING: { label: "Running", variant: "default" as const, icon: Loader2 },
  COMPLETED: { label: "Completed", variant: "secondary" as const, icon: CheckCircle },
  FAILED: { label: "Failed", variant: "destructive" as const, icon: XCircle },
  CANCELLED: { label: "Cancelled", variant: "outline" as const, icon: Ban },
};

type SortField = "startedAt" | "durationMs" | "totalFound";
type SortOrder = "asc" | "desc";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default function CurationHistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [jobs, setJobs] = useState<CurationJob[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("startedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Bulk delete state
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null);

  // Re-run state
  const [rerunningJobId, setRerunningJobId] = useState<string | null>(null);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const fetchJobs = () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: "10" });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }

    fetch(`/api/curation/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        let fetchedJobs = data.jobs || [];

        // Client-side date filtering
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0);
          fetchedJobs = fetchedJobs.filter(
            (job: CurationJob) => new Date(job.startedAt) >= fromDate
          );
        }
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          fetchedJobs = fetchedJobs.filter(
            (job: CurationJob) => new Date(job.startedAt) <= toDate
          );
        }

        // Client-side sorting
        fetchedJobs.sort((a: CurationJob, b: CurationJob) => {
          let aVal: number, bVal: number;

          if (sortField === "startedAt") {
            aVal = new Date(a.startedAt).getTime();
            bVal = new Date(b.startedAt).getTime();
          } else if (sortField === "durationMs") {
            aVal = a.durationMs || 0;
            bVal = b.durationMs || 0;
          } else {
            aVal = a.totalFound;
            bVal = b.totalFound;
          }

          return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
        });

        setJobs(fetchedJobs);
        setTotalPages(data.totalPages || 1);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchJobs();
  }, [page, statusFilter, sortField, sortOrder, dateFrom, dateTo]);

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    setDeleteResult(null);

    try {
      const response = await fetch("/api/curation/jobs?olderThanDays=30", {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        setDeleteResult({
          success: true,
          message: data.message || `Deleted ${data.deletedCount} job(s)`,
        });
        // Refresh the list
        fetchJobs();
      } else {
        setDeleteResult({
          success: false,
          message: data.error || "Failed to delete jobs",
        });
      }
    } catch (error) {
      setDeleteResult({
        success: false,
        message: "An error occurred while deleting jobs",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRerun = async (jobId: string) => {
    setRerunningJobId(jobId);
    setRerunError(null);

    try {
      const response = await fetch(`/api/curation/jobs/${jobId}/rerun`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to re-run job");
      }

      // The response is a stream, we'll just wait a moment and refresh
      // In a full implementation, you'd want to redirect to the job details page
      // or show a streaming progress indicator
      setTimeout(() => {
        fetchJobs();
        setRerunningJobId(null);
      }, 2000);

    } catch (error) {
      setRerunError(error instanceof Error ? error.message : "Failed to re-run job");
      setRerunningJobId(null);
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setSortField("startedAt");
    setSortOrder("desc");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters = statusFilter !== "all" || dateFrom || dateTo || sortField !== "startedAt" || sortOrder !== "desc";

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Curation" />

      <div className="flex-1 p-6">
        <Tabs defaultValue="jobs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="rss-sources" className="flex items-center gap-2">
              <Rss className="h-4 w-4" />
              RSS Sources
            </TabsTrigger>
          </TabsList>

          {/* Jobs Tab */}
          <TabsContent value="jobs" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                  {/* Status Filter */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="RUNNING">Running</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date From */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">From Date</span>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                        className="pl-10 w-[160px]"
                      />
                    </div>
                  </div>

                  {/* Date To */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">To Date</span>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                        className="pl-10 w-[160px]"
                      />
                    </div>
                  </div>

                  {/* Sort Field */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Sort By</span>
                    <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                      <SelectTrigger className="w-[150px]">
                        <ArrowUpDown className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="startedAt">Start Time</SelectItem>
                        <SelectItem value="durationMs">Duration</SelectItem>
                        <SelectItem value="totalFound">Articles Found</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort Order */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-muted-foreground">Order</span>
                    <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">Newest First</SelectItem>
                        <SelectItem value="asc">Oldest First</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Clear Filters */}
                  {hasActiveFilters && (
                    <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                      Clear filters
                    </Button>
                  )}

                  {/* Bulk Delete */}
                  <div className="ml-auto">
                    <Button
                      variant="outline"
                      onClick={() => setIsBulkDeleteDialogOpen(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Old Jobs
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Re-run error message */}
            {rerunError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
                <XCircle className="h-4 w-4" />
                {rerunError}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRerunError(null)}
                  className="ml-auto"
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* Jobs List */}
            <Card>
              <CardHeader>
                <CardTitle>Curation Jobs</CardTitle>
                <CardDescription>History of all curation runs</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No curation jobs found.</p>
                    <p className="text-sm text-muted-foreground">
                      Run a curation from the dashboard to get started.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {jobs.map((job) => {
                      const config = statusConfig[job.status];
                      const StatusIcon = config.icon;
                      const canRerun = ["FAILED", "COMPLETED", "CANCELLED"].includes(job.status);
                      const isRerunning = rerunningJobId === job.id;

                      return (
                        <div
                          key={job.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <StatusIcon
                                className={`h-5 w-5 ${
                                  job.status === "RUNNING"
                                    ? "animate-spin text-blue-500"
                                    : job.status === "COMPLETED"
                                    ? "text-green-500"
                                    : job.status === "FAILED"
                                    ? "text-red-500"
                                    : "text-muted-foreground"
                                }`}
                              />
                              <Badge variant={config.variant}>{config.label}</Badge>
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {formatDate(job.startedAt)}
                              </p>
                              {job.durationMs && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDuration(job.durationMs)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="grid grid-cols-4 gap-4 text-center">
                              <div>
                                <p className="text-lg font-semibold">{job.totalFound}</p>
                                <p className="text-xs text-muted-foreground">Found</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-green-600">{job.curated}</p>
                                <p className="text-xs text-muted-foreground">Curated</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-yellow-600">{job.duplicates}</p>
                                <p className="text-xs text-muted-foreground">Duplicates</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold text-red-600">{job.errorsCount}</p>
                                <p className="text-xs text-muted-foreground">Errors</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              {canRerun && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRerun(job.id)}
                                  disabled={isRerunning || rerunningJobId !== null}
                                  title="Re-run this job"
                                >
                                  {isRerunning ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" asChild>
                                <Link href={`/dashboard/curation/${job.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RSS Sources Tab */}
          <TabsContent value="rss-sources">
            <RSSSourceManager />
          </TabsContent>
        </Tabs>
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Old Jobs</DialogTitle>
            <DialogDescription>
              This will permanently delete all curation jobs older than 30 days. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteResult && (
            <div
              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
                deleteResult.success
                  ? "text-green-600 bg-green-50"
                  : "text-destructive bg-destructive/10"
              }`}
            >
              {deleteResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {deleteResult.message}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkDeleteDialogOpen(false);
                setDeleteResult(null);
              }}
              disabled={isDeleting}
            >
              {deleteResult?.success ? "Close" : "Cancel"}
            </Button>
            {!deleteResult?.success && (
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isDeleting}
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete Jobs
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

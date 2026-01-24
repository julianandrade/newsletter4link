"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, Eye, Clock, FileText, AlertCircle, CheckCircle, XCircle, Ban } from "lucide-react";

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

export default function CurationHistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [jobs, setJobs] = useState<CurationJob[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchJobs = () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: "10" });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }

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
  }, [page, statusFilter]);

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Curation History" />

      <div className="flex-1 p-6 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
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
        </div>

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

                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/dashboard/curation/${job.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
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
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  ArrowLeft,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  Ban,
  Info,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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

const statusConfig = {
  RUNNING: { label: "Running", variant: "default" as const, icon: Loader2, color: "text-blue-500" },
  COMPLETED: { label: "Completed", variant: "secondary" as const, icon: CheckCircle, color: "text-green-500" },
  FAILED: { label: "Failed", variant: "destructive" as const, icon: XCircle, color: "text-red-500" },
  CANCELLED: { label: "Cancelled", variant: "outline" as const, icon: Ban, color: "text-muted-foreground" },
};

const logLevelConfig = {
  info: { icon: Info, color: "text-blue-500" },
  warn: { icon: AlertTriangle, color: "text-yellow-500" },
  error: { icon: AlertCircle, color: "text-red-500" },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
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
      <div className="flex flex-col flex-1">
        <AppHeader title="Curation Job" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Curation Job" />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Job not found.</p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/dashboard/curation">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to History
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const config = statusConfig[job.status];
  const StatusIcon = config.icon;

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Curation Job Details" />

      <div className="flex-1 p-6 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" asChild>
          <Link href="/dashboard/curation">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to History
          </Link>
        </Button>

        {/* Job Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon
                  className={`h-6 w-6 ${config.color} ${
                    job.status === "RUNNING" ? "animate-spin" : ""
                  }`}
                />
                <div>
                  <CardTitle>Curation Job</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {job.id}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={config.variant} className="text-sm">
                {config.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Timing */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Timing</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started:</span>
                    <span>{formatDateTime(job.startedAt)}</span>
                  </div>
                  {job.completedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed:</span>
                      <span>{formatDateTime(job.completedAt)}</span>
                    </div>
                  )}
                  {job.durationMs && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(job.durationMs)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg">
                    <p className="text-2xl font-bold">{job.totalFound}</p>
                    <p className="text-xs text-muted-foreground">Articles Found</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{job.curated}</p>
                    <p className="text-xs text-muted-foreground">Curated</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">{job.duplicates}</p>
                    <p className="text-xs text-muted-foreground">Duplicates</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{job.lowScore}</p>
                    <p className="text-xs text-muted-foreground">Low Score</p>
                  </div>
                </div>
                {job.errorsCount > 0 && (
                  <div className="p-3 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">{job.errorsCount}</p>
                    <p className="text-xs text-red-600">Errors</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
            <CardDescription>
              {job.logs?.length || 0} log entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!job.logs || job.logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No logs available.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {job.logs.map((log, index) => {
                    const levelConfig = logLevelConfig[log.level];
                    const LogIcon = levelConfig.icon;
                    const isExpanded = expandedLogs.has(index);
                    const hasData = log.data && Object.keys(log.data).length > 0;

                    return (
                      <div
                        key={index}
                        className={`p-3 border rounded-lg ${
                          log.level === "error"
                            ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                            : log.level === "warn"
                            ? "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950"
                            : ""
                        }`}
                      >
                        <div
                          className={`flex items-start gap-2 ${
                            hasData ? "cursor-pointer" : ""
                          }`}
                          onClick={() => hasData && toggleLogExpand(index)}
                        >
                          {hasData && (
                            <span className="mt-0.5">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </span>
                          )}
                          <LogIcon className={`h-4 w-4 mt-0.5 ${levelConfig.color}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm break-words">{log.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(log.timestamp)}
                            </p>
                          </div>
                        </div>
                        {hasData && isExpanded && (
                          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

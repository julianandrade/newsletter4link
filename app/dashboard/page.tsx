"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  FileSearch,
  Send,
  FileText,
  CheckCircle,
  Mail,
  Calendar,
  Activity,
  Loader2,
  StopCircle,
} from "lucide-react";

interface Stats {
  pendingArticles: number;
  approvedArticles: number;
  totalProjects: number;
  lastSent: string;
  isReadyToSend: boolean;
}

export default function DashboardHome() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    pendingArticles: 0,
    approvedArticles: 0,
    totalProjects: 0,
    lastSent: "Never",
    isReadyToSend: false,
  });

  const [curationStatus, setCurationStatus] = useState<{
    running: boolean;
    message: string;
    progress?: { current: number; total: number };
    jobId?: string;
  }>({
    running: false,
    message: "",
  });
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchStats = () => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "healthy" && data.stats) {
          const { articles, projects, latestEdition } = data.stats;

          let lastSentDate = "Never";
          if (latestEdition?.sentAt) {
            lastSentDate = new Date(latestEdition.sentAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          }

          setStats({
            pendingArticles: articles?.pending || 0,
            approvedArticles: articles?.approved || 0,
            totalProjects: projects?.total || 0,
            lastSent: lastSentDate,
            isReadyToSend: (articles?.approved || 0) > 0,
          });
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRunCuration = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setCurationStatus({ running: true, message: "Connecting..." });

    try {
      const response = await fetch("/api/curation/collect", {
        method: "GET",
        headers: {
          "Accept": "text/event-stream",
        },
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
              setCurationStatus({ running: true, message: data.message, jobId: data.jobId });
              break;
            case "progress":
              setCurationStatus((prev) => ({
                running: true,
                message: data.message || "Processing...",
                progress: data.current && data.total ? { current: data.current, total: data.total } : undefined,
                jobId: data.jobId || prev.jobId,
              }));
              break;
            case "complete":
              setCurationStatus({ running: false, message: "✓ " + data.message });
              setTimeout(() => {
                fetchStats();
                setCurationStatus({ running: false, message: "" });
              }, 3000);
              break;
            case "cancelled":
              setCurationStatus({ running: false, message: "Curation cancelled" });
              setTimeout(() => {
                fetchStats();
                setCurationStatus({ running: false, message: "" });
              }, 3000);
              break;
            case "error":
              setCurationStatus({ running: false, message: "✗ Error: " + (data.error || "Unknown error") });
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

        // SSE format: "event: <type>\ndata: <json>\n\n"
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
        message: "✗ Error: " + (error instanceof Error ? error.message : "Connection failed")
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
      setCurationStatus((prev) => ({
        ...prev,
        message: "Cancelling...",
      }));
    } catch (error) {
      console.error("Failed to cancel curation:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Dashboard" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Dashboard" />

      <div className="flex-1 p-6 space-y-8">
        {/* Curation Status */}
        {curationStatus.message && (
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                {curationStatus.running && <Loader2 className="h-4 w-4 animate-spin" />}
                <p className="text-sm flex-1">{curationStatus.message}</p>
                {curationStatus.progress && (
                  <span className="text-xs text-muted-foreground">
                    {curationStatus.progress.current}/{curationStatus.progress.total}
                  </span>
                )}
                {curationStatus.running && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelCuration}
                    disabled={isCancelling}
                    className="ml-4"
                  >
                    {isCancelling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <StopCircle className="h-4 w-4 mr-1" />
                        Cancel
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Run Curation */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Play className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Run Curation</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Fetch and score new articles
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleRunCuration}
                    disabled={curationStatus.running}
                    className="w-full"
                  >
                    {curationStatus.running ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      "Start Curation"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Review Articles */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-3 rounded-full bg-orange-500/10 relative">
                    <FileSearch className="h-6 w-6 text-orange-500" />
                    {stats.pendingArticles > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
                      >
                        {stats.pendingArticles > 99 ? "99+" : stats.pendingArticles}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium">Review Articles</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {stats.pendingArticles === 0
                        ? "No articles pending"
                        : `${stats.pendingArticles} pending review`}
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/review">Review Articles</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Send Newsletter */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <Send className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-medium">Send Newsletter</h3>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          stats.isReadyToSend ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                      {stats.isReadyToSend ? "Ready to send" : "No approved articles"}
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/send">Send Newsletter</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Metrics */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Metrics</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pendingArticles}</div>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.approvedArticles}</div>
                <p className="text-xs text-muted-foreground">Ready for newsletter</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalProjects}</div>
                <p className="text-xs text-muted-foreground">Total projects</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Sent</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.lastSent}</div>
                <p className="text-xs text-muted-foreground">Most recent edition</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Activity feed coming soon.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

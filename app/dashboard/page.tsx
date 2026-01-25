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
  ChevronDown,
  Newspaper,
  UserPlus,
  XCircle,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Stats {
  pendingArticles: number;
  approvedArticles: number;
  totalProjects: number;
  lastSent: string;
  isReadyToSend: boolean;
}

interface ActivityItem {
  id: string;
  type: "curation" | "article" | "edition" | "subscriber";
  action: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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

  // RSS source selection state
  const [rssSources, setRssSources] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);

  // Activity feed state
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

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

  // Fetch RSS sources on mount
  useEffect(() => {
    fetch("/api/rss-sources")
      .then((r) => r.json())
      .then((data) => {
        // API returns array directly, filter only active sources
        if (Array.isArray(data)) {
          setRssSources(data.filter((s: { active: boolean }) => s.active));
        }
      })
      .catch(console.error)
      .finally(() => setSourcesLoading(false));
  }, []);

  // Fetch activity feed on mount
  const fetchActivities = () => {
    setActivitiesLoading(true);
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data) => {
        if (data.activities) {
          setActivities(data.activities);
        }
      })
      .catch(console.error)
      .finally(() => setActivitiesLoading(false));
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const handleRunCuration = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setCurationStatus({ running: true, message: "Connecting..." });

    try {
      // Build URL with source filter
      const url = selectedSourceIds.length > 0
        ? `/api/curation/collect?sourceIds=${selectedSourceIds.join(",")}`
        : "/api/curation/collect";

      const response = await fetch(url, {
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

                  {/* RSS Source Selector */}
                  <div className="w-full">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between"
                          disabled={sourcesLoading || curationStatus.running}
                        >
                          {sourcesLoading
                            ? "Loading feeds..."
                            : selectedSourceIds.length === 0
                              ? "All Feeds"
                              : `${selectedSourceIds.length} feed(s) selected`}
                          <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56">
                        <DropdownMenuLabel>Select RSS Feeds</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                          checked={selectedSourceIds.length === 0}
                          onCheckedChange={() => setSelectedSourceIds([])}
                        >
                          All Feeds
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        {rssSources.map((source) => (
                          <DropdownMenuCheckboxItem
                            key={source.id}
                            checked={selectedSourceIds.includes(source.id)}
                            onCheckedChange={(checked) => {
                              setSelectedSourceIds((prev) =>
                                checked
                                  ? [...prev, source.id]
                                  : prev.filter((id) => id !== source.id)
                              );
                            }}
                          >
                            <span className="flex items-center gap-2">
                              {source.name}
                              <Badge variant="secondary" className="text-xs">
                                {source.category}
                              </Badge>
                            </span>
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchActivities}
              disabled={activitiesLoading}
            >
              <RefreshCw className={`h-4 w-4 ${activitiesLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {activitiesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="h-10 w-10 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No recent activity.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {activity.type === "curation" && activity.action === "completed" && (
                          <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                        )}
                        {activity.type === "curation" && activity.action === "started" && (
                          <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900">
                            <Play className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                        {activity.type === "curation" && activity.action === "failed" && (
                          <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                        )}
                        {activity.type === "article" && activity.action === "approved" && (
                          <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900">
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                        )}
                        {activity.type === "article" && activity.action === "rejected" && (
                          <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                        )}
                        {activity.type === "edition" && (
                          <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-900">
                            <Newspaper className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          </div>
                        )}
                        {activity.type === "subscriber" && (
                          <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900">
                            <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatActivityTime(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

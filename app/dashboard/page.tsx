"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Users, Briefcase, Mail, TrendingUp, AlertCircle, Loader2 } from "lucide-react";

export default function DashboardHome() {
  const [stats, setStats] = useState({
    pendingArticles: 0,
    subscribers: 0,
    projects: 0,
    lastCuration: "Never",
  });

  const [curationStatus, setCurationStatus] = useState<{
    running: boolean;
    message: string;
    progress?: { current: number; total: number };
  }>({
    running: false,
    message: "",
  });

  useEffect(() => {
    // Fetch stats from API
    fetchStats();
  }, []);

  const fetchStats = () => {
    Promise.all([
      fetch("/api/articles/pending").then((r) => r.json()),
      fetch("/api/subscribers").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
    ])
      .then(([articles, subscribers, projects]) => {
        setStats({
          pendingArticles: articles.data?.length || 0,
          subscribers: subscribers.data?.length || 0,
          projects: projects.data?.length || 0,
          lastCuration: "2 hours ago",
        });
      })
      .catch(console.error);
  };

  const handleRunCuration = () => {
    setCurationStatus({ running: true, message: "Connecting..." });

    const eventSource = new EventSource("/api/curation/collect");

    eventSource.addEventListener("start", (e) => {
      const data = JSON.parse(e.data);
      setCurationStatus({ running: true, message: data.message });
    });

    eventSource.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setCurationStatus({
        running: true,
        message: data.message || "Processing...",
        progress: data.current && data.total ? { current: data.current, total: data.total } : undefined,
      });
    });

    eventSource.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data);
      setCurationStatus({ running: false, message: "✓ " + data.message });
      eventSource.close();
      // Refresh stats
      setTimeout(() => {
        fetchStats();
        setCurationStatus({ running: false, message: "" });
      }, 3000);
    });

    eventSource.addEventListener("error", (e: any) => {
      const data = e.data ? JSON.parse(e.data) : {};
      setCurationStatus({ running: false, message: "✗ Error: " + (data.error || "Connection failed") });
      eventSource.close();
    });

    eventSource.onerror = () => {
      setCurationStatus({ running: false, message: "✗ Connection failed" });
      eventSource.close();
    };
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={handleRunCuration} disabled={curationStatus.running}>
            {curationStatus.running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <TrendingUp className="mr-2 h-4 w-4" />
                Run Curation
              </>
            )}
          </Button>
        </div>
      </div>

      {curationStatus.message && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              {curationStatus.running && <Loader2 className="h-4 w-4 animate-spin" />}
              <p className="text-sm">{curationStatus.message}</p>
              {curationStatus.progress && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {curationStatus.progress.current}/{curationStatus.progress.total}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Articles</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingArticles}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.subscribers}</div>
            <p className="text-xs text-muted-foreground">
              Active subscribers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projects}</div>
            <p className="text-xs text-muted-foreground">
              Internal showcases
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Curation</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lastCuration}</div>
            <p className="text-xs text-muted-foreground">
              From 7 RSS sources
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Newsletter Workflow</CardTitle>
            <CardDescription>
              Automated AI-powered content curation and delivery
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-semibold">1</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium">Content Collection</p>
                  <p className="text-xs text-muted-foreground">
                    Fetch articles from RSS feeds every 6 hours
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-semibold">2</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium">AI Curation</p>
                  <p className="text-xs text-muted-foreground">
                    Score relevance, deduplicate, and summarize
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-semibold">3</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium">Human Review</p>
                  <p className="text-xs text-muted-foreground">
                    Approve/reject curated articles
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-semibold">4</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium">Weekly Delivery</p>
                  <p className="text-xs text-muted-foreground">
                    Auto-send every Sunday at 12:00 UTC
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and workflows
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/dashboard/review">
                <FileText className="mr-2 h-4 w-4" />
                Review Articles
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/dashboard/subscribers">
                <Users className="mr-2 h-4 w-4" />
                Manage Subscribers
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/dashboard/projects">
                <Briefcase className="mr-2 h-4 w-4" />
                Edit Projects
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <a href="/dashboard/send">
                <Mail className="mr-2 h-4 w-4" />
                Send Newsletter
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

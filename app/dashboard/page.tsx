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
} from "lucide-react";

export default function DashboardHome() {
  const [isRunningCuration, setIsRunningCuration] = useState(false);
  const [stats, setStats] = useState({
    pendingArticles: 0,
    approvedThisWeek: 0,
    editionsSent: 0,
    lastSent: "Never",
    isReadyToSend: false,
  });

  useEffect(() => {
    // Fetch stats from API
    Promise.all([
      fetch("/api/articles/pending").then((r) => r.json()),
      fetch("/api/articles/approved").then((r) => r.json()),
      fetch("/api/email/editions").then((r) => r.json()),
    ])
      .then(([pending, approved, editions]) => {
        const pendingCount = pending.data?.length || 0;
        const approvedCount = approved.data?.length || 0;
        const editionsData = editions.data || [];
        const editionsSentCount = editionsData.length;

        // Get the last sent date
        let lastSentDate = "Never";
        if (editionsData.length > 0) {
          const mostRecent = editionsData[0];
          if (mostRecent.sentAt) {
            lastSentDate = new Date(mostRecent.sentAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          }
        }

        setStats({
          pendingArticles: pendingCount,
          approvedThisWeek: approvedCount,
          editionsSent: editionsSentCount,
          lastSent: lastSentDate,
          isReadyToSend: approvedCount > 0,
        });
      })
      .catch(console.error);
  }, []);

  const handleRunCuration = async () => {
    setIsRunningCuration(true);
    try {
      window.location.href = "/api/curation/collect";
    } catch (error) {
      console.error("Failed to run curation:", error);
      setIsRunningCuration(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Dashboard" />

      <main className="flex-1 p-6 space-y-8">
        {/* Section 1: Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Run Curation Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Play className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Run Curation</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Fetch and score new articles from RSS feeds
                    </p>
                  </div>
                  <Button
                    onClick={handleRunCuration}
                    disabled={isRunningCuration}
                    className="w-full"
                  >
                    {isRunningCuration ? "Running..." : "Start Curation"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Review Articles Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-3 rounded-full bg-orange-500/10 relative">
                    <FileSearch className="h-6 w-6 text-orange-500" />
                    {stats.pendingArticles > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                      >
                        {stats.pendingArticles > 99 ? "99+" : stats.pendingArticles}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium">Review Articles</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {stats.pendingArticles === 0
                        ? "No articles pending review"
                        : `${stats.pendingArticles} article${stats.pendingArticles === 1 ? "" : "s"} awaiting review`
                      }
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/dashboard/review">Review Articles</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Send Newsletter Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <Send className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-medium">Send Newsletter</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {stats.isReadyToSend ? (
                        <span className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Ready to send
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-gray-400" />
                          No approved articles
                        </span>
                      )}
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

        {/* Section 2: Metrics */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Metrics</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Articles</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pendingArticles}</div>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved This Week</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.approvedThisWeek}</div>
                <p className="text-xs text-muted-foreground">Ready for newsletter</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Editions Sent</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.editionsSent}</div>
                <p className="text-xs text-muted-foreground">Total newsletters sent</p>
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

        {/* Section 3: Activity Feed */}
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
      </main>
    </div>
  );
}

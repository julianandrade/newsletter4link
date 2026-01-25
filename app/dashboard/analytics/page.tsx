"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  MailOpen,
  MousePointerClick,
  AlertTriangle,
  Loader2,
  TrendingUp,
  ExternalLink,
  CheckCircle2,
  UserMinus,
} from "lucide-react";

interface Edition {
  id: string;
  week: number;
  year: number;
  sentAt: string | null;
}

interface AnalyticsData {
  editions: Edition[];
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    deliveryRate: number;
    unsubscribeRate: number;
  };
  topLinks: Array<{
    url: string;
    clicks: number;
  }>;
  timeline: Array<{
    date: string;
    opens: number;
    clicks: number;
  }>;
}

export default function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [selectedEdition, setSelectedEdition] = useState<string>("all");

  useEffect(() => {
    fetchAnalytics();
  }, [selectedEdition]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedEdition !== "all") {
        params.set("editionId", selectedEdition);
      }

      const response = await fetch(`/api/analytics?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Analytics" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Analytics" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
    openRate: 0,
    clickRate: 0,
    bounceRate: 0,
    deliveryRate: 0,
    unsubscribeRate: 0,
  };

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Analytics" />

      <div className="flex-1 p-6 space-y-6">
        {/* Edition Selector */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Email Performance</h2>
          <Select value={selectedEdition} onValueChange={setSelectedEdition}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select edition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Editions</SelectItem>
              {data?.editions.map((edition) => (
                <SelectItem key={edition.id} value={edition.id}>
                  Week {edition.week}, {edition.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.sent}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.delivered} delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
              <MailOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.openRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.opened} opened
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.clickRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.clicked} clicks
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.bounceRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.bounced} bounced
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.deliveryRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.delivered}/{metrics.sent} delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unsubscribe Rate</CardTitle>
              <UserMinus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.unsubscribeRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics.unsubscribed} unsubscribed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Links */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Top Clicked Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topLinks && data.topLinks.length > 0 ? (
              <div className="space-y-3">
                {data.topLinks.map((link, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm text-muted-foreground w-6">
                        {index + 1}.
                      </span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate flex items-center gap-1"
                      >
                        {truncateUrl(link.url)}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </div>
                    <span className="text-sm font-medium ml-4">
                      {link.clicks} clicks
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No click data available yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Engagement Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.timeline && data.timeline.length > 0 ? (
              <div className="space-y-2">
                {data.timeline.map((day, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <span className="text-sm">
                      {new Date(day.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="flex gap-6">
                      <span className="text-sm text-muted-foreground">
                        <MailOpen className="h-3 w-3 inline mr-1" />
                        {day.opens} opens
                      </span>
                      <span className="text-sm text-muted-foreground">
                        <MousePointerClick className="h-3 w-3 inline mr-1" />
                        {day.clicks} clicks
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No engagement data available yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path =
      parsed.pathname.length > 30
        ? parsed.pathname.substring(0, 30) + "..."
        : parsed.pathname;
    return parsed.hostname + path;
  } catch {
    return url.substring(0, 50) + (url.length > 50 ? "..." : "");
  }
}

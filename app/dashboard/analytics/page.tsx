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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Calendar,
  FileText,
  Link as LinkIcon,
  Globe,
  Sparkles,
  Users,
  UserCheck,
  Clock,
  UserPlus,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type DateRange = "7d" | "14d" | "30d" | "90d" | "custom";

interface Edition {
  id: string;
  week: number;
  year: number;
  sentAt: string | null;
}

interface LanguageSegment {
  language: string;
  label: string;
  count: number;
  openRate: number;
}

interface StyleSegment {
  style: string;
  label: string;
  count: number;
  openRate: number;
}

interface HealthCategory {
  count: number;
  percentage: number;
}

interface EngagementHealth {
  active: HealthCategory;
  dormant: HealthCategory;
  atRisk: HealthCategory;
  new: HealthCategory;
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
    title: string;
    category: string[];
    isArticle: boolean;
  }>;
  timeline: Array<{
    date: string;
    opens: number;
    clicks: number;
  }>;
  segmentation?: {
    byLanguage: LanguageSegment[];
    byStyle: StyleSegment[];
  };
  engagementHealth?: EngagementHealth;
}

export default function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [selectedEdition, setSelectedEdition] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("14d");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  useEffect(() => {
    // Only fetch when not in custom mode, or when both custom dates are filled
    if (dateRange !== "custom" || (customStartDate && customEndDate)) {
      fetchAnalytics();
    }
  }, [selectedEdition, dateRange, customStartDate, customEndDate]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedEdition !== "all") {
        params.set("editionId", selectedEdition);
      }
      params.set("dateRange", dateRange);
      if (dateRange === "custom") {
        if (customStartDate) {
          params.set("startDate", customStartDate);
        }
        if (customEndDate) {
          params.set("endDate", customEndDate);
        }
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
        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold">Email Performance</h2>
          <div className="flex flex-wrap items-end gap-3">
            {/* Date Range Selector */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Timeline Range
              </Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="14d">Last 14 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Inputs */}
            {dateRange === "custom" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="startDate" className="text-xs text-muted-foreground">
                    Start Date
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endDate" className="text-xs text-muted-foreground">
                    End Date
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
              </>
            )}

            {/* Edition Selector */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Edition</Label>
              <Select value={selectedEdition} onValueChange={setSelectedEdition}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select edition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Editions</SelectItem>
                  {data?.editions && data.editions.length > 0 ? (
                    data.editions.map((edition) => (
                      <SelectItem key={edition.id} value={edition.id}>
                        Week {edition.week}, {edition.year}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No newsletters sent yet
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
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

        {/* Engagement Health */}
        {data?.engagementHealth && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Engagement Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Active */}
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">Active</span>
                  </div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {data.engagementHealth.active.count}
                  </div>
                  <p className="text-xs text-green-600/80 dark:text-green-400/80">
                    {data.engagementHealth.active.percentage.toFixed(1)}% of subscribers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Activity in last 30 days
                  </p>
                </div>

                {/* Dormant */}
                <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Dormant</span>
                  </div>
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                    {data.engagementHealth.dormant.count}
                  </div>
                  <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80">
                    {data.engagementHealth.dormant.percentage.toFixed(1)}% of subscribers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last activity 30-90 days ago
                  </p>
                </div>

                {/* At Risk */}
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">At Risk</span>
                  </div>
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                    {data.engagementHealth.atRisk.count}
                  </div>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    {data.engagementHealth.atRisk.percentage.toFixed(1)}% of subscribers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No activity in 90+ days
                  </p>
                </div>

                {/* New */}
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">New</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {data.engagementHealth.new.count}
                  </div>
                  <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
                    {data.engagementHealth.new.percentage.toFixed(1)}% of subscribers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Received &lt;3 newsletters
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subscriber Segmentation */}
        {data?.segmentation && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Subscriber Segmentation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="language">
                <TabsList className="mb-4">
                  <TabsTrigger value="language" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    By Language
                  </TabsTrigger>
                  <TabsTrigger value="style" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    By Style
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="language">
                  {data.segmentation.byLanguage.length > 0 ? (
                    <div className="space-y-3">
                      {data.segmentation.byLanguage.map((segment) => (
                        <SegmentBar
                          key={segment.language}
                          label={segment.label}
                          count={segment.count}
                          openRate={segment.openRate}
                          total={data.segmentation!.byLanguage.reduce(
                            (sum, s) => sum + s.count,
                            0
                          )}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No subscriber language data available
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="style">
                  {data.segmentation.byStyle.length > 0 ? (
                    <div className="space-y-3">
                      {data.segmentation.byStyle.map((segment) => (
                        <SegmentBar
                          key={segment.style}
                          label={segment.label}
                          count={segment.count}
                          openRate={segment.openRate}
                          total={data.segmentation!.byStyle.reduce(
                            (sum, s) => sum + s.count,
                            0
                          )}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No subscriber style data available
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

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
              <div className="space-y-4">
                {data.topLinks.map((link, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-4 pb-3 border-b last:border-0 last:pb-0"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="text-sm text-muted-foreground w-6 pt-0.5 flex-shrink-0">
                        {index + 1}.
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {link.isArticle ? (
                            <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          ) : (
                            <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:text-blue-600 hover:underline truncate flex items-center gap-1.5"
                            title={link.url}
                          >
                            {link.title}
                            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {truncateUrl(link.url)}
                          </span>
                          {link.category && link.category.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {link.category.slice(0, 3).map((cat) => (
                                <Badge
                                  key={cat}
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {cat}
                                </Badge>
                              ))}
                              {link.category.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{link.category.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                      {link.clicks} {link.clicks === 1 ? "click" : "clicks"}
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

interface SegmentBarProps {
  label: string;
  count: number;
  openRate: number;
  total: number;
}

function SegmentBar({ label, count, openRate, total }: SegmentBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{count} subscribers</span>
          <span className="font-medium text-foreground">
            {openRate.toFixed(1)}% open rate
          </span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

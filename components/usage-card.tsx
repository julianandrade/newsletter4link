"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  FileText,
  Mail,
  Rss,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface UsageData {
  plan: {
    name: string;
    value: string;
    monthlyPrice: number | null;
  };
  usage: {
    subscribers: {
      current: number;
      limit: number | null;
      percentage: number;
      isNearLimit: boolean;
      isAtLimit: boolean;
    };
    articles: {
      total: number;
      thisMonth: number;
    };
    editions: {
      total: number;
      sentThisMonth: number;
    };
    rssSources: number;
    searchTopics: number;
  };
  features: Record<string, boolean>;
}

export function UsageCard() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsage();
  }, []);

  async function fetchUsage() {
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error("Failed to fetch usage");
      const data = await res.json();
      setUsage(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !usage) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {error || "Failed to load usage data"}
        </CardContent>
      </Card>
    );
  }

  const { subscribers } = usage.usage;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Usage & Limits</CardTitle>
            <CardDescription>
              Current plan: <Badge variant="secondary">{usage.plan.name}</Badge>
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled>
            Upgrade Plan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Subscriber Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Subscribers</span>
            </div>
            <div className="flex items-center gap-2">
              {subscribers.isAtLimit && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Limit Reached
                </Badge>
              )}
              {subscribers.isNearLimit && !subscribers.isAtLimit && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Near Limit
                </Badge>
              )}
              <span className="text-sm">
                {subscribers.current.toLocaleString()}
                {subscribers.limit && ` / ${subscribers.limit.toLocaleString()}`}
              </span>
            </div>
          </div>
          {subscribers.limit && (
            <Progress
              value={subscribers.percentage}
              className={
                subscribers.isAtLimit
                  ? "[&>div]:bg-destructive"
                  : subscribers.isNearLimit
                  ? "[&>div]:bg-amber-500"
                  : ""
              }
            />
          )}
          {!subscribers.limit && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Unlimited subscribers
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{usage.usage.articles.total}</div>
            <div className="text-xs text-muted-foreground">Articles</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Mail className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{usage.usage.editions.total}</div>
            <div className="text-xs text-muted-foreground">Editions</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Rss className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{usage.usage.rssSources}</div>
            <div className="text-xs text-muted-foreground">RSS Sources</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Search className="h-4 w-4" />
            </div>
            <div className="text-2xl font-bold">{usage.usage.searchTopics}</div>
            <div className="text-xs text-muted-foreground">Search Topics</div>
          </div>
        </div>

        {/* This Month */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">This Month</h4>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{usage.usage.articles.thisMonth} articles added</span>
            <span>{usage.usage.editions.sentThisMonth} newsletters sent</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

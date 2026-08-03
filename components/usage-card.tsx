"use client";

import { useEffect, useState } from "react";
import { Num, StatusChip } from "@/components/radar/primitives";
import {
  LoadError,
  RadarPanel,
  RadarProgress,
  StatTile,
} from "@/components/radar/controls";

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
    setIsLoading(true);
    setError(null);
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
      <div className="radar-skeleton rounded-xl border border-radar-line bg-radar-surface p-4">
        <div className="h-[15px] w-[40%] rounded bg-radar-skel" />
        <div className="mt-3 h-[5px] w-full rounded-full bg-radar-skel" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[62px] rounded-[10px] bg-radar-skel" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !usage) {
    return (
      <LoadError
        what="Usage"
        message={error}
        onRetry={() => void fetchUsage()}
      />
    );
  }

  const { subscribers } = usage.usage;
  const limitTone = subscribers.isAtLimit
    ? "err"
    : subscribers.isNearLimit
      ? "warn"
      : null;

  return (
    <RadarPanel
      title="Usage"
      note={`On the ${usage.plan.name} plan`}
      actions={
        limitTone ? (
          <StatusChip tone={limitTone}>
            {subscribers.isAtLimit ? "Subscriber limit reached" : "Near the limit"}
          </StatusChip>
        ) : undefined
      }
    >
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] font-medium text-radar-ink">
            Subscribers
          </span>
          <span className="text-[12px] text-radar-ink2">
            <Num className="text-radar-ink">
              {subscribers.current.toLocaleString("en-GB")}
            </Num>
            {subscribers.limit ? (
              <>
                {" of "}
                <Num>{subscribers.limit.toLocaleString("en-GB")}</Num>
              </>
            ) : (
              ", no cap on this plan"
            )}
          </span>
        </div>

        {subscribers.limit && (
          <RadarProgress
            value={subscribers.percentage}
            tone={
              subscribers.isAtLimit || subscribers.isNearLimit ? "accent" : "info"
            }
            className="mt-2"
          />
        )}

        {subscribers.isAtLimit && (
          <p className="mt-2 mb-0 text-[11.5px] text-radar-err">
            New subscribers are being rejected until the list shrinks or the plan
            changes.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Stories"
          value={usage.usage.articles.total}
          note={`${usage.usage.articles.thisMonth} added this month`}
        />
        <StatTile
          label="Editions"
          value={usage.usage.editions.total}
          note={`${usage.usage.editions.sentThisMonth} sent this month`}
        />
        <StatTile label="Feeds" value={usage.usage.rssSources} note="active sources" />
        <StatTile
          label="Watchlists"
          value={usage.usage.searchTopics}
          note="standing web searches"
        />
      </div>
    </RadarPanel>
  );
}

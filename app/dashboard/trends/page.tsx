"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  ChipGroup,
  Eyebrow,
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  SectionLabel,
  SkeletonBar,
  Sparkline,
} from "@/components/radar/primitives";
import { relativeTime, sourceIdentity } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

interface TrendDriver {
  name: string;
  pct: number;
}

interface TrendArticle {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  relevanceScore: number | null;
}

interface Trend {
  key: string;
  name: string;
  series: number[];
  delta: number | null;
  mentions: number;
  spanDays: number;
  drivers: TrendDriver[];
  articles: TrendArticle[];
}

interface TrendsMeta {
  days: number;
  bucketCount: number;
  articlesConsidered: number;
  topicsFound: number;
  hasEnoughHistory: boolean;
}

type WindowDays = "30" | "90" | "180";

/** Accent for acceleration, secondary for steady, muted for decline. */
function trendColor(delta: number | null): string {
  if (delta === null) return "var(--r-ink3)";
  if (delta >= 25) return "var(--r-accent)";
  if (delta > 0) return "var(--r-primary2)";
  return "var(--r-ink3)";
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "new";
  // Minus sign, never a hyphen, for a negative figure.
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`;
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [meta, setMeta] = useState<TrendsMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [windowDays, setWindowDays] = useState<WindowDays>("90");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/trends?days=${windowDays}&limit=12`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || `Trends request failed (${res.status})`);
        }
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setTrends(json.data ?? []);
        setMeta(json.meta ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load trends");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  const selected = useMemo(
    () => trends.find((t) => t.key === selectedKey) ?? null,
    [trends, selectedKey]
  );

  // Escape closes the detail panel.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const leaders = trends.slice(0, 6);
  const secondary = trends.slice(6, 10);

  return (
    <>
      <AppHeader />

      <RadarMain width="1180px" className="relative">
        <PageHeading
          eyebrow={`Trend radar · ${windowDays} days`}
          title={
            leaders.length > 0 && (leaders[0].delta ?? 0) > 0
              ? "Accelerating now"
              : "What the archive is saying"
          }
          subtitle={
            meta
              ? `Mention velocity across ${meta.topicsFound} topics, computed from ${meta.articlesConsidered.toLocaleString("en-GB")} scored items. Movement compares the last 14 days against the 14 before.`
              : "Mention velocity computed from scored items in the window."
          }
          actions={
            <ChipGroup<WindowDays>
              label="Window"
              value={windowDays}
              onChange={setWindowDays}
              options={[
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
                { value: "180", label: "180 days" },
              ]}
            />
          }
        />

        {/* Failure */}
        {error && !isLoading && (
          <div className="rounded-xl border border-radar-err bg-radar-surface px-4 py-3.5">
            <p className="m-0 text-[13px] font-semibold text-radar-ink">
              Trends could not be computed
            </p>
            <p className="mt-1 mb-0 text-[12.5px] text-radar-ink2">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="border-t border-radar-line" aria-busy="true">
            <span className="sr-only">Computing trends</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="radar-skeleton flex items-center gap-6 border-b border-radar-line2 py-5"
              >
                <div className="flex flex-1 flex-col gap-2">
                  <SkeletonBar width={`${60 + i * 6}%`} height={15} />
                  <SkeletonBar width={`${40 + i * 8}%`} />
                </div>
                <SkeletonBar width={132} height={32} className="hidden sm:block" />
                <SkeletonBar width={60} height={14} />
              </div>
            ))}
          </div>
        )}

        {/* Not enough history: an honest state, not an empty chart */}
        {!isLoading && !error && (!meta?.hasEnoughHistory || trends.length === 0) && (
          <div className="radar-enter mx-auto max-w-[560px] py-20 text-center">
            <h2 className="font-editorial m-0 text-[25px] font-medium text-radar-ink">
              Not enough history to detect movement
            </h2>
            <p className="mt-3 mb-0 text-[13.5px] text-radar-ink2 text-pretty">
              Velocity needs a few weeks of scored items before acceleration means
              anything.{" "}
              {meta
                ? `So far this window holds ${meta.articlesConsidered.toLocaleString("en-GB")} items across ${meta.topicsFound} topics.`
                : ""}
            </p>
            <div className="mt-6 flex justify-center gap-2.5">
              <Link href="/dashboard" className={radarButtonClass("accent")}>
                Run curation
              </Link>
              <Link href="/dashboard/sources" className={radarButtonClass()}>
                Add sources
              </Link>
            </div>
          </div>
        )}

        {/* Trend table */}
        {!isLoading && !error && meta?.hasEnoughHistory && trends.length > 0 && (
          <>
            <div className="border-t border-radar-line">
              <div
                className="hidden gap-5 border-b border-radar-line2 py-2.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-radar-ink3 lg:grid"
                style={{
                  gridTemplateColumns: "1fr 150px 92px 128px 26px",
                }}
              >
                <div>Topic</div>
                <div>{windowDays}-day velocity</div>
                <div className="text-right">Δ 14d</div>
                <div>Driven by</div>
                <div />
              </div>

              {leaders.map((trend) => {
                const color = trendColor(trend.delta);
                const active = selectedKey === trend.key;

                return (
                  <button
                    key={trend.key}
                    type="button"
                    onClick={() => setSelectedKey(trend.key)}
                    aria-expanded={active}
                    className={cn(
                      "block w-full border-b border-radar-line2 py-4 text-left transition-colors",
                      "hover:bg-radar-surface2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
                      "lg:py-[18px]",
                      active && "bg-radar-surface2"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_150px_92px_128px_26px] lg:gap-5">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-radar-ink">
                            {trend.name}
                          </span>
                          <span className="rounded-full border border-radar-line2 bg-radar-surface2 px-2 py-px text-[10.5px] text-radar-ink2">
                            {trend.mentions}{" "}
                            {trend.mentions === 1 ? "mention" : "mentions"}
                          </span>
                        </span>
                        <span className="mt-1.5 block max-w-[520px] text-[12.5px] text-radar-ink2 text-pretty">
                          {trend.drivers.length > 0
                            ? `Led by ${trend.drivers[0].name} at ${trend.drivers[0].pct}% of mentions, across ${trend.spanDays} days.`
                            : `Seen across ${trend.spanDays} days.`}
                        </span>
                      </span>

                      <Sparkline
                        values={trend.series}
                        color={color}
                        width={150}
                        height={34}
                        className="hidden lg:block"
                      />

                      <span
                        className="font-num text-left text-[14px] font-medium tabular-nums lg:text-right"
                        style={{ color }}
                      >
                        {formatDelta(trend.delta)}
                      </span>

                      {/* Two chips is what 128px fits without wrapping to a second line. */}
                      <span className="hidden items-center gap-1.5 overflow-hidden lg:flex">
                        {trend.drivers.slice(0, 2).map((driver) => (
                          <span
                            key={driver.name}
                            className="font-num truncate rounded border border-radar-line bg-radar-surface px-1.5 py-0.5 text-[10.5px] text-radar-ink2"
                            title={`${driver.name} · ${driver.pct}%`}
                          >
                            {sourceIdentity(`https://${driver.name}`).name}
                          </span>
                        ))}
                      </span>

                      <span
                        aria-hidden="true"
                        className="hidden text-right text-[13px] text-radar-ink3 lg:block"
                      >
                        ›
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Small multiples for the tail */}
            {secondary.length > 0 && (
              <div className="mt-8">
                <SectionLabel className="mb-3">Also moving</SectionLabel>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {secondary.map((trend) => (
                    <button
                      key={trend.key}
                      type="button"
                      onClick={() => setSelectedKey(trend.key)}
                      className="rounded-xl border border-radar-line bg-radar-surface px-4 py-3.5 text-left transition-colors hover:border-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                    >
                      <div className="truncate text-[12.5px] font-semibold text-radar-ink">
                        {trend.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-radar-ink3">
                        {formatDelta(trend.delta)} · {trend.mentions} mentions
                      </div>
                      <Sparkline
                        values={trend.series}
                        color={trendColor(trend.delta)}
                        width={200}
                        height={40}
                        showEndpoint={false}
                        className="mt-2.5 w-full"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Detail panel */}
        {selected && (
          <>
            <button
              type="button"
              aria-label="Close topic detail"
              onClick={() => setSelectedKey(null)}
              className="fixed inset-0 z-40 bg-[rgba(14,21,23,0.28)]"
            />
            <aside
              role="dialog"
              aria-label={`${selected.name} detail`}
              className="radar-panel-in fixed inset-y-0 right-0 z-50 w-full max-w-[460px] overflow-y-auto border-l border-radar-line bg-radar-bg shadow-radar-lg"
            >
              <div className="sticky top-0 flex items-start gap-3 border-b border-radar-line2 bg-radar-bg px-5 py-4">
                <div className="flex-1">
                  <Eyebrow>
                    Topic ·{" "}
                    {selected.delta === null
                      ? "no baseline yet"
                      : selected.delta > 0
                        ? "accelerating"
                        : selected.delta < 0
                          ? "decelerating"
                          : "steady"}
                  </Eyebrow>
                  <h2 className="mt-2 mb-0 text-[21px] font-semibold tracking-[-0.015em] text-radar-ink">
                    {selected.name}
                  </h2>
                </div>
                <RadarButton
                  size="sm"
                  onClick={() => setSelectedKey(null)}
                  aria-label="Close"
                  className="h-7 w-7 px-0"
                >
                  <span aria-hidden="true">×</span>
                </RadarButton>
              </div>

              <div className="flex flex-col gap-6 px-5 pt-5 pb-10">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Δ 14 days",
                      value: formatDelta(selected.delta),
                      color: trendColor(selected.delta),
                    },
                    {
                      label: "Mentions",
                      value: selected.mentions.toLocaleString("en-GB"),
                      color: undefined,
                    },
                    {
                      label: "Span",
                      value: `${selected.spanDays}d`,
                      color: undefined,
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-[10px] border border-radar-line bg-radar-surface px-3 py-2.5"
                    >
                      <div className="text-[10.5px] uppercase tracking-[0.05em] text-radar-ink3">
                        {stat.label}
                      </div>
                      <Num
                        className="mt-1 block text-[17px] text-radar-ink"
                        style={stat.color ? { color: stat.color } : undefined}
                      >
                        {stat.value}
                      </Num>
                    </div>
                  ))}
                </div>

                <div>
                  <SectionLabel className="mb-3">Mentions per week</SectionLabel>
                  <WeeklyChart values={selected.series} />
                </div>

                {selected.drivers.length > 0 && (
                  <div>
                    <SectionLabel className="mb-2.5">Where it comes from</SectionLabel>
                    <div className="flex flex-col gap-2.5">
                      {selected.drivers.map((driver) => (
                        <div key={driver.name} className="flex items-center gap-3">
                          <span className="w-[110px] shrink-0 truncate text-[12px] text-radar-ink2">
                            {sourceIdentity(`https://${driver.name}`).name}
                          </span>
                          <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-radar-line2">
                            <span
                              className="block h-full rounded-full bg-radar-primary2"
                              style={{ width: `${driver.pct}%` }}
                            />
                          </span>
                          <Num className="w-9 shrink-0 text-right text-[11px] text-radar-ink3">
                            {driver.pct}%
                          </Num>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.articles.length > 0 && (
                  <div>
                    <SectionLabel className="mb-2.5">
                      Linked stories · {selected.mentions}
                    </SectionLabel>
                    <div className="flex flex-col">
                      {selected.articles.map((article) => (
                        <a
                          key={article.id}
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block border-b border-radar-line2 py-2.5 no-underline hover:bg-radar-surface2"
                        >
                          <div className="font-editorial text-[15px] leading-[1.3] text-radar-ink">
                            {article.title}
                          </div>
                          <div className="mt-1 text-[11.5px] text-radar-ink3">
                            {sourceIdentity(article.sourceUrl).name} ·{" "}
                            {relativeTime(article.publishedAt)}
                            {article.relevanceScore !== null &&
                              ` · score ${article.relevanceScore.toFixed(1)}`}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href={`/dashboard/search?q=${encodeURIComponent(selected.name)}`}
                  className={radarButtonClass("accent", "md", "w-full")}
                >
                  Search the web for this
                </Link>
              </div>
            </aside>
          </>
        )}
      </RadarMain>
    </>
  );
}

/** Filled area chart over the weekly buckets, with an axis the reader can read. */
function WeeklyChart({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <p className="m-0 text-[12.5px] text-radar-ink3">
        Not enough weeks in this window to plot.
      </p>
    );
  }

  const width = 400;
  const height = 150;
  const base = height - 10;
  const max = Math.max(...values, 1);

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = base - (v / max) * (base - 12);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M0,${base} ${points
    .map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")} L${width},${base} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[150px] w-full"
        role="img"
        aria-label={`Weekly mentions, ${values.join(", ")}, peaking at ${max}`}
      >
        <line x1="0" y1={base} x2={width} y2={base} stroke="var(--r-line)" />
        <line
          x1="0"
          y1={base - (base - 12) / 2}
          x2={width}
          y2={base - (base - 12) / 2}
          stroke="var(--r-line2)"
        />
        <path d={area} fill="rgba(255,121,1,0.12)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--r-accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1.5 flex justify-between">
        <Num className="text-[10.5px] text-radar-ink3">
          {values.length} weeks ago
        </Num>
        <Num className="text-[10.5px] text-radar-ink3">peak {max}</Num>
        <Num className="text-[10.5px] text-radar-ink3">this week</Num>
      </div>
    </div>
  );
}

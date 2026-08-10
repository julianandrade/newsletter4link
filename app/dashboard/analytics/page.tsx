"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  Tag,
} from "@/components/radar/primitives";
import {
  EmptyState,
  RadarField,
  RadarInput,
  RadarPanel,
  RadarSelect,
  SkeletonRows,
  StatTile,
  TableShell,
  tableClass,
  tdClass,
  theadClass,
  thClass,
  trClass,
} from "@/components/radar/controls";
import { SortableTh, type SortState } from "@/components/radar/sortable";
import { sortBy } from "@/lib/list-sort";
import { sourceIdentity } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

type DateRange = "7d" | "14d" | "30d" | "90d" | "custom";
type TimelineSortField = "date" | "opens" | "clicks";

interface Edition {
  id: string;
  week: number;
  year: number;
  /** RQ-008: the title, or the week label when there is none. Derived by the API. */
  label: string;
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

const EMPTY_METRICS = {
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

/** Engagement health maps onto the reserved status colours, label always present. */
const HEALTH_BANDS = [
  {
    key: "active" as const,
    label: "Active",
    note: "opened something in the last 30 days",
    color: "var(--r-ok)",
  },
  {
    key: "dormant" as const,
    label: "Dormant",
    note: "last opened 30 to 90 days ago",
    color: "var(--r-warn)",
  },
  {
    key: "atRisk" as const,
    label: "At risk",
    note: "nothing opened in over 90 days",
    color: "var(--r-err)",
  },
  {
    key: "new" as const,
    label: "New",
    note: "fewer than three editions received",
    color: "var(--r-primary2)",
  },
];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path =
      parsed.pathname.length > 30
        ? parsed.pathname.substring(0, 30) + "…"
        : parsed.pathname;
    return parsed.hostname + path;
  } catch {
    return url.substring(0, 50) + (url.length > 50 ? "…" : "");
  }
}

export default function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [selectedEdition, setSelectedEdition] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("14d");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [segmentBy, setSegmentBy] = useState<"language" | "style">("language");
  const [showTimelineTable, setShowTimelineTable] = useState(false);
  const [timelineSort, setTimelineSort] = useState<SortState<TimelineSortField>>({
    field: "date",
    direction: "asc",
  });

  useEffect(() => {
    // Only fetch when not in custom mode, or when both custom dates are filled
    if (dateRange !== "custom" || (customStartDate && customEndDate)) {
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const metrics = data?.metrics || EMPTY_METRICS;
  const timeline = data?.timeline ?? [];

  /**
   * The numbers view is a table, so its headers order it.
   *
   * Sorted in the browser, and that is not the shortcut it looks like: the whole series is
   * already here, uncapped and unpaginated, because the chart beside it needs every point.
   * There is no slice to mistake for the whole. Every list that does have a slice sorts on
   * the server.
   *
   * `date` stays the chart's order regardless. A chart with a time axis sorted by opens is
   * not a chart.
   */
  const sortedTimeline = useMemo(
    () =>
      timelineSort.field === "date" && timelineSort.direction === "asc"
        ? timeline
        : sortBy(timeline, (day) => day[timelineSort.field], timelineSort.direction),
    [timeline, timelineSort]
  );
  const segments = useMemo(() => {
    if (!data?.segmentation) return [];
    return segmentBy === "language"
      ? data.segmentation.byLanguage.map((s) => ({
          key: s.language,
          label: s.label,
          count: s.count,
          openRate: s.openRate,
        }))
      : data.segmentation.byStyle.map((s) => ({
          key: s.style,
          label: s.label,
          count: s.count,
          openRate: s.openRate,
        }));
  }, [data, segmentBy]);

  const segmentTotal = segments.reduce((sum, s) => sum + s.count, 0);
  const healthTotal = data?.engagementHealth
    ? HEALTH_BANDS.reduce(
        (sum, band) => sum + data.engagementHealth![band.key].count,
        0
      )
    : 0;
  const topClicks = data?.topLinks?.[0]?.clicks ?? 0;

  const filters = (
    <>
      <RadarSelect
        aria-label="Date range"
        className="w-auto min-w-[150px]"
        value={dateRange}
        onChange={(event) => setDateRange(event.target.value as DateRange)}
      >
        <option value="7d">Last 7 days</option>
        <option value="14d">Last 14 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
        <option value="custom">Custom range</option>
      </RadarSelect>

      <RadarSelect
        aria-label="Edition"
        className="w-auto min-w-[170px]"
        value={selectedEdition}
        onChange={(event) => setSelectedEdition(event.target.value)}
      >
        <option value="all">Every edition</option>
        {data?.editions?.map((edition) => (
          <option key={edition.id} value={edition.id}>
            {edition.label}
          </option>
        ))}
      </RadarSelect>
    </>
  );

  if (error && !data) {
    return (
      <>
        <AppHeader />
        <RadarMain width="1180px">
          <PageHeading eyebrow="Analytics" title="Analytics are unavailable" />
          <EmptyState
            title="The analytics request failed"
            actions={
              <RadarButton variant="accent" onClick={() => void fetchAnalytics()}>
                Try again
              </RadarButton>
            }
          >
            {error}
          </EmptyState>
        </RadarMain>
      </>
    );
  }

  return (
    <>
      <AppHeader />

      <RadarMain width="1180px">
        <PageHeading
          eyebrow="Analytics"
          title={
            isLoading && !data
              ? "Analytics"
              : metrics.sent === 0
                ? "Nothing has been sent in this window"
                : `${metrics.openRate.toFixed(0)}% of ${metrics.delivered} delivered were opened`
          }
          subtitle="Open and click figures come from the tracking pixel and link redirects, so they undercount readers who block images."
          actions={filters}
        />

        {dateRange === "custom" && (
          <div className="mb-5 grid gap-4 rounded-xl border border-radar-line bg-radar-surface p-4 sm:grid-cols-2 lg:max-w-[420px]">
            <RadarField label="From" htmlFor="analytics-from">
              <RadarInput
                id="analytics-from"
                type="date"
                value={customStartDate}
                max={customEndDate || undefined}
                onChange={(event) => setCustomStartDate(event.target.value)}
              />
            </RadarField>
            <RadarField label="To" htmlFor="analytics-to">
              <RadarInput
                id="analytics-to"
                type="date"
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(event) => setCustomEndDate(event.target.value)}
              />
            </RadarField>
          </div>
        )}

        {isLoading && !data ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Headline figures */}
            <div>
              <SectionRuleLabel>Delivery and engagement</SectionRuleLabel>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatTile
                  label="Sent"
                  value={metrics.sent}
                  note={`${metrics.delivered} delivered`}
                />
                <StatTile
                  label="Open rate"
                  value={`${metrics.openRate.toFixed(1)}%`}
                  note={`${metrics.opened} opens`}
                  color="var(--r-chart-1)"
                />
                <StatTile
                  label="Click rate"
                  value={`${metrics.clickRate.toFixed(1)}%`}
                  note={`${metrics.clicked} clicks`}
                  color="var(--r-chart-2)"
                />
                <StatTile
                  label="Delivered"
                  value={`${metrics.deliveryRate.toFixed(1)}%`}
                  note={`${metrics.delivered} of ${metrics.sent}`}
                />
                <StatTile
                  label="Bounced"
                  value={`${metrics.bounceRate.toFixed(1)}%`}
                  note={`${metrics.bounced} bounces`}
                  color={metrics.bounceRate > 2 ? "var(--r-err)" : undefined}
                />
                <StatTile
                  label="Unsubscribed"
                  value={`${metrics.unsubscribeRate.toFixed(1)}%`}
                  note={`${metrics.unsubscribed} left`}
                  color={metrics.unsubscribeRate > 1 ? "var(--r-warn)" : undefined}
                />
              </div>
            </div>

            {/* Timeline */}
            <RadarPanel
              title="Opens and clicks by day"
              note={
                timeline.length > 0
                  ? `${shortDate(timeline[0].date)} to ${shortDate(timeline[timeline.length - 1].date)}`
                  : "Nothing recorded in this window."
              }
              actions={
                timeline.length > 0 ? (
                  <RadarButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowTimelineTable((previous) => !previous)}
                    aria-expanded={showTimelineTable}
                  >
                    {showTimelineTable ? "Show the chart" : "Show the numbers"}
                  </RadarButton>
                ) : undefined
              }
            >
              {timeline.length === 0 ? (
                <p className="m-0 py-10 text-center text-[12.5px] text-radar-ink3">
                  No opens or clicks have been recorded in this window yet.
                </p>
              ) : showTimelineTable ? (
                <TableShell>
                  <table className={tableClass}>
                    <caption className="sr-only">Opens and clicks by day</caption>
                    <thead>
                      <tr className={theadClass}>
                        <SortableTh
                          field="date"
                          sort={timelineSort}
                          onSort={setTimelineSort}
                          defaultDirection="asc"
                        >
                          Day
                        </SortableTh>
                        <SortableTh
                          field="opens"
                          sort={timelineSort}
                          onSort={setTimelineSort}
                          defaultDirection="desc"
                          align="right"
                        >
                          Opens
                        </SortableTh>
                        <SortableTh
                          field="clicks"
                          sort={timelineSort}
                          onSort={setTimelineSort}
                          defaultDirection="desc"
                          align="right"
                        >
                          Clicks
                        </SortableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTimeline.map((day) => (
                        <tr key={day.date} className={trClass}>
                          <td className={tdClass}>{shortDate(day.date)}</td>
                          <td className={cn(tdClass, "text-right")}>
                            <Num>{day.opens}</Num>
                          </td>
                          <td className={cn(tdClass, "text-right")}>
                            <Num>{day.clicks}</Num>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              ) : (
                <TimelineChart points={timeline} />
              )}
            </RadarPanel>

            {/* Engagement health */}
            {data?.engagementHealth && healthTotal > 0 && (
              <RadarPanel
                title="Where the list stands"
                note={`${healthTotal} subscribers, grouped by how recently they opened something`}
              >
                <div
                  className="flex h-3 w-full gap-[2px] overflow-hidden"
                  role="img"
                  aria-label={HEALTH_BANDS.map(
                    (band) =>
                      `${band.label} ${data.engagementHealth![band.key].count}`
                  ).join(", ")}
                >
                  {HEALTH_BANDS.map((band) => {
                    const value = data.engagementHealth![band.key];
                    if (value.count === 0) return null;
                    return (
                      <span
                        key={band.key}
                        className="h-full rounded-[3px]"
                        style={{
                          width: `${(value.count / healthTotal) * 100}%`,
                          background: band.color,
                        }}
                      />
                    );
                  })}
                </div>

                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {HEALTH_BANDS.map((band) => {
                    const value = data.engagementHealth![band.key];
                    return (
                      <div key={band.key}>
                        <dt className="flex items-center gap-2 text-[12px] font-medium text-radar-ink">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: band.color }}
                          />
                          {band.label}
                        </dt>
                        <dd className="m-0 mt-1">
                          <Num className="text-[17px] text-radar-ink">
                            {value.count}
                          </Num>
                          <span className="ml-1.5 text-[11.5px] text-radar-ink3">
                            {value.percentage.toFixed(1)}%
                          </span>
                        </dd>
                        <p className="mt-0.5 mb-0 text-[11px] text-radar-ink3 text-pretty">
                          {band.note}
                        </p>
                      </div>
                    );
                  })}
                </dl>
              </RadarPanel>
            )}

            {/* Segmentation */}
            {data?.segmentation && (
              <RadarPanel
                title="Who reads which variant"
                note="Share of the list, with the open rate each variant earns"
                actions={
                  <ChipGroup<"language" | "style">
                    label="Segment by"
                    kind="options"
                    size="sm"
                    value={segmentBy}
                    onChange={setSegmentBy}
                    options={[
                      { value: "language", label: "Language" },
                      { value: "style", label: "Style" },
                    ]}
                  />
                }
              >
                {segments.length === 0 ? (
                  <p className="m-0 py-8 text-center text-[12.5px] text-radar-ink3">
                    No subscriber {segmentBy} data yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {segments.map((segment) => {
                      const share =
                        segmentTotal > 0 ? (segment.count / segmentTotal) * 100 : 0;

                      return (
                        <div key={segment.key}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-[12.5px] font-medium text-radar-ink">
                              {segment.label}
                            </span>
                            <span className="text-[11.5px] text-radar-ink3">
                              <Num className="text-radar-ink2">{segment.count}</Num>{" "}
                              subscribers ·{" "}
                              <Num className="text-radar-ink">
                                {segment.openRate.toFixed(1)}%
                              </Num>{" "}
                              open rate
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-radar-line2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${share}%`,
                                background: "var(--r-chart-2)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </RadarPanel>
            )}

            {/* Top links */}
            <RadarPanel
              title="What readers clicked"
              note={
                data?.topLinks && data.topLinks.length > 0
                  ? `${data.topLinks.length} links, most clicked first`
                  : "No clicks recorded in this window."
              }
              padded={false}
            >
              {!data?.topLinks || data.topLinks.length === 0 ? (
                <p className="m-0 px-4 py-10 text-center text-[12.5px] text-radar-ink3">
                  Clicks appear here once a send goes out and readers follow a link.
                </p>
              ) : (
                <ol className="m-0 list-none p-0">
                  {data.topLinks.map((link, index) => (
                    <li
                      key={`${link.url}-${index}`}
                      className="border-b border-radar-line2 px-4 py-3 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <Num className="w-5 shrink-0 pt-0.5 text-[11.5px] text-radar-ink3">
                          {index + 1}
                        </Num>
                        <div className="min-w-0 flex-1">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={link.url}
                            className="block truncate text-[13px] font-medium text-radar-ink no-underline hover:text-radar-accent"
                          >
                            {link.title}
                          </a>
                          <p className="mt-0.5 mb-0 flex flex-wrap items-center gap-2 text-[11px] text-radar-ink3">
                            <span className="truncate">{truncateUrl(link.url)}</span>
                            {link.isArticle && (
                              <span className="text-radar-ink2">
                                {sourceIdentity(link.url).name}
                              </span>
                            )}
                          </p>
                          {link.category && link.category.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {link.category.slice(0, 3).map((cat) => (
                                <Tag key={cat}>{cat}</Tag>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-radar-line2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${topClicks > 0 ? (link.clicks / topClicks) * 100 : 0}%`,
                                background: "var(--r-chart-2)",
                              }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-[11.5px] text-radar-ink2">
                          <Num className="text-[14px] text-radar-ink">
                            {link.clicks}
                          </Num>
                          <span className="ml-1">
                            {link.clicks === 1 ? "click" : "clicks"}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </RadarPanel>
          </div>
        )}
      </RadarMain>
    </>
  );
}

/** Section label with the rule, used between the page's stacked blocks. */
function SectionRuleLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <SectionLabel>{children}</SectionLabel>
      <div aria-hidden="true" className="h-px flex-1 bg-radar-line2" />
    </div>
  );
}

/**
 * Two series on one scale, because opens and clicks are the same unit. A legend
 * plus end labels carry identity, so colour is never the only signal, and the
 * panel offers the same data as a table.
 */
function TimelineChart({
  points,
}: {
  points: Array<{ date: string; opens: number; clicks: number }>;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // User units inside the stretched plot area; the axis labels live in HTML.
  const plotWidth = 720;
  const plotHeight = 160;
  const inset = 3;

  const max = Math.max(
    1,
    ...points.map((point) => Math.max(point.opens, point.clicks))
  );

  const xFor = (index: number) =>
    points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    plotHeight - inset - (value / max) * (plotHeight - inset * 2);

  const line = (key: "opens" | "clicks") =>
    points
      .map((point, index) => `${xFor(index).toFixed(1)},${yFor(point[key]).toFixed(1)}`)
      .join(" ");

  const gridValues = [0, max / 2, max];
  const active = hover === null ? null : points[hover];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {[
          { label: "Opens", color: "var(--r-chart-1)" },
          { label: "Clicks", color: "var(--r-chart-2)" },
        ].map((series) => (
          <span
            key={series.label}
            className="flex items-center gap-2 text-[11.5px] text-radar-ink2"
          >
            <span
              aria-hidden="true"
              className="h-[3px] w-4 rounded-full"
              style={{ background: series.color }}
            />
            {series.label}
          </span>
        ))}
        <span className="flex-1" />
        {active && (
          <span className="text-[11.5px] text-radar-ink2">
            {shortDate(active.date)}: <Num>{active.opens}</Num> opens,{" "}
            <Num>{active.clicks}</Num> clicks
          </span>
        )}
      </div>

      {/* Geometry stretches to the panel; the labels stay HTML so they never
          distort with the non-uniform scale. */}
      <div className="flex gap-2.5">
        <div className="flex w-7 shrink-0 flex-col justify-between py-px text-right">
          {[...gridValues].reverse().map((value) => (
            <Num key={value} className="text-[10px] leading-none text-radar-ink3">
              {Math.round(value)}
            </Num>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${plotWidth} ${plotHeight}`}
          preserveAspectRatio="none"
          className="h-[180px] w-full touch-none"
          role="img"
          aria-label={`Opens and clicks per day. Peak ${max} in a single day across ${points.length} days.`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            const index = Math.round(ratio * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, index)));
          }}
        >
          {gridValues.map((value) => (
            <line
              key={value}
              x1={0}
              x2={plotWidth}
              y1={yFor(value)}
              y2={yFor(value)}
              stroke="var(--r-line2)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {hover !== null && (
            <line
              x1={xFor(hover)}
              x2={xFor(hover)}
              y1={0}
              y2={plotHeight}
              stroke="var(--r-ink3)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <polyline
            points={line("opens")}
            fill="none"
            stroke="var(--r-chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={line("clicks")}
            fill="none"
            stroke="var(--r-chart-2)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="mt-1.5 flex justify-between pl-[38px]">
        <Num className="text-[10px] text-radar-ink3">
          {shortDate(points[0].date)}
        </Num>
        <Num className="text-[10px] text-radar-ink3">
          {shortDate(points[points.length - 1].date)}
        </Num>
      </div>
    </div>
  );
}

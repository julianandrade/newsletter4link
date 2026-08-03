"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  ChipGroup,
  Eyebrow,
  FilterPill,
  Kbd,
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  ScoreMeter,
  SectionLabel,
  SkeletonBar,
  SourceStamp,
  Tag,
} from "@/components/radar/primitives";
import { RadarMark } from "@/components/radar/icons";
import { dayKey, dayLabel, relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Article {
  id: string;
  title: string;
  sourceUrl: string;
  author?: string | null;
  publishedAt: string;
  relevanceScore: number | null;
  summary: string | null;
  category: string[];
  status: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  team: string;
  impact?: string | null;
  featured: boolean;
}

interface RssSource {
  id: string;
  name: string;
  category: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
}

type Density = "comfortable" | "compact";
type Window = "7" | "30" | "all";

const DAYS_PER_PAGE = 4;

export default function FeedPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState<RssSource[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [density, setDensity] = useState<Density>("comfortable");
  const [minScore, setMinScore] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<Window>("all");
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);

  const [approving, setApproving] = useState<string | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const [curation, setCuration] = useState<{
    running: boolean;
    message: string;
    current?: number;
    total?: number;
  }>({ running: false, message: "" });
  const [isCancelling, setIsCancelling] = useState(false);

  // Density is a reading preference, so it survives reloads.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("radar:feed-density");
      if (stored === "compact" || stored === "comfortable") setDensity(stored);
    } catch {
      // Default density is fine.
    }
  }, []);

  const changeDensity = (next: Density) => {
    setDensity(next);
    try {
      window.localStorage.setItem("radar:feed-density", next);
    } catch {
      // Non-fatal.
    }
  };

  const fetchArticles = useCallback(async () => {
    const params = new URLSearchParams({ sortBy: "publishedAt", sortOrder: "desc" });
    if (minScore > 0) params.set("scoreMin", String(minScore));
    if (activeCategory) params.set("categories", activeCategory);
    if (timeWindow !== "all") {
      const from = new Date();
      from.setDate(from.getDate() - Number(timeWindow));
      params.set("dateFrom", from.toISOString());
    }

    const res = await fetch(`/api/articles/pending?${params.toString()}`);
    if (!res.ok) throw new Error(`Feed request failed (${res.status})`);

    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Feed request failed");

    setArticles(json.data ?? []);
    if (json.meta?.categories) setCategories(json.meta.categories);
  }, [minScore, activeCategory, timeWindow]);

  // Filter changes refetch; the first pass also loads projects and sources.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    fetchArticles()
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load the feed"
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchArticles]);

  useEffect(() => {
    fetch("/api/projects?featured=true")
      .then((r) => r.json())
      .then((json) => setProjects(json.data ?? []))
      .catch(() => setProjects([]));

    fetch("/api/rss-sources")
      .then((r) => r.json())
      .then((data) => setSources(Array.isArray(data) ? data : []))
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    setVisibleDays(DAYS_PER_PAGE);
  }, [minScore, activeCategory, timeWindow]);

  /* ------------------------------------------------------------- derived data */

  const activeSources = useMemo(
    () => sources.filter((s) => s.active),
    [sources]
  );

  const failedSources = useMemo(
    () => activeSources.filter((s) => Boolean(s.lastError)),
    [activeSources]
  );

  const lastFetched = useMemo(() => {
    const stamps = activeSources
      .map((s) => s.lastFetchedAt)
      .filter((v): v is string => Boolean(v))
      .sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [activeSources]);

  /** Stories bucketed by publication day, newest day first. */
  const days = useMemo(() => {
    const buckets = new Map<string, Article[]>();
    for (const article of articles) {
      const key = dayKey(article.publishedAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(article);
      else buckets.set(key, [article]);
    }
    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => ({ key, items }));
  }, [articles]);

  const shownDays = days.slice(0, visibleDays);
  const hasMore = days.length > visibleDays;

  /* ----------------------------------------------------------------- actions */

  const approve = async (article: Article) => {
    setApproving(article.id);
    try {
      const res = await fetch(`/api/articles/${article.id}/approve`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not approve this story");
      }

      setApproved((previous) => new Set(previous).add(article.id));
      toast.success("Approved for the next edition", {
        description: article.title,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not approve this story"
      );
    } finally {
      setApproving(null);
    }
  };

  const runCuration = async () => {
    setCuration({ running: true, message: "Connecting to the collector…" });

    try {
      const res = await fetch("/api/curation/collect", {
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok) throw new Error(`Collector responded ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("The collector sent no response body");

      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (type: string, raw: string) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }

        const message =
          typeof payload.message === "string" ? payload.message : "Working…";

        if (type === "start") {
          setCuration({ running: true, message });
        } else if (type === "progress") {
          setCuration({
            running: true,
            message,
            current: typeof payload.current === "number" ? payload.current : undefined,
            total: typeof payload.total === "number" ? payload.total : undefined,
          });
        } else if (type === "complete") {
          setCuration({ running: false, message });
          toast.success("Curation finished", { description: message });
          void fetchArticles();
          setTimeout(() => setCuration({ running: false, message: "" }), 4000);
        } else if (type === "cancelled") {
          setCuration({ running: false, message: "Curation cancelled" });
          void fetchArticles();
          setTimeout(() => setCuration({ running: false, message: "" }), 4000);
        } else if (type === "error") {
          const detail =
            typeof payload.error === "string" ? payload.error : "Unknown error";
          setCuration({ running: false, message: detail });
          toast.error("Curation failed", { description: detail });
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          let type = "message";
          let data = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (data) handle(type, data);
        }
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Could not reach the collector";
      setCuration({ running: false, message: detail });
      toast.error("Curation failed", { description: detail });
    }
  };

  const cancelCuration = async () => {
    setIsCancelling(true);
    try {
      const res = await fetch("/api/curation/cancel", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not cancel the run");
      }
      setCuration((previous) => ({ ...previous, message: "Cancelling…" }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel the run"
      );
    } finally {
      setIsCancelling(false);
    }
  };

  /* -------------------------------------------------------------------- view */

  const rowPad = density === "compact" ? "py-3.5" : "py-[22px]";
  const headSize = density === "compact" ? "text-[17px]" : "text-[20px]";

  const subtitle = (
    <>
      <Num>{articles.length}</Num> {articles.length === 1 ? "story" : "stories"} in
      review
      {activeSources.length > 0 && (
        <>
          {" · "}
          <Num>{activeSources.length}</Num> active{" "}
          {activeSources.length === 1 ? "source" : "sources"}
        </>
      )}
      {lastFetched && <> · collected {relativeTime(lastFetched)}</>}
    </>
  );

  return (
    <>
      <AppHeader />

      <RadarMain width="820px">
        <PageHeading
          eyebrow={`${new Date().toLocaleDateString("en-GB", { weekday: "long" })} brief`}
          title="Today in AI"
          subtitle={subtitle}
          actions={
            <>
              <ChipGroup<Density>
                label="Feed density"
                value={density}
                onChange={changeDensity}
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                ]}
              />
              <RadarButton
                variant="accent"
                onClick={runCuration}
                disabled={curation.running}
              >
                {curation.running ? "Running…" : "Run curation"}
              </RadarButton>
            </>
          }
        />

        {/* Live curation progress */}
        {curation.message && (
          <div
            role="status"
            aria-live="polite"
            className="radar-enter mb-5 rounded-xl border border-radar-primary2 bg-radar-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "h-[7px] w-[7px] shrink-0 rounded-full bg-radar-primary2",
                  curation.running && "animate-pulse"
                )}
              />
              <p className="m-0 min-w-0 flex-1 text-[13px] font-semibold text-radar-ink">
                {curation.message}
              </p>
              {curation.current !== undefined && curation.total !== undefined && (
                <Num className="text-[12px] text-radar-ink2">
                  {curation.current} / {curation.total}
                </Num>
              )}
              {curation.running && (
                <RadarButton
                  size="sm"
                  onClick={cancelCuration}
                  disabled={isCancelling}
                  className="hover:border-radar-err hover:text-radar-err"
                >
                  {isCancelling ? "Cancelling…" : "Cancel"}
                </RadarButton>
              )}
            </div>
            {curation.current !== undefined && curation.total ? (
              <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-radar-line2">
                <div
                  className="h-full rounded-full bg-radar-primary2 transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((curation.current / curation.total) * 100))}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Source health, only when a source actually failed */}
        {failedSources.length > 0 && (
          <div className="radar-enter mb-5 flex items-start gap-3 rounded-xl border border-radar-err bg-radar-surface px-4 py-3.5">
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-radar-err"
            />
            <div className="flex-1">
              <p className="m-0 text-[13px] font-semibold text-radar-ink">
                {failedSources.length}{" "}
                {failedSources.length === 1 ? "source" : "sources"} failed on the
                last fetch
              </p>
              <p className="mt-1 mb-0 text-[12.5px] text-radar-ink2 text-pretty">
                {failedSources
                  .slice(0, 3)
                  .map((s) => `${s.name} (${s.lastError})`)
                  .join(", ")}
                {failedSources.length > 3 &&
                  ` and ${failedSources.length - 3} more`}
                . Nothing from these reached the feed below.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/dashboard/sources"
                  className={radarButtonClass("outline", "sm")}
                >
                  Open Sources
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-radar-line pb-3.5">
          <FilterPill
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          >
            All topics
          </FilterPill>
          {categories.slice(0, 4).map((category) => (
            <FilterPill
              key={category}
              active={activeCategory === category}
              onClick={() =>
                setActiveCategory(activeCategory === category ? null : category)
              }
            >
              {category}
            </FilterPill>
          ))}

          <div className="flex items-center gap-0.5 rounded-full border border-radar-line bg-radar-surface p-0.5">
            {(
              [
                ["7", "7 days"],
                ["30", "30 days"],
                ["all", "All time"],
              ] as [Window, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={timeWindow === value}
                onClick={() => setTimeWindow(value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-radar-accent",
                  timeWindow === value
                    ? "bg-radar-surface2 font-semibold text-radar-ink"
                    : "text-radar-ink3 hover:text-radar-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex h-[30px] items-center gap-2.5 rounded-full border border-radar-line bg-radar-surface px-3">
            <span className="text-[12px] text-radar-ink2">Min score</span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.1}
              value={minScore}
              onChange={(event) => setMinScore(Number(event.target.value))}
              className="h-1 w-14 cursor-pointer"
              style={{ accentColor: "var(--r-accent)" }}
            />
            <Num className="w-7 text-[11.5px] text-radar-ink">
              {minScore.toFixed(1)}
            </Num>
          </label>

          <div className="flex-1" />

          <div className="hidden items-center gap-1.5 text-[11px] text-radar-ink3 xl:flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
            <span>move</span>
            <Kbd>A</Kbd>
            <span>approve</span>
          </div>
        </div>

        {/* Load failure */}
        {loadError && !isLoading && (
          <div className="mt-6 rounded-xl border border-radar-err bg-radar-surface px-4 py-3.5">
            <p className="m-0 text-[13px] font-semibold text-radar-ink">
              The feed could not be loaded
            </p>
            <p className="mt-1 mb-3 text-[12.5px] text-radar-ink2">{loadError}</p>
            <RadarButton size="sm" onClick={() => void fetchArticles()}>
              Try again
            </RadarButton>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col gap-6 pt-6" aria-busy="true">
            <span className="sr-only">Loading the feed</span>
            {[
              { w1: "88%", w2: "64%" },
              { w1: "72%", w2: "80%" },
              { w1: "94%", w2: "52%" },
              { w1: "66%", w2: "74%" },
            ].map((skeleton, index) => (
              <div key={index} className="radar-skeleton flex gap-5">
                <div className="flex flex-1 flex-col gap-2.5">
                  <SkeletonBar width={120} height={9} />
                  <SkeletonBar width={skeleton.w1} height={17} />
                  <SkeletonBar width="100%" />
                  <SkeletonBar width={skeleton.w2} />
                  <div className="mt-1 flex gap-1.5">
                    <SkeletonBar width={66} height={18} className="rounded-full" />
                    <SkeletonBar width={52} height={18} className="rounded-full" />
                  </div>
                </div>
                <div className="flex w-[78px] flex-col items-end gap-2">
                  <SkeletonBar width={34} />
                  <SkeletonBar width={60} height={9} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !loadError && articles.length === 0 && (
          <div className="radar-enter mx-auto max-w-[520px] pt-16 pb-10 text-center">
            <div className="mx-auto mb-6 flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-dashed border-radar-line">
              <RadarMark size={18} />
            </div>
            <h2 className="font-editorial m-0 text-[25px] font-medium tracking-[-0.01em] text-radar-ink">
              {activeSources.length === 0
                ? "Nothing on the radar yet"
                : "Nothing clears your filters"}
            </h2>
            <p className="mt-3 mb-0 text-[13.5px] text-radar-ink2 text-pretty">
              {activeSources.length === 0
                ? "Add sources and AI Radar will start scoring stories within minutes."
                : "Lower the minimum score or widen the window, and stories will reappear here."}
            </p>
            <div className="mt-6 flex justify-center gap-2.5">
              {activeSources.length === 0 ? (
                <Link
                  href="/dashboard/sources"
                  className={radarButtonClass("accent")}
                >
                  Add sources
                </Link>
              ) : (
                <RadarButton
                  variant="accent"
                  onClick={() => {
                    setMinScore(0);
                    setActiveCategory(null);
                    setTimeWindow("all");
                  }}
                >
                  Clear filters
                </RadarButton>
              )}
            </div>
          </div>
        )}

        {/* The feed */}
        {!isLoading && !loadError && shownDays.length > 0 && (
          <div>
            {shownDays.map((day, dayIndex) => (
              <section key={day.key} aria-label={dayLabel(day.items[0].publishedAt)}>
                <div className="flex items-center gap-3.5 pt-7 pb-1">
                  <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.09em] text-radar-ink">
                    {dayLabel(day.items[0].publishedAt)}
                  </h2>
                  <div aria-hidden="true" className="h-px flex-1 bg-radar-line2" />
                  <Num className="text-[11px] text-radar-ink3">
                    {day.items.length}{" "}
                    {day.items.length === 1 ? "story" : "stories"}
                  </Num>
                </div>

                {day.items.map((article) => {
                  const isApproved = approved.has(article.id);

                  return (
                    <article
                      key={article.id}
                      className={cn(
                        "flex flex-col gap-3 border-b border-radar-line2 transition-colors sm:flex-row sm:gap-5",
                        rowPad,
                        "hover:bg-radar-surface2"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <SourceStamp
                          sourceUrl={article.sourceUrl}
                          publishedAt={article.publishedAt}
                        />

                        <h3
                          className={cn(
                            "font-editorial m-0 font-medium leading-[1.25] tracking-[-0.01em] text-radar-ink text-balance",
                            headSize
                          )}
                        >
                          <a
                            href={article.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-radar-ink no-underline hover:text-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                          >
                            {article.title}
                          </a>
                        </h3>

                        {article.summary && (
                          <p className="mt-2 mb-0 text-[13px] leading-[1.55] text-radar-ink2 text-pretty">
                            {article.summary}
                          </p>
                        )}

                        {article.category.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {article.category.slice(0, 4).map((tag) => (
                              <Tag key={tag}>{tag}</Tag>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Score and action group at the top of the row, not spread down it. */}
                      <div className="flex shrink-0 flex-row items-center justify-between gap-2.5 sm:w-[86px] sm:flex-col sm:items-end sm:justify-start">
                        <ScoreMeter score={article.relevanceScore} />
                        <RadarButton
                          size="sm"
                          onClick={() => approve(article)}
                          disabled={approving === article.id || isApproved}
                          title="Approve for the next edition"
                          className={cn(
                            "whitespace-nowrap",
                            isApproved
                              ? "border-radar-ok text-radar-ok"
                              : "hover:border-radar-accent hover:text-radar-ink"
                          )}
                        >
                          {isApproved
                            ? "Approved"
                            : approving === article.id
                              ? "Saving…"
                              : "Approve"}
                        </RadarButton>
                      </div>
                    </article>
                  );
                })}

                {/* Internal work, folded in after the first day like the design */}
                {dayIndex === 0 && projects.length > 0 && (
                  <section className="mt-7 mb-1.5 rounded-xl border border-radar-line bg-radar-surface px-5 py-5">
                    <div className="mb-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-1 rounded-full bg-radar-accent"
                        />
                        <Eyebrow tone="ink">From inside Link</Eyebrow>
                      </div>
                      <Link
                        href="/dashboard/projects"
                        className="text-[12px] text-radar-ink3 no-underline hover:text-radar-accent"
                      >
                        All projects →
                      </Link>
                    </div>
                    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {projects.slice(0, 3).map((project) => (
                        <div
                          key={project.id}
                          className="rounded-[10px] border border-radar-line2 bg-radar-bg p-3.5"
                        >
                          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-radar-ink3">
                            {project.team}
                          </div>
                          <div className="font-editorial text-[16px] leading-[1.28] text-radar-ink">
                            {project.name}
                          </div>
                          <p className="mt-1.5 mb-0 text-[12px] text-radar-ink2 text-pretty">
                            {project.impact || project.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </section>
            ))}

            {hasMore && (
              <div className="flex justify-center py-7">
                <RadarButton
                  onClick={() => setVisibleDays((n) => n + DAYS_PER_PAGE)}
                >
                  Load earlier stories
                </RadarButton>
              </div>
            )}

            {!hasMore && (
              <div className="py-7 text-center">
                <SectionLabel>End of the review queue</SectionLabel>
              </div>
            )}
          </div>
        )}
      </RadarMain>
    </>
  );
}

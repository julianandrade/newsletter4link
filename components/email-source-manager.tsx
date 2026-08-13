"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/components/radar/compat";
import {
  Num,
  radarButtonClass,
  SectionLabel,
  SkeletonBar,
  StatusChip,
} from "@/components/radar/primitives";
import { RadarInput, RadarSelect } from "@/components/radar/controls";
import { SearchIcon } from "@/components/radar/icons";
import {
  SortSelect,
  type SortOption,
  type SortState,
} from "@/components/radar/sortable";
import { sortBy } from "@/lib/list-sort";
import { displayName } from "@/lib/inbound/address";
import { healthWarning, sourceHealth, type SourceHealth } from "@/lib/inbound/health";
import type {
  UnknownSenderGroup,
  UnknownState,
} from "@/components/sources/use-source-collections";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

type SourceStatusFilter = "all" | "active" | "paused" | "silent";
type SourceSortField = "lastReceivedAt" | "name" | "createdAt";

const SOURCE_STATUS_FILTERS: [SourceStatusFilter, string][] = [
  ["all", "Every source"],
  ["active", "Active"],
  ["paused", "Paused"],
  ["silent", "Overdue or silent"],
];

const SOURCE_SORT_OPTIONS: SortOption<SourceSortField>[] = [
  { field: "lastReceivedAt", direction: "asc", label: "Silent longest first" },
  { field: "lastReceivedAt", direction: "desc", label: "Heard from most recently" },
  { field: "name", direction: "asc", label: "Name, A to Z" },
  { field: "name", direction: "desc", label: "Name, Z to A" },
  { field: "createdAt", direction: "desc", label: "Added most recently" },
];

/**
 * RQ-007 step 3: EMAIL sources, their health, and the senders nobody has claimed.
 *
 * Kept separate from `RSSSourceManager` rather than added to it. A feed is configured by one
 * field and announces its own failure; an email source is configured by four and can only
 * fail silently, so the two need different forms and different health language. Folding
 * these into a 1441-line component would have made both harder to read.
 */

interface EmailSource {
  id: string;
  name: string;
  category: string;
  active: boolean;
  type: string;
  senderAddress: string | null;
  inboundTag: string | null;
  parseMode: "DIGEST" | "ESSAY" | null;
  expectedCadenceDays: number | null;
  lastReceivedAt: string | null;
  createdAt: string;
}

interface NewSourceDraft {
  name: string;
  senderAddress: string;
  inboundTag: string;
  parseMode: "DIGEST" | "ESSAY";
  expectedCadenceDays: string;
  category: string;
}

const emptyDraft: NewSourceDraft = {
  name: "",
  senderAddress: "",
  inboundTag: "",
  parseMode: "DIGEST",
  expectedCadenceDays: "",
  category: "AI",
};

const healthTone: Record<SourceHealth["state"], "ok" | "warn" | "err" | "neutral"> = {
  ok: "ok",
  never: "err",
  silent: "warn",
  "unknown-cadence": "neutral",
};

const healthLabel: Record<SourceHealth["state"], string> = {
  ok: "receiving",
  never: "never received",
  silent: "silent",
  "unknown-cadence": "no cadence set",
};

export interface EmailSourceManagerProps {
  /** The EMAIL rows, already split out of `/api/rss-sources` by the page. */
  sources: EmailSource[];
  isLoading: boolean;
  /**
   * A failure to load, reported by the page above the tab row rather than in here.
   *
   * Passed anyway because the two empty states below have to know: "No email sources yet"
   * over a list that failed to load says the wrong thing.
   */
  loadError: string | null;
  /** Refetch the sources, owned by the page. Called wherever `loadSources` was. */
  reload: () => Promise<void>;
  /**
   * Refetch the unclaimed senders.
   *
   * Still needed although the unmatched list itself moved to its own tab: pausing a source
   * stops it claiming its sender, so that list changes when this one does.
   */
  reloadUnknown: () => Promise<void>;
  /** Open the create dialog, which the page owns because Promote opens it too. */
  onAdd: () => void;
}

export function EmailSourceManager({
  sources: incoming,
  isLoading,
  loadError,
  reload,
  reloadUnknown: loadUnknown,
  onAdd,
}: EmailSourceManagerProps) {
  /**
   * A local mirror of the rows the page fetched.
   *
   * Needed because the parse-mode toggle is optimistic and rolls itself back when the
   * request fails: the chip is the only place that value is visible, so a chip claiming
   * DIGEST over a source the server still has as ESSAY is worse than no change at all.
   */
  const [sources, setSources] = useState<EmailSource[]>(incoming);
  useEffect(() => {
    setSources(incoming);
  }, [incoming]);

  const loadSources = reload;

  /** The source whose parse mode is in flight, so its toggle cannot be double-clicked. */
  const [savingMode, setSavingMode] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SourceStatusFilter>("all");
  const [sort, setSort] = useState<SortState<SourceSortField>>({
    field: "lastReceivedAt",
    direction: "asc",
  });

  // `sources` is not read in here, and that is the point: the clock this screen measures
  // staleness against is taken once per load of the sources, not once per render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [sources]);

  const withHealth = useMemo(
    () =>
      sources.map((source) => ({
        source,
        health: sourceHealth(
          {
            lastReceivedAt: source.lastReceivedAt,
            expectedCadenceDays: source.expectedCadenceDays,
            createdAt: source.createdAt,
          },
          now
        ),
      })),
    [sources, now]
  );

  /**
   * The list, filtered and ordered.
   *
   * In the browser, and honestly so: `/api/rss-sources` has no `take` and no page, so this
   * array is every source there is. The health state is derived here too, so it could not
   * be ordered by the server without teaching the query what `sourceHealth` knows.
   *
   * "Silent longest" leads the options because that is the question this panel exists to
   * answer, and it was previously answerable only by reading every row.
   */
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = withHealth.filter(({ source, health }) => {
      if (statusFilter === "active" && !source.active) return false;
      if (statusFilter === "paused" && source.active) return false;
      if (statusFilter === "silent" && (!source.active || health.state === "ok")) {
        return false;
      }
      if (!query) return true;
      return (
        source.name.toLowerCase().includes(query) ||
        (source.senderAddress ?? "").toLowerCase().includes(query)
      );
    });

    return sortBy(
      filtered,
      (row) =>
        sort.field === "name"
          ? row.source.name
          : sort.field === "lastReceivedAt"
            ? (row.source.lastReceivedAt ?? null)
            : row.source.createdAt,
      sort.direction
    );
  }, [withHealth, search, statusFilter, sort]);


  /**
   * Change how a source's emails are read.
   *
   * Optimistic, and rolled back on failure rather than left hopeful: the chip is the only
   * place this value is visible, so a chip that says DIGEST over a source the server still
   * has as ESSAY is worse than no change at all.
   *
   * Nothing is reprocessed here. Emails already read keep the articles they produced; the
   * new mode applies to the next run, and the backlog is replayed from the sources screen
   * when that is what is wanted.
   */
  const setParseMode = useCallback(
    async (source: EmailSource, parseMode: "DIGEST" | "ESSAY") => {
      if (source.parseMode === parseMode) return;

      setSavingMode(source.id);
      const previous = source.parseMode;
      setSources((current) =>
        current.map((s) => (s.id === source.id ? { ...s, parseMode } : s))
      );

      try {
        const response = await fetch(`/api/rss-sources/${source.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parseMode }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error ?? "The parse mode could not be changed");
        }

        toast.success(
          parseMode === "DIGEST"
            ? `${source.name} will be read as a list of linked articles`
            : `${source.name} will be read as a single piece of writing`
        );
      } catch (error) {
        setSources((current) =>
          current.map((s) => (s.id === source.id ? { ...s, parseMode: previous } : s))
        );
        toast.error(
          error instanceof Error ? error.message : "The parse mode could not be changed"
        );
      } finally {
        setSavingMode(null);
      }
    },
    []
  );

  const toggleActive = useCallback(
    async (source: EmailSource) => {
      try {
        const response = await fetch(`/api/rss-sources/${source.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !source.active }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          toast.error(data?.error ?? "The source could not be updated");
          return;
        }

        setSources((current) =>
          current.map((s) => (s.id === source.id ? { ...s, active: !s.active } : s))
        );
        // An inactive source stops claiming its sender, so the panel changes with it.
        await loadUnknown();
      } catch {
        toast.error("The source could not be updated");
      }
    },
    [loadUnknown]
  );

  return (
    <div className="space-y-6">
      {/* ---- existing email sources ---- */}
      <div className="space-y-2">
        {/* The count moved to the tab row, so this label carries the action instead. Task 7
            of the plan folds the button into the shared filter bar. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>
            Email sources {!isLoading && <Num>{sources.length}</Num>}
          </SectionLabel>
          <button type="button" onClick={onAdd} className={radarButtonClass("accent", "sm")}>
            Add email source
          </button>
        </div>

        {/* Rendered whatever the list is doing, so a filter that matches nothing keeps the
            control that widens it. */}
        {sources.length > 1 && (
          <div className="flex flex-wrap items-center gap-2.5 pb-1">
            <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
              />
              <RadarInput
                type="search"
                aria-label="Search email sources"
                placeholder="Search by name or sender"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>

            <RadarSelect
              aria-label="Filter email sources"
              className="w-auto min-w-[160px]"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as SourceStatusFilter)
              }
            >
              {SOURCE_STATUS_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </RadarSelect>

            <SortSelect
              label="Sort email sources"
              options={SOURCE_SORT_OPTIONS}
              sort={sort}
              onChange={setSort}
            />
          </div>
        )}

        {isLoading && <SkeletonBar width="240px" />}

        {/* The failure itself is reported once, by the page, above the tab row. */}

        {!isLoading && !loadError && sources.length === 0 && (
          <p className="m-0 text-[12.5px] text-radar-ink3">
            No email sources yet. Any newsletter arriving at the inbound address is held
            unmatched until one exists.
          </p>
        )}

        {!isLoading && !loadError && sources.length > 0 && shown.length === 0 && (
          <p className="m-0 text-[12.5px] text-radar-ink3">
            None of the {sources.length} email sources match that. Widen the filter, or
            clear the search.
          </p>
        )}

        {shown.map(({ source, health }) => (
          <div
            key={source.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-radar-line bg-radar-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-radar-ink">
                  {source.name}
                </span>
                <StatusChip tone={source.active ? healthTone[health.state] : "neutral"}>
                  {source.active ? healthLabel[health.state] : "paused"}
                </StatusChip>
                {/*
                  Editable, because nothing infers it and getting it wrong is expensive.
                  It was chosen once in the creation form and then frozen: fourteen
                  sources here were set to ESSAY on the assumption that a Substack
                  address means a piece of writing, which is false for ThursdAI and for
                  every other digest that happens to publish on Substack. A digest read
                  as an essay yields one article that is the whole newsletter instead of
                  the fifteen it points at.
                */}
                {source.parseMode && (
                  <span
                    className="inline-flex overflow-hidden rounded-full border border-radar-line"
                    role="group"
                    aria-label={`Parse mode for ${source.name}`}
                  >
                    {(["DIGEST", "ESSAY"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={savingMode === source.id}
                        onClick={() => void setParseMode(source, mode)}
                        aria-pressed={source.parseMode === mode}
                        title={
                          mode === "DIGEST"
                            ? "This email lists articles published elsewhere"
                            : "This email is itself the article"
                        }
                        className={cn(
                          "px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50",
                          source.parseMode === mode
                            ? "bg-radar-surface2 text-radar-ink"
                            : "text-radar-ink3 hover:text-radar-ink"
                        )}
                      >
                        {mode.toLowerCase()}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              <p className="m-0 mt-0.5 truncate text-[11.5px] text-radar-ink3">
                {source.senderAddress}
                {source.inboundTag && ` · +${source.inboundTag}`}
                {source.expectedCadenceDays && ` · every ${source.expectedCadenceDays}d`}
                {" · "}
                {source.lastReceivedAt
                  ? `last received ${relativeTime(source.lastReceivedAt)}`
                  : "nothing received yet"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggleActive(source)}
              className={radarButtonClass("outline", "sm")}
            >
              {source.active ? "Pause" : "Resume"}
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}

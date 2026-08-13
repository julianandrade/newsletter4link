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
  unknown: UnknownSenderGroup[];
  unknownState: UnknownState;
  unknownMessage: string | null;
  unknownTruncated: boolean;
  /** Refetch the unclaimed senders, owned by the page. */
  reloadUnknown: () => Promise<void>;
}

export function EmailSourceManager({
  sources: incoming,
  isLoading,
  loadError,
  reload,
  unknown,
  unknownState,
  unknownMessage,
  unknownTruncated: truncated,
  reloadUnknown,
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
  const loadUnknown = reloadUnknown;

  const [draft, setDraft] = useState<NewSourceDraft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
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

  const warnings = useMemo(
    () =>
      withHealth
        .filter(({ source }) => source.active)
        .map(({ source, health }) => healthWarning(health, source.name))
        .filter((line): line is string => line !== null),
    [withHealth]
  );

  /** Pre-fill the form from a sender the mailbox has actually seen. */
  const promote = useCallback((group: UnknownSenderGroup) => {
    // The From header's display name when there is one, since it is the newsletter's own
    // name. The local part is the fallback, and a poor one: it turns "The Rundown AI"
    // into "News".
    const local = group.sender.split("@")[0] ?? group.sender;
    const fromLocal = local
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

    setDraft({
      ...emptyDraft,
      name: displayName(group.displayFrom) ?? fromLocal ?? group.sender,
      senderAddress: group.sender,
      inboundTag: group.tags[0] ?? "",
    });
    setFormOpen(true);

    // The form is above the panel, so a click at the bottom of a long list would otherwise
    // look like it did nothing.
    if (typeof document !== "undefined") {
      document
        .getElementById("email-source-form")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsCreating(true);

      try {
        const response = await fetch("/api/rss-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "EMAIL",
            name: draft.name,
            senderAddress: draft.senderAddress,
            inboundTag: draft.inboundTag || undefined,
            parseMode: draft.parseMode,
            expectedCadenceDays: draft.expectedCadenceDays || undefined,
            category: draft.category,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          toast.error(data?.error ?? `The source could not be created (${response.status})`);
          return;
        }

        const sender = draft.senderAddress.trim().toLowerCase();
        const held = unknown.find((group) => group.sender === sender);

        toast.success(`${data.name} is now a source for ${sender}`);
        setDraft(emptyDraft);
        setFormOpen(false);
        await loadSources();

        // Only worth offering when something is actually held. Requeueing is a separate
        // call so that creating a source without reprocessing stays possible.
        if (held && held.count > 0) {
          const requeue = await fetch("/api/inbound/unknown-senders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender }),
          });
          const requeueData = await requeue.json().catch(() => null);

          if (requeue.ok) toast.success(requeueData?.message ?? "Held emails requeued");
          else toast.error(requeueData?.error ?? "The held emails could not be requeued");
        }

        await loadUnknown();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The source could not be created"
        );
      } finally {
        setIsCreating(false);
      }
    },
    [draft, unknown, loadSources, loadUnknown]
  );

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
      {/* ---- health summary ---- */}
      {warnings.length > 0 && (
        <div className="radar-enter flex flex-wrap items-start gap-3 rounded-xl border border-radar-warn bg-radar-surface px-4 py-3">
          <span
            aria-hidden="true"
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-radar-warn"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="m-0 text-[12.5px] font-semibold text-radar-ink">
              {warnings.length} email {warnings.length === 1 ? "source needs" : "sources need"} a
              look
            </p>
            {warnings.map((line) => (
              <p key={line} className="m-0 text-[12.5px] text-radar-ink2">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ---- create ---- */}
      <div id="email-source-form">
        {!formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={radarButtonClass("accent")}
          >
            Add an email source
          </button>
        ) : (
          <form
            onSubmit={submit}
            className="radar-enter space-y-4 rounded-xl border border-radar-line bg-radar-surface p-4"
          >
            <div className="flex items-center justify-between">
              <SectionLabel>New email source</SectionLabel>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setDraft(emptyDraft);
                }}
                className={radarButtonClass("ghost", "sm")}
              >
                Cancel
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="es-name">Name</Label>
                <Input
                  id="es-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="TLDR AI"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="es-sender">Sender address</Label>
                <Input
                  id="es-sender"
                  type="email"
                  value={draft.senderAddress}
                  onChange={(e) => setDraft({ ...draft, senderAddress: e.target.value })}
                  placeholder="news@tldr.tech"
                  required
                />
                <p className="m-0 text-[11.5px] text-radar-ink3">
                  The address the newsletter sends <em>from</em>. This is the primary match
                  key, and it must be exact.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="es-tag">Inbound tag</Label>
                <Input
                  id="es-tag"
                  value={draft.inboundTag}
                  onChange={(e) => setDraft({ ...draft, inboundTag: e.target.value })}
                  placeholder="tldr"
                />
                <p className="m-0 text-[11.5px] text-radar-ink3">
                  Optional. The <code>+tag</code> used when subscribing, and the fallback if
                  the sender ever changes its address.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="es-cadence">Expected cadence (days)</Label>
                <Input
                  id="es-cadence"
                  type="number"
                  min={1}
                  max={365}
                  value={draft.expectedCadenceDays}
                  onChange={(e) =>
                    setDraft({ ...draft, expectedCadenceDays: e.target.value })
                  }
                  placeholder="7"
                />
                <p className="m-0 text-[11.5px] text-radar-ink3">
                  Optional, but without it silence cannot be judged and no warning will ever
                  fire for this source.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="es-category">Category</Label>
                <Input
                  id="es-category"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-radar-ink3">
                  Parse mode
                </span>
                <div className="flex gap-2">
                  {(
                    [
                      { value: "DIGEST", label: "Digest", hint: "many linked articles" },
                      { value: "ESSAY", label: "Essay", hint: "the email is the article" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraft({ ...draft, parseMode: option.value })}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
                        draft.parseMode === option.value
                          ? "border-radar-accent bg-radar-surface2"
                          : "border-radar-line hover:border-radar-ink3"
                      )}
                      aria-pressed={draft.parseMode === option.value}
                    >
                      <span className="block text-[12.5px] font-semibold text-radar-ink">
                        {option.label}
                      </span>
                      <span className="block text-[11.5px] text-radar-ink3">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating…" : "Create source"}
            </Button>
          </form>
        )}
      </div>

      {/* ---- existing email sources ---- */}
      <div className="space-y-2">
        <SectionLabel>
          Email sources {!isLoading && <Num>{sources.length}</Num>}
        </SectionLabel>

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

      {/* ---- unknown senders ---- */}
      <div className="space-y-2">
        <SectionLabel>
          Unknown senders{" "}
          {unknownState === "ready" && <Num>{unknown.length}</Num>}
        </SectionLabel>

        {unknownState === "loading" && <SkeletonBar width="240px" />}

        {unknownState === "forbidden" && (
          <p className="m-0 rounded-md border border-radar-line bg-radar-surface px-3 py-2 text-[12.5px] text-radar-ink2">
            {unknownMessage}
          </p>
        )}

        {unknownState === "error" && (
          <p className="m-0 rounded-md bg-radar-surface2 px-3 py-2 text-sm text-radar-err">
            {unknownMessage}
          </p>
        )}

        {unknownState === "ready" && (
          <>
            <p className="m-0 text-[11.5px] text-radar-ink3">
              Senders no active source claims, so their emails would be dropped if the ingest
              ran now. This view is platform-wide: inbound mail arrives at a shared address
              and belongs to no organization until a source claims it.
              {truncated && " Showing a sample, not the whole backlog."}
            </p>

            {unknown.length === 0 && (
              <p className="m-0 text-[12.5px] text-radar-ink3">
                Nothing unmatched. Every sender that has arrived has a source.
              </p>
            )}

            {unknown.map((group) => (
              <div
                key={group.sender}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-radar-line bg-radar-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-radar-ink">
                      {group.sender}
                    </span>
                    <StatusChip tone={group.alreadyIgnored ? "warn" : "neutral"}>
                      {group.count} {group.count === 1 ? "email" : "emails"}
                    </StatusChip>
                    {group.alreadyIgnored && (
                      <StatusChip tone="warn">already dropped</StatusChip>
                    )}
                    {group.tags.map((tag) => (
                      <StatusChip key={tag} tone="neutral">
                        +{tag}
                      </StatusChip>
                    ))}
                  </div>

                  {group.subjectSamples.length > 0 && (
                    <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
                      {group.subjectSamples.map((subject, index) => (
                        <li
                          key={`${group.sender}-${index}`}
                          className="truncate text-[11.5px] text-radar-ink3"
                        >
                          {subject}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="m-0 mt-1 text-[11.5px] text-radar-ink3">
                    last {relativeTime(group.lastSeenAt)} · first{" "}
                    {relativeTime(group.firstSeenAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => promote(group)}
                  className={radarButtonClass("accent", "sm")}
                >
                  Promote
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

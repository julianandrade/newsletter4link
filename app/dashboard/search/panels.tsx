"use client";

/**
 * Presentation for the Search screen's secondary views. The page owns every
 * fetch and all state; these render it in the AI Radar vocabulary and report
 * intent back through callbacks.
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Num,
  RadarButton,
  ScoreMeter,
  SectionLabel,
  SkeletonBar,
  SourceStamp,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";
import type { SearchHistoryItem, SearchResult, SearchTopic } from "./types";

const SCHEDULE_LABEL: Record<string, string> = {
  MANUAL: "on demand",
  DAILY: "daily",
  WEEKLY: "weekly",
};

/* ------------------------------------------------------------------ one result */

export function SearchResultRow({
  result,
  onImport,
  isImporting,
  isImported,
  compact = false,
}: {
  result: SearchResult;
  onImport: () => void;
  isImporting: boolean;
  isImported: boolean;
  compact?: boolean;
}) {
  return (
    <article
      className={cn(
        // Capped so the summary keeps a readable measure inside the wide panels.
        "flex max-w-[880px] flex-col gap-3 border-b border-radar-line2 transition-colors last:border-0 sm:flex-row sm:gap-5",
        compact ? "py-3.5" : "py-5",
        "hover:bg-radar-surface2"
      )}
    >
      <div className="min-w-0 flex-1">
        {/* The API's `source` is a bare host, so let the stamp derive the real name. */}
        <SourceStamp sourceUrl={result.url} publishedAt={result.publishedAt} />

        <h3
          className={cn(
            "font-editorial m-0 font-medium leading-[1.25] tracking-[-0.01em] text-radar-ink text-balance",
            compact ? "text-[15px]" : "text-[17px]"
          )}
        >
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-radar-ink no-underline hover:text-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
          >
            {result.title}
          </a>
        </h3>

        <p className="mt-2 mb-0 text-[13px] leading-[1.55] text-radar-ink2 text-pretty">
          {result.aiSummary || result.snippet}
        </p>

        {result.aiRelevanceNote && !compact && (
          <p className="mt-2 mb-0 text-[12px] leading-[1.5] text-radar-ink3 text-pretty">
            Why it scored: {result.aiRelevanceNote}
          </p>
        )}

        {(result.aiTopics.length > 0 || result.aiSentiment !== "neutral") && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.aiTopics.slice(0, compact ? 2 : 4).map((topic) => (
              <Tag key={topic}>{topic}</Tag>
            ))}
            {/* Neutral tone is the default, so it is only worth a chip when it isn't. */}
            {result.aiSentiment !== "neutral" && (
              <Tag>{result.aiSentiment} tone</Tag>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-row items-center justify-between gap-2.5 sm:w-[96px] sm:flex-col sm:items-end sm:justify-start">
        <ScoreMeter score={result.aiScore} />
        {isImported ? (
          <StatusChip tone="ok">Imported</StatusChip>
        ) : (
          <RadarButton size="sm" onClick={onImport} disabled={isImporting}>
            {isImporting ? "Importing…" : "Import"}
          </RadarButton>
        )}
      </div>
    </article>
  );
}

/** Loading placeholder shaped like the result rows it replaces. */
export function ResultSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading results</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="radar-skeleton flex gap-5 border-b border-radar-line2 py-5"
        >
          <div className="flex flex-1 flex-col gap-2.5">
            <SkeletonBar width={130} height={9} />
            <SkeletonBar width={`${88 - index * 8}%`} height={17} />
            <SkeletonBar width="100%" />
            <SkeletonBar width={`${64 + index * 6}%`} />
          </div>
          <div className="flex w-[96px] flex-col items-end gap-2">
            <SkeletonBar width={40} />
            <SkeletonBar width={62} height={18} className="rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ watchlists */

export function WatchlistsPanel({
  topics,
  isLoading,
  selected,
  onSelect,
  onRun,
  onDelete,
  onCreate,
  isRunning,
  isLoadingResults,
  results,
  importingUrl,
  importedUrls,
  onImport,
}: {
  topics: SearchTopic[];
  isLoading: boolean;
  selected: SearchTopic | null;
  onSelect: (topic: SearchTopic) => void;
  onRun: (topic: SearchTopic) => void;
  onDelete: (topicId: string) => void;
  onCreate: () => void;
  isRunning: boolean;
  isLoadingResults: boolean;
  results: SearchResult[];
  importingUrl: string | null;
  importedUrls: Set<string>;
  onImport: (result: SearchResult) => void;
}) {
  if (!isLoading && topics.length === 0) {
    return (
      <div className="radar-enter mx-auto max-w-[560px] py-16 text-center">
        <h2 className="font-editorial m-0 text-[25px] font-medium text-radar-ink">
          No watchlists yet
        </h2>
        <p className="mt-3 mb-6 text-[13.5px] text-radar-ink2 text-pretty">
          A watchlist is a question worth asking again: DORA enforcement, a
          competitor&rsquo;s launches, a regulation you are tracking. Save one and
          it can re-run on a schedule instead of waiting on you.
        </p>
        <RadarButton variant="accent" onClick={onCreate}>
          Create a watchlist
        </RadarButton>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[290px_minmax(0,1fr)]">
      <div>
        <div className="flex items-center justify-between border-b border-radar-line pb-2.5">
          <SectionLabel>Watchlists</SectionLabel>
          <RadarButton size="sm" onClick={onCreate}>
            New
          </RadarButton>
        </div>

        {isLoading ? (
          <div aria-busy="true" className="pt-3">
            <span className="sr-only">Loading watchlists</span>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="radar-skeleton flex flex-col gap-2 border-b border-radar-line2 py-3.5"
              >
                <SkeletonBar width={`${70 - index * 10}%`} height={14} />
                <SkeletonBar width={`${90 - index * 8}%`} />
              </div>
            ))}
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {topics.map((topic) => {
              const active = selected?.id === topic.id;

              return (
                <li
                  key={topic.id}
                  className={cn(
                    "flex items-start gap-1.5 border-b border-radar-line2 px-1.5 transition-colors",
                    active ? "bg-radar-surface2" : "hover:bg-radar-surface2"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(topic)}
                    aria-current={active ? "true" : undefined}
                    className="min-w-0 flex-1 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                  >
                    <span
                      className={cn(
                        "block truncate text-[13px] text-radar-ink",
                        active ? "font-semibold" : "font-medium"
                      )}
                    >
                      {topic.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-radar-ink3">
                      {topic.query}
                    </span>
                    <span className="mt-1.5 block text-[11px] text-radar-ink3">
                      {SCHEDULE_LABEL[topic.schedule] ?? topic.schedule.toLowerCase()}{" "}
                      · <Num>{topic.resultCount}</Num> kept ·{" "}
                      {topic.lastRunAt
                        ? `ran ${relativeTime(topic.lastRunAt)}`
                        : "never run"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(topic.id)}
                    className="mt-3 shrink-0 rounded px-1.5 py-0.5 text-[11px] text-radar-ink3 transition-colors hover:text-radar-err focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                  >
                    Delete
                    <span className="sr-only"> watchlist {topic.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        {selected ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-radar-line pb-3.5">
              <div className="min-w-0">
                <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-radar-ink">
                  {selected.name}
                </h2>
                <p className="mt-1 mb-0 max-w-[68ch] text-[12.5px] text-radar-ink2 text-pretty">
                  {selected.query}
                </p>
              </div>
              <RadarButton
                variant="accent"
                onClick={() => onRun(selected)}
                disabled={isRunning}
              >
                {isRunning ? "Searching…" : "Run now"}
              </RadarButton>
            </div>

            {isRunning || isLoadingResults ? (
              <ResultSkeleton rows={3} />
            ) : results.length > 0 ? (
              <div>
                <SectionLabel className="pt-4 pb-1">
                  {results.length} {results.length === 1 ? "result" : "results"} kept
                  {selected.lastRunAt
                    ? `, last run ${relativeTime(selected.lastRunAt)}`
                    : ""}
                </SectionLabel>
                {results.map((result, index) => (
                  <SearchResultRow
                    key={`${result.url}-${index}`}
                    result={result}
                    onImport={() => onImport(result)}
                    isImporting={importingUrl === result.url}
                    isImported={importedUrls.has(result.url)}
                    compact
                  />
                ))}
              </div>
            ) : (
              <p className="m-0 mt-5 rounded-xl border border-dashed border-radar-line px-4 py-10 text-center text-[12.5px] text-radar-ink3">
                {selected.lastRunAt
                  ? "The last run kept nothing. Run it again or widen the question."
                  : "This watchlist has not run yet. Run it now to see what the web returns."}
              </p>
            )}
          </>
        ) : (
          <p className="m-0 rounded-xl border border-dashed border-radar-line px-4 py-16 text-center text-[12.5px] text-radar-ink3">
            Pick a watchlist to see what its last run kept.
          </p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- history */

export function HistoryPanel({
  items,
  isLoading,
  page,
  totalPages,
  onPage,
  expandedId,
  onToggle,
  loadingResultsId,
  convertingId,
  onConvert,
  deletingId,
  onRequestDelete,
  importingUrl,
  importedUrls,
  onImport,
}: {
  items: SearchHistoryItem[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  expandedId: string | null;
  onToggle: (id: string) => void;
  loadingResultsId: string | null;
  convertingId: string | null;
  onConvert: (id: string) => void;
  deletingId: string | null;
  onRequestDelete: (id: string) => void;
  importingUrl: string | null;
  importedUrls: Set<string>;
  onImport: (result: SearchResult) => void;
}) {
  if (isLoading) {
    return (
      <div className="border-t border-radar-line" aria-busy="true">
        <span className="sr-only">Loading saved searches</span>
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="radar-skeleton flex flex-col gap-2 border-b border-radar-line2 py-4"
          >
            <SkeletonBar width={`${58 + index * 7}%`} height={15} />
            <SkeletonBar width={`${36 + index * 5}%`} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="radar-enter mx-auto max-w-[560px] py-16 text-center">
        <h2 className="font-editorial m-0 text-[25px] font-medium text-radar-ink">
          Nothing saved yet
        </h2>
        <p className="mt-3 mb-0 text-[13.5px] text-radar-ink2 text-pretty">
          Run a search, then save it. Saved searches keep their scored results, so
          you can come back to what the web said at the time instead of paying to
          ask again.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-radar-line">
        {items.map((item) => {
          const expanded = expandedId === item.id;

          return (
            <div key={item.id} className="border-b border-radar-line2">
              <div className="flex items-start gap-3 py-4">
                <button
                  type="button"
                  onClick={() => onToggle(item.id)}
                  aria-expanded={expanded}
                  className="mt-px shrink-0 rounded p-1 text-radar-ink3 transition-colors hover:bg-radar-surface2 hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                  )}
                  <span className="sr-only">
                    {expanded ? "Hide" : "Show"} results for {item.query}
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[13.5px] font-medium text-radar-ink text-pretty">
                    {item.query}
                  </p>
                  <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3">
                    <Num>{item.resultCount}</Num>{" "}
                    {item.resultCount === 1 ? "result" : "results"} ·{" "}
                    <time
                      dateTime={item.searchedAt}
                      title={new Date(item.searchedAt).toLocaleString("en-GB")}
                    >
                      {relativeTime(item.searchedAt)}
                    </time>
                    {loadingResultsId === item.id && " · loading results…"}
                  </p>

                  {item.queryAnalysis && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Tag>{item.queryAnalysis.intent}</Tag>
                      {item.queryAnalysis.topics?.slice(0, 3).map((topic) => (
                        <Tag key={topic}>{topic}</Tag>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.convertedToTopicId ? (
                    <StatusChip tone="info">Watchlist</StatusChip>
                  ) : (
                    <RadarButton
                      size="sm"
                      onClick={() => onConvert(item.id)}
                      disabled={convertingId === item.id}
                    >
                      {convertingId === item.id ? "Saving…" : "Make watchlist"}
                    </RadarButton>
                  )}
                  <button
                    type="button"
                    onClick={() => onRequestDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="rounded px-1.5 py-0.5 text-[11px] text-radar-ink3 transition-colors hover:text-radar-err focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent disabled:opacity-55"
                  >
                    {deletingId === item.id ? "Deleting…" : "Delete"}
                    <span className="sr-only"> saved search {item.query}</span>
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="border-t border-radar-line2 pb-4 pl-9">
                  {item.results && item.results.length > 0 ? (
                    <>
                      {item.results.slice(0, 5).map((result, index) => (
                        <SearchResultRow
                          key={`${result.url}-${index}`}
                          result={result}
                          onImport={() => onImport(result)}
                          isImporting={importingUrl === result.url}
                          isImported={importedUrls.has(result.url)}
                          compact
                        />
                      ))}
                      {item.results.length > 5 && (
                        <p className="m-0 pt-3 text-[12px] text-radar-ink3">
                          {item.results.length - 5} more results were kept with this
                          search.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="m-0 pt-4 text-[12.5px] text-radar-ink3">
                      This search was saved without its results.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <RadarButton
            size="sm"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </RadarButton>
          <SectionLabel>
            Page {page} of {totalPages}
          </SectionLabel>
          <RadarButton
            size="sm"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </RadarButton>
        </div>
      )}
    </>
  );
}

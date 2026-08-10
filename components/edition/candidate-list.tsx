"use client";

/**
 * What may still go into an edition, filtered, selectable, and honest about how much
 * of it you are looking at.
 *
 * One component for both surfaces. The proposal screen wraps it in a dialog and the
 * edition builder embeds it inline, but the list, the filters and the selection are
 * the same code in both, which is the level the two had drifted at: they disagreed on
 * whether rows had checkboxes, on which pool they read, and on whether stories already
 * used in another edition were offered.
 *
 * Three things it deliberately does not own:
 *
 * - **Persistence.** `onAdd` hands the chosen rows back and the host decides. The
 *   builder stages into a dirty flag and waits for Save Draft; the proposal writes
 *   through immediately. Neither model belongs in a list.
 * - **Ordering.** Position within an edition is `EditionOrderList`'s job. Choosing and
 *   arranging are different tasks and putting them in one widget is what gave the
 *   builder a 128-row pool in half a screen.
 * - **Filtering and sorting.** Both run in the database, because the pool is capped.
 *   Narrowing fifty rows in the browser when a hundred and twenty-eight match narrows
 *   the wrong set and then reports the wrong count for it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArticleFiltersComponent,
  buildArticleQueryString,
  defaultArticleFilters,
  hasArticleFilters,
  type ArticleFilters,
} from "@/components/article-filters";
import {
  FilterPill,
  Num,
  ScoreMeter,
  SectionLabel,
  SourceStamp,
} from "@/components/radar/primitives";
import { POOL_RECENT_DAYS, recentWindowFrom } from "@/lib/articles/date";
import {
  Callout,
  EmptyNote,
  LoadError,
  SkeletonRows,
} from "@/components/radar/controls";
import {
  BulkBar,
  SelectCheckbox,
  useSelection,
  type BulkAction as BulkBarAction,
} from "@/components/radar/selection";
import { useOrgRole } from "@/components/radar/use-role";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadarButton } from "@/components/radar/primitives";
import { bulkActionDescriptors } from "@/lib/articles/list-filter";
import type { BulkAction } from "@/lib/articles/bulk-action";
import { cn } from "@/lib/utils";
import type { ProposalArticle, ProposalProject } from "@/components/proposal/state";

/**
 * Mirrors `CANDIDATE_POOL_MAX`, which the route clamps to anyway.
 *
 * Copied rather than imported: `lib/editions/proposal.ts` is a server module, and
 * pulling it in for one number would carry the whole assembler into the client bundle.
 * The route is the authority, so a drift here costs a smaller page, never a wrong one.
 */
const POOL_PAGE = 100;

/** Only the two that take something out of the pool. Approve and reset belong to the queue. */
const POOL_VERDICTS: BulkAction[] = ["reject", "discard"];

const VERDICT_COPY: Record<
  string,
  { label: string; running: string; title: string; body: string }
> = {
  reject: {
    label: "Reject",
    running: "Rejecting…",
    title: "Reject",
    body: "They leave the pool and will not appear in any edition. Rejecting is reversible from the All articles screen, but check the selection before confirming rather than after.",
  },
  discard: {
    label: "Discard",
    running: "Discarding…",
    title: "Discard",
    body: "They leave every list, including the queue, and are pulled out of any edition that has not been sent. Collection will not bring them back. Restore is on the All articles screen under Discarded.",
  },
};

export interface CandidateListProps {
  /** Which pools to show. The builder scopes to one; the proposal shows both. */
  sections: ("articles" | "projects")[];
  onAdd: (
    articles: ProposalArticle[],
    projects: ProposalProject[]
  ) => Promise<void> | void;
  /**
   * Ids the host is already holding. The builder passes its staged selection, which
   * is not in the edition yet and would otherwise be offered a second time.
   */
  excludeIds?: string[];
  /** The host is mid-write. Disables the bar rather than letting a second one start. */
  busy?: boolean;
  /** The action bar cannot be viewport-sticky inside a dialog. */
  barClassName?: string;
  className?: string;
}

interface Pool {
  articles: ProposalArticle[];
  projects: ProposalProject[];
  /** How many match the current filter. */
  articleTotal: number;
  /** How many could be added at all, whatever the filter. */
  eligibleTotal: number;
  categories: string[];
}

const EMPTY_POOL: Pool = {
  articles: [],
  projects: [],
  articleTotal: 0,
  eligibleTotal: 0,
  categories: [],
};

export function CandidateList({
  sections,
  onAdd,
  excludeIds,
  busy,
  barClassName,
  className,
}: CandidateListProps) {
  const showArticles = sections.includes("articles");
  const showProjects = sections.includes("projects");

  const [filters, setFilters] = useState<ArticleFilters>(defaultArticleFilters);
  /**
   * The pool opens on the last two months.
   *
   * News decays, so an approved story nobody used in eight weeks is almost never what
   * an editor is hunting for, and left in the default view a hundred expired
   * candidates compete for attention with the twenty live ones. It is a pill rather
   * than a hidden default: it can be switched off in one click, and the count line
   * below says how many it is holding back. A cap you cannot see is the bug this
   * component was written to remove.
   */
  const [recentOnly, setRecentOnly] = useState(true);
  const [pool, setPool] = useState<Pool>(EMPTY_POOL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingVerdict, setPendingVerdict] = useState<{
    action: BulkAction;
    ids: string[];
  } | null>(null);

  const { atLeast } = useOrgRole();
  const canEdit = atLeast("EDITOR");

  /**
   * Compared by value, so a host that rebuilds the array on every render does not
   * refetch on every render.
   */
  const excludeKey = (excludeIds ?? []).join(",");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(buildArticleQueryString(filters));
      params.set("limit", String(POOL_PAGE));
      if (excludeKey) params.set("exclude", excludeKey);

      /**
       * The window is resolved here rather than in render, deliberately.
       *
       * `load` only ever runs in an effect, so the date is computed on the client and
       * nowhere else. Computed during render, or in a lazy `useState` initialiser, it
       * would be evaluated once on the server for the initial HTML and again on the
       * client, and the two can disagree across midnight: a hydration mismatch for a
       * value that only ever feeds a query string.
       *
       * An explicit range the editor typed always wins. Sending both would AND them,
       * which silently narrows what they asked for.
       */
      if (recentOnly && !filters.dateFrom) {
        params.set("dateFrom", recentWindowFrom(new Date()));
      }

      const res = await fetch(`/api/editions/proposal/candidates?${params}`);
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error || `The candidate pool request failed (${res.status})`
        );
      }

      setPool({
        articles: json.data?.articles ?? [],
        projects: json.data?.projects ?? [],
        articleTotal: json.data?.articleTotal ?? 0,
        eligibleTotal: json.data?.eligibleTotal ?? 0,
        categories: json.data?.categories ?? [],
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load what is waiting for an edition"
      );
    } finally {
      setLoading(false);
    }
  }, [filters, excludeKey, recentOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const articles = showArticles ? pool.articles : [];
  const projects = showProjects ? pool.projects : [];

  /**
   * Ids in render order, which is what makes a shift-click range follow what is on
   * screen rather than what the server happened to return.
   */
  const visibleIds = useMemo(
    () => [...articles.map((a) => a.id), ...projects.map((p) => p.id)],
    [articles, projects]
  );

  const selection = useSelection(visibleIds);

  const chosenArticles = articles.filter((a) => selection.isSelected(a.id));
  const chosenProjects = projects.filter((p) => selection.isSelected(p.id));
  const chosenTotal = chosenArticles.length + chosenProjects.length;

  const runVerdict = async (action: BulkAction, ids: string[]) => {
    setBulkBusy(action);
    setNotice(null);

    try {
      const res = await fetch("/api/articles/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `That did not go through (${res.status})`);
      }

      // Report what happened rather than what was asked: a bulk write that affects
      // fewer rows than selected is the failure mode worth seeing.
      const affected = json.data?.affected ?? ids.length;
      setNotice(
        `${affected} ${affected === 1 ? "story" : "stories"} ${action === "reject" ? "rejected" : "discarded"}.`
      );
      selection.clear();
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That did not go through"
      );
    } finally {
      setBulkBusy(null);
    }
  };

  const actions: BulkBarAction[] = [
    {
      id: "add",
      label: `Add ${chosenTotal}`,
      /**
       * No refetch here. Both hosts report what they now hold through `excludeIds`,
       * and that change refires the load below, so asking for the pool again would
       * be a second request for the same answer. A failed add leaves `excludeIds`
       * alone, which is also right: the rows should stay offered.
       */
      onRun: async () => {
        setBulkBusy("add");
        try {
          await onAdd(chosenArticles, chosenProjects);
          selection.clear();
        } finally {
          setBulkBusy(null);
        }
      },
    },
    // Verdicts act on stories only, so they are offered only when the selection holds
    // one. Derived from `bulkActionDescriptors` rather than hardcoded, so the confirm
    // rule and the VIEWER rule stay in the one place that owns them.
    ...(chosenArticles.length > 0
      ? bulkActionDescriptors("approved", canEdit)
          .filter((descriptor) => POOL_VERDICTS.includes(descriptor.id))
          .map((descriptor) => ({
            id: descriptor.id,
            label: VERDICT_COPY[descriptor.id].label,
            destructive: true,
            onRun: () => {
              const ids = chosenArticles.map((a) => a.id);
              if (descriptor.confirms) {
                setPendingVerdict({ action: descriptor.id, ids });
              } else {
                void runVerdict(descriptor.id, ids);
              }
            },
          }))
      : []),
  ];

  const filtered = hasArticleFilters(filters);
  const nothingAtAll = articles.length === 0 && projects.length === 0;

  const renderArticleRow = (article: ProposalArticle) => (
    <label
      key={article.id}
      className={cn(
        "flex cursor-pointer items-start gap-3 border-b border-radar-line2 px-1 py-3 transition-colors",
        selection.isSelected(article.id)
          ? "bg-radar-surface2"
          : "hover:bg-radar-surface2"
      )}
    >
      <SelectCheckbox
        checked={selection.isSelected(article.id)}
        onToggle={(modifiers) => selection.toggle(article.id, modifiers)}
        label={`Select ${article.title}`}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <SourceStamp
          sourceUrl={article.sourceUrl}
          publishedAt={article.publishedAt}
          capturedAt={article.capturedAt}
        />
        <span className="font-editorial block text-[14.5px] leading-[1.3] text-radar-ink text-pretty">
          {article.title}
        </span>
        {article.category.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {article.category.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-radar-line2 bg-radar-surface2 px-2 py-0.5 text-[11px] text-radar-ink2"
              >
                {topic}
              </span>
            ))}
          </span>
        )}
      </span>
      <ScoreMeter score={article.relevanceScore} className="shrink-0" />
    </label>
  );

  const renderProjectRow = (project: ProposalProject) => (
    <label
      key={project.id}
      className={cn(
        "flex cursor-pointer items-start gap-3 border-b border-radar-line2 px-1 py-3 transition-colors",
        selection.isSelected(project.id)
          ? "bg-radar-surface2"
          : "hover:bg-radar-surface2"
      )}
    >
      <SelectCheckbox
        checked={selection.isSelected(project.id)}
        onToggle={(modifiers) => selection.toggle(project.id, modifiers)}
        label={`Select ${project.name}`}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-radar-ink3">
          {project.team}
        </span>
        <span className="font-editorial block text-[14.5px] leading-[1.3] text-radar-ink text-pretty">
          {project.name}
        </span>
      </span>
    </label>
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showArticles && (
        <div className="flex flex-col gap-2.5">
          <ArticleFiltersComponent
            filters={filters}
            onChange={setFilters}
            availableCategories={pool.categories}
          />
          {/*
            Disabled rather than hidden when an explicit range is set: the window is
            still the default, it has just been superseded by something the editor
            typed, and a control that vanishes teaches less than one that greys out.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {/*
              The × when it is on, borrowed from the "Filtered to" chips in
              article-filters.tsx, which is this codebase's shape for "applied, click
              to remove". FilterPill's own active state is a border tint, which reads
              on a row of topic pills where the unpressed ones sit beside it for
              comparison. This pill starts pressed and stands alone, so there is
              nothing to compare it against and the tint alone says nothing.
            */}
            <FilterPill
              active={recentOnly && !filters.dateFrom}
              disabled={Boolean(filters.dateFrom)}
              onClick={() => setRecentOnly((previous) => !previous)}
              className={
                filters.dateFrom ? "cursor-not-allowed opacity-50" : undefined
              }
            >
              Last {POOL_RECENT_DAYS} days
              {recentOnly && !filters.dateFrom && (
                <>
                  <span aria-hidden="true" className="text-radar-ink3">
                    ×
                  </span>
                  <span className="sr-only">
                    , applied. Activate to include older stories.
                  </span>
                </>
              )}
            </FilterPill>
            {filters.dateFrom && (
              <span className="text-[11.5px] text-radar-ink3">
                superseded by the range you set
              </span>
            )}
          </div>
        </div>
      )}

      {notice && <Callout tone="ok" title={notice} live />}

      {error && (
        <LoadError
          what="The candidate pool"
          message={error}
          onRetry={() => void load()}
        />
      )}

      {loading && !error && <SkeletonRows rows={5} />}

      {/*
        Decided on `eligibleTotal` rather than on `hasArticleFilters`, which does not
        know about the recency window. With the window on and nothing recent, the old
        test said "Nothing is waiting" while a hundred and twenty-eight sat behind it.
        If anything is available at all, an empty list is a filter result, whichever
        filter did it.
      */}
      {!loading && !error && nothingAtAll && (
        <EmptyNote>
          {showArticles && pool.eligibleTotal > 0 ? (
            <>
              Nothing matches. <Num>{pool.eligibleTotal}</Num> approved and waiting
              outside these filters: switch off Last {POOL_RECENT_DAYS} days, widen
              the score range, or clear a topic.
            </>
          ) : filtered ? (
            "Nothing waiting matches those filters. Widen the score range or clear a topic."
          ) : (
            "Nothing is waiting. Approve a story in the queue and it appears here."
          )}
        </EmptyNote>
      )}

      {!loading && !error && !nothingAtAll && (
        <>
          {/*
            Select-all strip. "All" means every row on screen, never every row in the
            database, and the count beside it is the count the buttons will act on.
          */}
          <div className="flex flex-wrap items-center gap-3 border-b border-radar-line pb-2.5">
            <SelectCheckbox
              checked={selection.allSelected}
              indeterminate={selection.partiallySelected}
              onToggle={() =>
                selection.allSelected ? selection.clear() : selection.selectAll()
              }
              label={
                selection.allSelected
                  ? "Clear selection"
                  : `Select all ${visibleIds.length} rows on screen`
              }
            />
            <span className="text-[12.5px] text-radar-ink2">
              {selection.count > 0
                ? `${selection.count} of ${visibleIds.length} selected`
                : `Select all ${visibleIds.length}`}
            </span>
            <span className="ml-auto text-[11.5px] text-radar-ink3">
              Shift-click to select a range · Esc to clear
            </span>
          </div>

          {showArticles && articles.length > 0 && (
            <div>{articles.map(renderArticleRow)}</div>
          )}

          {showProjects && projects.length > 0 && (
            <div className={cn(showArticles && articles.length > 0 && "mt-4")}>
              <SectionLabel className="mb-2">Projects</SectionLabel>
              <div className="border-t border-radar-line">
                {projects.map(renderProjectRow)}
              </div>
            </div>
          )}

          {/*
            The cap, said out loud. `articleTotal` counts everything that matches the
            filter; the rows are the first page of it. Without this line the two are
            indistinguishable, and "select all visible" quietly means "select the
            first hundred".
          */}
          {/*
            Three numbers, because any two of them can mislead. The rows on screen,
            what the filter matched, and what is waiting in total: without the last,
            a default recency window reads as "that is everything there is", which is
            the same lie the old `take: 50` told.
          */}
          {showArticles && (
            <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3">
              Showing <Num>{articles.length}</Num> of{" "}
              <Num>{pool.articleTotal}</Num>{" "}
              {pool.articleTotal === pool.eligibleTotal ? "waiting" : "that match"}
              {pool.articleTotal > articles.length &&
                " · narrow the filters to reach the rest"}
              {pool.eligibleTotal > pool.articleTotal && (
                <>
                  {" · "}
                  <Num>{pool.eligibleTotal}</Num> approved and waiting in all
                </>
              )}
            </p>
          )}
        </>
      )}

      {/*
        The noun follows the sections on screen. "2 items" is what a list says when it
        does not know what it is holding, and here it always does: the builder scopes
        to one kind per tab, and only the proposal dialog shows both at once.
      */}
      <BulkBar
        selection={selection}
        actions={actions}
        noun={showArticles && showProjects ? "item" : showProjects ? "project" : "story"}
        nounPlural={
          showArticles && showProjects
            ? "items"
            : showProjects
              ? "projects"
              : "stories"
        }
        busyAction={busy ? "add" : bulkBusy}
        className={barClassName}
      />

      <Dialog
        open={pendingVerdict !== null}
        onOpenChange={(open) => !open && setPendingVerdict(null)}
      >
        <DialogContent>
          {pendingVerdict && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {VERDICT_COPY[pendingVerdict.action].title}{" "}
                  {pendingVerdict.ids.length}{" "}
                  {pendingVerdict.ids.length === 1 ? "story" : "stories"}?
                </DialogTitle>
                <DialogDescription>
                  {VERDICT_COPY[pendingVerdict.action].body}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <RadarButton
                  variant="outline"
                  onClick={() => setPendingVerdict(null)}
                >
                  Cancel
                </RadarButton>
                <RadarButton
                  variant="accent"
                  disabled={bulkBusy !== null}
                  onClick={() => {
                    const { action, ids } = pendingVerdict;
                    setPendingVerdict(null);
                    void runVerdict(action, ids);
                  }}
                >
                  {bulkBusy === pendingVerdict.action
                    ? VERDICT_COPY[pendingVerdict.action].running
                    : `${VERDICT_COPY[pendingVerdict.action].title} ${pendingVerdict.ids.length}`}
                </RadarButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

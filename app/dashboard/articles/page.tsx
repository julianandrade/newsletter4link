"use client";

/**
 * Every article, in every state.
 *
 * The product listed pending articles and approved articles, and nothing else. A REJECTED
 * article was not reachable from any screen, and a discarded one is excluded from every
 * list by `lib/db/tenant.ts`, so neither verdict could be undone from anywhere. This screen
 * is the one place that shows all of them, which is what makes Task 2's `reset` and
 * `restore` reachable by a person rather than only by a request.
 *
 * The shape is `components/proposal/queue-view.tsx`: the same selection bar, the same
 * `BulkBar` wiring and the same confirmation in front of a bulk removal. What differs is
 * deliberate and noted where it happens.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArticleListRow,
  type ListArticle,
} from "@/components/article/article-list-row";
import {
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
} from "@/components/radar/primitives";
import {
  EmptyState,
  LoadError,
  Pagination,
  RadarInput,
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
  bulkActionsForFilter,
  type ArticleListState,
} from "@/lib/articles/list-filter";
import type { BulkAction } from "@/lib/articles/bulk-action";

const FILTERS: { value: ArticleListState; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Awaiting a decision" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "discarded", label: "Discarded" },
];

/** Present tense, for the button. Same wording as the per-row controls. */
const BULK_LABELS: Record<BulkAction, string> = {
  approve: "Approve",
  reject: "Reject",
  reset: "Back to the queue",
  discard: "Discard",
  restore: "Restore",
};

/** Past tense, for reporting what a finished bulk action did. */
const BULK_DONE: Record<BulkAction, string> = {
  approve: "approved",
  reject: "rejected",
  reset: "back in the queue",
  discard: "discarded",
  restore: "restored",
};

/**
 * What a filter finds when it finds nothing, in its own words.
 *
 * "No results" would be true of all five and useful in none of them: an empty Discarded is
 * good news, an empty Rejected says the queue has not been worked, and an empty All means
 * collection has never run.
 */
const EMPTY_COPY: Record<ArticleListState, { title: string; body: string }> = {
  all: {
    title: "No articles yet",
    body: "Collection has not brought anything in, or everything it found has been discarded. Discarded stories have their own filter above.",
  },
  pending: {
    title: "Nothing is waiting on you",
    body: "Every story collected so far has a verdict. The next collection run will fill this back up.",
  },
  approved: {
    title: "Nothing is approved yet",
    body: "Approving a story from the queue puts it in the pool an edition draws from.",
  },
  rejected: {
    title: "Nothing has been rejected",
    body: "A rejected story lands here, and can be approved or sent back to the queue from this screen.",
  },
  discarded: {
    title: "Nothing has been discarded",
    body: "Discarding takes a story out of every other list without deleting it, so it can be restored with the verdict it had.",
  },
};

export default function AllArticlesPage() {
  const { atLeast } = useOrgRole();
  const canEdit = atLeast("EDITOR");

  const [state, setState] = useState<ArticleListState>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);

  const [articles, setArticles] = useState<ListArticle[]>([]);
  /**
   * The population under the current filter, from the server, not `articles.length`.
   *
   * The two are different whenever the filter holds more than one page, and presenting the
   * page size as the count is what let a screen say "200 stories" over a filter holding 340,
   * with no route to the rest.
   */
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  /** Set only by the two actions that ask first. Carries which one, so one dialog serves both. */
  const [pendingBulk, setPendingBulk] = useState<{
    action: "reject" | "discard";
    ids: string[];
  } | null>(null);

  // Typing is not a query. The list reloads a beat after the last keystroke.
  //
  // The page goes back to one in the same batch, rather than in an effect watching `search`:
  // a new search is a new population, so page 4 of the old one means nothing, and doing it
  // here means React commits both changes together and `load` runs once instead of twice.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /**
   * Sequence number for the in-flight request.
   *
   * Changing filter while a search is still resolving is ordinary here, and responses can
   * land out of order. Without this the slower, older answer wins and the list disagrees
   * with the filter that is lit.
   */
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);

    try {
      const params = new URLSearchParams({ state, page: String(page) });
      if (search) params.set("search", search);

      const response = await fetch(`/api/articles?${params.toString()}`);
      const json = await response.json().catch(() => null);

      if (seq !== requestSeq.current) return;

      if (!response.ok || !json?.success) {
        setError(
          json?.error ?? `The request came back with status ${response.status}.`
        );
        return;
      }

      setArticles(json.data as ListArticle[]);
      setTotal(json.total as number);
      setPageSize(json.pageSize as number);
      setError(null);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      setError(cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [state, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // A page can empty out underneath you: discarding everything on the last page leaves the
  // reader past the end of a filter that still has rows, looking at an empty state that is
  // not true. Page one is always valid, so that is where it goes.
  useEffect(() => {
    if (!loading && !error && articles.length === 0 && page > 1) setPage(1);
  }, [loading, error, articles.length, page]);

  /** Ids in render order, so shift-click ranges follow what is on screen. */
  const selection = useSelection(articles.map((article) => article.id));

  /**
   * One request shape for all five actions, the same `PATCH /api/articles/bulk` the
   * per-row controls use, so a selection of one and a selection of two hundred cannot
   * drift apart.
   *
   * The outcome is reported from `affected` and `skipped`, never from the requested count:
   * every action carries a guard, so asking to approve forty stories of which twelve were
   * already decided approves twenty-eight, and saying "40 approved" would be a lie.
   */
  const runBulk = useCallback(
    async (action: BulkAction, ids: string[]) => {
      setBulkBusy(action);

      try {
        const response = await fetch("/api/articles/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ids }),
        });
        const json = await response.json().catch(() => null);

        if (!response.ok || !json?.success) {
          throw new Error(json?.error || `Could not ${action} those stories`);
        }

        const affected = json.affected as number;
        const skipped = json.skipped as number;

        if (affected === 0) {
          toast.info(
            `Nothing changed. All ${skipped} were already in that state, or somebody else decided them first.`
          );
        } else {
          const parts = [
            `${affected} ${affected === 1 ? "story" : "stories"} ${BULK_DONE[action]}`,
          ];
          if (skipped > 0) parts.push(`${skipped} left as they were`);
          if (json.detachedFrom > 0) {
            parts.push(
              `out of ${json.detachedFrom} open ${
                json.detachedFrom === 1 ? "edition" : "editions"
              }`
            );
          }
          toast.success(parts.join(", "));
        }

        selection.clear();
        await load();
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : `Could not ${action} those stories`
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [load, selection]
  );

  /**
   * The bar's actions, derived from the filter rather than fixed at five.
   *
   * `bulkActionsForFilter` is the per-filter twin of `nextActionsFor`, and it exists because
   * the fixed list offered actions that could not do anything: on Discarded, approve, reject,
   * reset and discard all match nothing, so pressing Discard on forty stories produced a
   * confirmation dialog and then "Nothing changed".
   *
   * Reject and Discard ask first; Approve, Back to the queue and Restore do not. The
   * asymmetry is on the record. Bulk reject shipped without a confirmation and 23 curated
   * stories were lost to one click. The three that are not guarded either move work forward
   * or put something back, and all three are undoable from this very screen.
   */
  const bulkActions: BulkBarAction[] = canEdit
    ? bulkActionsForFilter(state).map((action) => ({
        id: action,
        label: BULK_LABELS[action],
        destructive: action === "reject" || action === "discard",
        onRun: (ids: string[]) => {
          if (action === "reject" || action === "discard") {
            setPendingBulk({ action, ids });
          } else {
            void runBulk(action, ids);
          }
        },
      }))
    : [];

  const renderRows = () => (
    <div className="border-t border-radar-line">
      {articles.map((article) => (
        <ArticleListRow
          key={article.id}
          article={article}
          selected={selection.isSelected(article.id)}
          onToggleSelected={(modifiers) => selection.toggle(article.id, modifiers)}
          canEdit={canEdit}
          onChanged={() => void load()}
        />
      ))}
    </div>
  );

  const empty = EMPTY_COPY[state];
  const hasSearch = search.length > 0;

  /**
   * Everything the screen is allowed to say about size, in one place.
   *
   * `total` is the population under the filter and `articles.length` is this page of it.
   * Every label below picks the right one deliberately: a select-all that says "all" when it
   * means "the 200 of 340 currently on screen" is a trap, and it is the same trap as a
   * subtitle claiming a page size is a count.
   */
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  const paged = totalPages > 1;
  const selectAllLabel = paged
    ? `Select the ${articles.length} stories on this page, of ${total}`
    : `Select all ${articles.length} stories`;

  return (
    <>
      <AppHeader />

      <RadarMain width="1080px">
        <PageHeading
          eyebrow="Articles"
          title="Everything collected, whatever state it is in"
          subtitle={
            loading && articles.length === 0 ? (
              "Reading the archive."
            ) : (
              <>
                <Num>{total}</Num> {total === 1 ? "story" : "stories"} under this filter
                {paged && (
                  <>
                    , showing <Num>{articles.length}</Num> on page <Num>{page}</Num> of{" "}
                    <Num>{totalPages}</Num>
                  </>
                )}
                . A verdict here is reversible: rejecting, resetting and discarding all
                have a way back.
              </>
            )
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          {/*
            A group with a name, not five loose toggles. Read one at a time, "Rejected,
            pressed" says nothing about what the other four are or that picking one unpicks
            the rest; the group label is what makes the set legible.
          */}
          <div
            role="group"
            aria-label="Filter by state"
            className="flex flex-wrap items-center gap-2"
          >
            {FILTERS.map((filter) => (
              <RadarButton
                key={filter.value}
                size="sm"
                variant={state === filter.value ? "accent" : "outline"}
                aria-pressed={state === filter.value}
                onClick={() => {
                  setState(filter.value);
                  // A new filter is a new population; page 4 of the old one means nothing.
                  setPage(1);
                }}
              >
                {filter.label}
              </RadarButton>
            ))}
          </div>

          <div className="ml-auto w-full sm:w-[260px]">
            <RadarInput
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search titles and summaries"
              aria-label="Search article titles and summaries"
            />
          </div>
        </div>

        <div className="mt-5">
          {error && <LoadError what="The articles" message={error} onRetry={() => void load()} />}

          {loading && articles.length === 0 && !error && <SkeletonRows rows={6} />}

          {!loading && !error && articles.length === 0 && (
            <EmptyState
              title={hasSearch ? "Nothing matches that search" : empty.title}
              actions={
                hasSearch ? (
                  <RadarButton
                    variant="accent"
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                    }}
                  >
                    Clear the search
                  </RadarButton>
                ) : undefined
              }
            >
              {hasSearch
                ? `No title or summary under this filter contains "${search}". Clearing it, or moving to All, will widen the list.`
                : empty.body}
            </EmptyState>
          )}

          {articles.length > 0 && !error && (
            <>
              {loading && (
                <p
                  role="status"
                  aria-live="polite"
                  className="m-0 pb-2 text-[11.5px] text-radar-ink3"
                >
                  Refreshing the list…
                </p>
              )}

              {canEdit && (
                <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-radar-line pb-3">
                  <SelectCheckbox
                    checked={selection.allSelected}
                    indeterminate={selection.partiallySelected}
                    onToggle={() =>
                      selection.allSelected ? selection.clear() : selection.selectAll()
                    }
                    label={selection.allSelected ? "Clear selection" : selectAllLabel}
                  />
                  <span className="text-[12.5px] text-radar-ink2">
                    {selection.count > 0
                      ? `${selection.count} of ${articles.length} on this page selected`
                      : selectAllLabel}
                  </span>
                  <span className="ml-auto text-[11.5px] text-radar-ink3">
                    Shift-click to select a range · Esc to clear
                  </span>
                </div>
              )}

              {renderRows()}

              {/*
                Renders nothing at one page, which is the common case. It is here because a
                ceiling with no way past it left the oldest rows of a large filter reachable
                by nothing at all, search included, which is the unreachability this whole
                screen exists to end.

                Changing page changes the visible ids, and `useSelection` prunes a selection
                to what is visible, so a bulk action can never reach a row on another page.
              */}
              <Pagination
                page={page}
                totalPages={totalPages}
                onPage={setPage}
                busy={loading || bulkBusy !== null}
                className="mt-5"
              />

              {/* A VIEWER gets an empty action list, and the bar renders nothing for it. */}
              <BulkBar
                selection={selection}
                actions={bulkActions}
                noun="story"
                nounPlural="stories"
                busyAction={bulkBusy}
              />
            </>
          )}
        </div>

        <Dialog
          open={pendingBulk !== null}
          onOpenChange={(open) => !open && setPendingBulk(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {pendingBulk?.action === "discard" ? "Discard" : "Reject"}{" "}
                {pendingBulk?.ids.length}{" "}
                {pendingBulk?.ids.length === 1 ? "story" : "stories"}?
              </DialogTitle>
              <DialogDescription>
                {pendingBulk?.action === "discard"
                  ? "They leave every list on this screen except Discarded, and are pulled out of any edition still open. Nothing is deleted: Restore brings each one back with the verdict it had. Check the selection before confirming rather than after."
                  : "They leave the queue and will not appear in any edition. Rejecting is reversible from this screen, but check the selection before confirming rather than after."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <RadarButton variant="outline" onClick={() => setPendingBulk(null)}>
                Cancel
              </RadarButton>
              <RadarButton
                variant="accent"
                disabled={bulkBusy !== null}
                onClick={() => {
                  const confirmed = pendingBulk;
                  setPendingBulk(null);
                  if (confirmed) void runBulk(confirmed.action, confirmed.ids);
                }}
              >
                {`${pendingBulk?.action === "discard" ? "Discard" : "Reject"} ${
                  pendingBulk?.ids.length ?? 0
                }`}
              </RadarButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </RadarMain>
    </>
  );
}

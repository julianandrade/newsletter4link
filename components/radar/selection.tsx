"use client";

/**
 * Bulk selection for tables and lists.
 *
 * Built because Sources has 434 feeds and the only way to enable or disable
 * them was one row at a time. The pieces here are deliberately generic so the
 * next long list (subscribers, articles, projects) gets the same behaviour
 * rather than its own half of it.
 *
 * The decisions that matter, and why:
 *
 * - A selection means one of two things, and which one is always explicit. The
 *   default is "everything currently visible", and the count on the button is
 *   the count that will be acted on. The second, opt-in, is "everything this
 *   filter matches", which exists because paging 434 feeds fifty at a time to
 *   pause them all is not a workflow, it is a punishment.
 * - Matching mode still acts on ids, never on a filter. The host resolves the
 *   set before anything runs, so the server receives an explicit list it can
 *   log. A filter re-interpreted server-side is how you delete rows nobody
 *   chose, and the two implementations would drift the first time one changed.
 * - Matching mode is a claim about a filter, so it expires when the filter
 *   does: any change to the visible rows drops back to page mode. Carrying the
 *   claim across a filter change is exactly the "acts on the invisible" failure
 *   the pruning below was written to prevent.
 * - When the filter changes, the selection is pruned to what is still visible.
 *   Keeping hidden rows selected means a Delete that hits things the user
 *   cannot see; clearing outright throws away work they did on purpose. Pruning
 *   preserves intent and can never act on the invisible.
 * - Shift-click extends from the last row touched. At 434 rows this is not a
 *   nicety, it is the difference between usable and not.
 * - The action bar reports what happened per action, because a bulk write that
 *   silently affects fewer rows than asked is the failure mode worth catching.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RadarButton } from "./primitives";

/** What the current selection is a claim about. */
export type SelectionMode = "page" | "matching";

export interface Selection {
  selected: Set<string>;
  /** In matching mode this is the filter's total, not the size of `selected`. */
  count: number;
  isSelected: (id: string) => boolean;
  /** Toggle one row. Pass the click event to support shift-extend. */
  toggle: (id: string, event?: { shiftKey?: boolean }) => void;
  selectAll: () => void;
  selectOnly: (ids: string[]) => void;
  clear: () => void;
  /** Every visible row is selected. */
  allSelected: boolean;
  /** Some but not all: the header checkbox renders indeterminate. */
  partiallySelected: boolean;
  mode: SelectionMode;
  /** The filter's total, when the host supplied one. */
  matchingTotal: number | null;
  /** There is more behind the filter than is on screen, and it can be resolved. */
  canSelectMatching: boolean;
  selectAllMatching: () => void;
  /**
   * The ids an action should run against.
   *
   * Async because matching mode asks the host to resolve them, which may be a request.
   * Rejections are not swallowed: a caller that cannot resolve the set must not act on a
   * partial one.
   */
  idsForAction: () => Promise<string[]>;
}

export interface SelectionOptions {
  /**
   * How many rows the current filter matches in total, across every page. The second
   * selection step appears only when this exceeds what is on screen.
   */
  matchingTotal?: number;
  /**
   * Turns the filter into ids. A list holding every row in the browser maps its own array;
   * a server-paged list asks the API. Without this, matching mode is refused outright,
   * because a claim nothing can resolve is a claim nothing should act on.
   */
  resolveMatchingIds?: () => Promise<string[]>;
}

/**
 * @param visibleIds ids in the order they are rendered, already filtered. The
 * order is what makes shift-click ranges predictable, so pass the same array
 * the list maps over.
 */
export function useSelection(
  visibleIds: string[],
  options: SelectionOptions = {}
): Selection {
  const { matchingTotal, resolveMatchingIds } = options;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SelectionMode>("page");
  const lastTouched = useRef<string | null>(null);

  /**
   * Mirror of the current selection, so every mutation below can compute the
   * next set and move the range anchor outside a state updater.
   *
   * This is not an optimisation, it is a correctness fix. The anchor used to be
   * moved inside a setState updater, and React invokes updaters twice under
   * StrictMode: the first pass applied the range and moved the anchor onto the
   * clicked row, then the second pass saw anchor === target, took the plain
   * toggle branch instead, and React kept that result. A shift-click from row 1
   * to row 3 selected rows 1 and 3 and skipped row 2. Updaters must be pure.
   */
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const commit = useCallback((next: Set<string>) => {
    selectedRef.current = next;
    setSelected(next);
  }, []);

  // Prune to what is visible whenever the filter changes. Compared by value so
  // a re-render with an equivalent array does not clear the selection.
  //
  // The separator is a NUL, so no id can forge a boundary. Written as an escape rather
  // than the literal byte it used to be: a raw NUL in the source makes grep and ripgrep
  // classify this whole file as binary and skip it.
  const visibleKey = visibleIds.join("\u0000");
  useEffect(() => {
    // A filter change expires a matching claim: it was about the old filter.
    setMode("page");

    const prev = selectedRef.current;
    if (prev.size === 0) return;
    const visible = new Set(visibleIds);
    const next = new Set<string>();
    for (const id of prev) if (visible.has(id)) next.add(id);
    if (next.size !== prev.size) commit(next);
    // visibleKey stands in for the array contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, commit]);

  const toggle = useCallback(
    (id: string, event?: { shiftKey?: boolean }) => {
      const prev = selectedRef.current;
      const next = new Set(prev);
      const anchor = lastTouched.current;

      // Shift-extend: apply the new state of the clicked row across the range.
      if (event?.shiftKey && anchor && anchor !== id) {
        const from = visibleIds.indexOf(anchor);
        const to = visibleIds.indexOf(id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          const turningOn = !prev.has(id);
          for (let index = start; index <= end; index += 1) {
            if (turningOn) next.add(visibleIds[index]);
            else next.delete(visibleIds[index]);
          }
          lastTouched.current = id;
          commit(next);
          return;
        }
      }

      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastTouched.current = id;
      commit(next);
    },
    [visibleIds, commit]
  );

  const selectAll = useCallback(() => {
    commit(new Set(visibleIds));
  }, [visibleIds, commit]);

  const selectOnly = useCallback(
    (ids: string[]) => {
      commit(new Set(ids));
    },
    [commit]
  );

  const clear = useCallback(() => {
    lastTouched.current = null;
    setMode("page");
    commit(new Set());
  }, [commit]);

  const canSelectMatching =
    typeof matchingTotal === "number" &&
    matchingTotal > visibleIds.length &&
    typeof resolveMatchingIds === "function";

  const selectAllMatching = useCallback(() => {
    // Refused rather than half-entered when nothing can resolve the set: a claim on rows
    // that cannot be listed is a claim no action should be allowed to run against.
    if (!canSelectMatching) return;
    setMode("matching");
    commit(new Set(visibleIds));
  }, [canSelectMatching, commit, visibleIds]);

  const idsForAction = useCallback(async () => {
    if (mode === "matching" && resolveMatchingIds) return resolveMatchingIds();
    return [...selectedRef.current];
  }, [mode, resolveMatchingIds]);

  // Escape clears, the way it does in every list that supports selection.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected.size, clear]);

  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const matching = mode === "matching";

  return useMemo(
    () => ({
      selected,
      // In matching mode the count is the filter's total, because that is what an action
      // will hit. Reporting the page's size there would put a number on the bar that is
      // smaller than what the button does.
      count: matching && typeof matchingTotal === "number" ? matchingTotal : selected.size,
      isSelected: (id: string) => selected.has(id),
      toggle,
      selectAll,
      selectOnly,
      clear,
      allSelected: matching || allSelected,
      partiallySelected: !matching && selected.size > 0 && !allSelected,
      mode,
      matchingTotal: typeof matchingTotal === "number" ? matchingTotal : null,
      canSelectMatching,
      selectAllMatching,
      idsForAction,
    }),
    [
      selected,
      toggle,
      selectAll,
      selectOnly,
      clear,
      allSelected,
      matching,
      mode,
      matchingTotal,
      canSelectMatching,
      selectAllMatching,
      idsForAction,
    ]
  );
}

/**
 * Checkbox that can render the mixed state.
 *
 * `indeterminate` is a DOM property with no HTML attribute, so it has to be set
 * through a ref; without it a partial selection looks identical to none.
 */
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onToggle,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  /**
   * Receives normalized modifiers rather than the raw React event, because a
   * change event carries no shiftKey and a click does: consumers should not
   * have to know which one fired.
   */
  onToggle: (modifiers: { shiftKey: boolean }) => void;
  /** Required: a bare checkbox in a row tells a screen reader nothing. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    /**
     * Assert `checked` onto the DOM from state, rather than trusting React to
     * write it.
     *
     * A click on a checkbox optimistically sets `node.checked` before any handler
     * runs, and React's input value tracker records that value. `onClick` then
     * calls preventDefault, so the browser reverts the property to its old value,
     * but the tracker still holds the optimistic one. When state arrives at that
     * same value, React's diff sees no change against the tracker and skips the
     * write, so the box stays visually unticked while the row is selected.
     *
     * The symptom was specific and easy to misread: clicking one row selected it,
     * the bar counted it and the box stayed empty, while "select all" ticked
     * everything, because that path writes to nodes nobody clicked. Every list
     * using this component had it.
     */
    if (node.checked !== checked) node.checked = checked;
    node.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      /**
       * Selection is handled entirely in onClick, never onChange.
       *
       * onClick is the only event carrying shiftKey, and pressing Space on a
       * focused checkbox fires a click too, so this covers mouse and keyboard
       * alike. Handling both events instead let them fire in sequence on a
       * shift-click: the range was applied, then the target row was toggled
       * straight back off, so a 4..14 drag selected 4..13.
       *
       * Deliberately no preventDefault. Cancelling the default action makes the
       * browser revert the property it optimistically set, and that revert lands
       * after React has rendered and after the effect above has asserted state
       * onto the node, so it won the race and the box stayed visually wrong while
       * the row was selected. Letting the toggle stand costs nothing: the effect
       * is the authority, and it corrects the node whenever state disagrees, which
       * is what happens when a selection is pruned or cleared.
       */
      onChange={() => {
        /* intentionally empty: see onClick */
      }}
      onClick={(event) => {
        onToggle({ shiftKey: event.shiftKey });
      }}
      className={cn(
        "h-[15px] w-[15px] shrink-0 cursor-pointer rounded border-radar-line",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      style={{ accentColor: "var(--r-accent)" }}
    />
  );
}

export interface BulkAction {
  id: string;
  label: string;
  /** Destructive actions are separated and styled apart. */
  destructive?: boolean;
  onRun: (ids: string[]) => Promise<void> | void;
}

/**
 * Bar that appears once something is selected.
 *
 * Sticky to the bottom of the viewport: with hundreds of rows the selection is
 * usually made far from the top of the page, and an action bar you have to
 * scroll back to find is an action bar that does not get used.
 */
export function BulkBar({
  selection,
  actions,
  noun = "item",
  nounPlural,
  busyAction,
  filterSummary,
  className,
}: {
  selection: Selection;
  actions: BulkAction[];
  /** Singular form, e.g. "feed". */
  noun?: string;
  /** Plural form, when adding an s is wrong: "story" needs "stories". */
  nounPlural?: string;
  /** Id of the action currently running, so the bar can show progress. */
  busyAction?: string | null;
  /**
   * The current filter in words, shown only in matching mode.
   *
   * A count is exactly what you cannot verify when the rows are off screen, so the bar
   * says what the filter was as well as how many it caught.
   */
  filterSummary?: string;
  className?: string;
}) {
  if (selection.count === 0) return null;

  const plural = nounPlural ?? `${noun}s`;
  const matching = selection.mode === "matching";
  const label = `${selection.count} ${selection.count === 1 ? noun : plural}`;
  const busy = Boolean(busyAction);

  /**
   * The ids an action runs against, resolved at the moment it is launched.
   *
   * This used to be `[...selection.selected]`, computed once at render. In matching mode
   * that would label the bar 434 and then act on the fifty rows that happen to be
   * rendered. Resolving here means no host can get it wrong, and a resolve that fails
   * stops the action rather than running it against a partial set.
   */
  const run = async (action: BulkAction) => {
    let ids: string[];
    try {
      ids = await selection.idsForAction();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `The selection could not be resolved: ${error.message}`
          : "The selection could not be resolved, so nothing was changed"
      );
      return;
    }
    action.onRun(ids);
  };
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);

  return (
    <>
      {/*
        The bar is sticky, so it floats over the list instead of reserving space.
        This spacer is what lets the last rows be scrolled clear of it; without
        it they sit permanently behind the bar. Kept here rather than in each
        consumer so no screen can forget it.
      */}
      <div aria-hidden="true" className="h-20" />
    <div
      role="region"
      aria-label={`${label} selected`}
      className={cn(
        "radar-enter sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-3",
        "rounded-xl border border-radar-line bg-radar-surface px-4 py-3 shadow-lg",
        className
      )}
    >
      <span className="min-w-0 text-[12.5px] font-semibold text-radar-ink">
        {label} selected{matching && ", all matching"}
        {matching && filterSummary && (
          <span className="ml-2 font-normal text-radar-ink3">{filterSummary}</span>
        )}
      </span>

      {!selection.allSelected && (
        <button
          type="button"
          onClick={selection.selectAll}
          disabled={busy}
          className="text-[12.5px] text-radar-primary2 underline hover:text-radar-accent disabled:opacity-60"
        >
          Select all visible
        </button>
      )}

      {/* The second step, offered here too: this is where you are standing when you
          realise the page is not the set you meant. */}
      {!matching && selection.canSelectMatching && (
        <button
          type="button"
          onClick={selection.selectAllMatching}
          disabled={busy}
          className="text-[12.5px] text-radar-primary2 underline hover:text-radar-accent disabled:opacity-60"
        >
          Select all {selection.matchingTotal} matching
        </button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {safe.map((action) => (
          <RadarButton
            key={action.id}
            variant="outline"
            disabled={busy}
            onClick={() => void run(action)}
          >
            {busyAction === action.id ? "Working…" : action.label}
          </RadarButton>
        ))}
        {destructive.map((action) => (
          <RadarButton
            key={action.id}
            variant="outline"
            disabled={busy}
            onClick={() => void run(action)}
            className="border-radar-err text-radar-err hover:bg-radar-err hover:text-radar-on-accent"
          >
            {busyAction === action.id ? "Working…" : action.label}
          </RadarButton>
        ))}
        <button
          type="button"
          onClick={selection.clear}
          disabled={busy}
          className="text-[12.5px] text-radar-ink3 underline hover:text-radar-ink disabled:opacity-60"
        >
          Clear
        </button>
      </div>
    </div>
    </>
  );
}

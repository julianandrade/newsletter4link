"use client";

/**
 * Ordering, as one control shape used by every list.
 *
 * There was no such shape. Three screens sorted through a select buried behind a "Filters"
 * button, one sorted ten rows of a twelve-page history in the browser, and four offered no
 * ordering at all. A table whose headers do nothing when clicked is the one affordance
 * people try first, so this file makes the header the control and gives the lists that have
 * no table the same vocabulary through a select.
 *
 * Two rules the primitives enforce rather than document:
 *
 *  - The header is a real `<button>` inside the `<th>`, and the `<th>` carries `aria-sort`.
 *    A `<div>` with an onClick is unreachable by keyboard and silent to a screen reader,
 *    and "sorted by score, descending" is the whole state of the list.
 *  - A column declares which direction its *first* click means. Clicking Date should give
 *    newest first and clicking Story should give A to Z; making every column start
 *    ascending means the two most-used columns both need two clicks to be useful.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { RadarSelect } from "@/components/radar/controls";
import type { SortDirection } from "@/lib/list-sort";

export type { SortDirection };

export interface SortState<Field extends string> {
  field: Field;
  direction: SortDirection;
}

/**
 * What clicking a header should do next.
 *
 * A different column jumps to that column's own default direction. The same column flips.
 * There is deliberately no third "unsorted" state in the cycle: every list here has a
 * meaningful default order, and a click that lands on "no order" reads as a broken click.
 */
export function nextSort<Field extends string>(
  current: SortState<Field>,
  field: Field,
  defaultDirection: SortDirection = "asc"
): SortState<Field> {
  if (current.field !== field) return { field, direction: defaultDirection };
  return { field, direction: current.direction === "asc" ? "desc" : "asc" };
}

/** Encoded for a select's option value and for a query string. */
export function sortToken<Field extends string>(sort: SortState<Field>): string {
  return `${sort.field}:${sort.direction}`;
}

export function sortFromToken<Field extends string>(
  token: string,
  fallback: SortState<Field>
): SortState<Field> {
  const [field, direction] = token.split(":");
  if (!field) return fallback;
  return {
    field: field as Field,
    direction: direction === "asc" ? "asc" : "desc",
  };
}

/** Adds `sortBy` and `sortOrder` to a params object the routes all read the same way. */
export function applySortParams<Field extends string>(
  params: URLSearchParams,
  sort: SortState<Field>
): URLSearchParams {
  params.set("sortBy", sort.field);
  params.set("sortOrder", sort.direction);
  return params;
}

/* --------------------------------------------------------------------- indicator */

function SortCaret({
  state,
}: {
  /** "none" is the resting state of a sortable column nobody has clicked. */
  state: "none" | "asc" | "desc";
}) {
  return (
    <svg
      aria-hidden="true"
      width="9"
      height="12"
      viewBox="0 0 9 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {/* Both carets are always drawn. The inactive one stays faint rather than vanishing,
          so the column's width does not change when the sort moves to it. */}
      <path d="M2 4.6 4.5 2 7 4.6" className={state === "asc" ? "opacity-100" : "opacity-25"} />
      <path d="M2 7.4 4.5 10 7 7.4" className={state === "desc" ? "opacity-100" : "opacity-25"} />
    </svg>
  );
}

/* ---------------------------------------------------------------------- headers */

export interface SortableThProps<Field extends string> {
  /** The value sent as `sortBy`. */
  field: Field;
  children: React.ReactNode;
  sort: SortState<Field>;
  onSort: (next: SortState<Field>) => void;
  /** What the first click on this column means. Dates and numbers usually want "desc". */
  defaultDirection?: SortDirection;
  align?: "left" | "right";
  className?: string;
  /** Spoken after the column name, so the announcement says what the click will do. */
  hint?: string;
}

/**
 * A `<th>` whose label is the control that orders the table by it.
 *
 * `aria-sort` goes on the `<th>` and not on the button: it describes the column, and only
 * one column in a table may carry it, which is exactly the invariant a single sort state
 * gives us for free.
 */
export function SortableTh<Field extends string>({
  field,
  children,
  sort,
  onSort,
  defaultDirection = "asc",
  align = "left",
  className,
  hint,
}: SortableThProps<Field>) {
  const active = sort.field === field;
  const state = active ? sort.direction : "none";

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "px-4 py-2.5 font-semibold whitespace-nowrap",
        align === "right" && "text-right",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, field, defaultDirection))}
        className={cn(
          // Inherits the thead's uppercase tracking; only the colour and the caret change.
          "inline-flex items-center gap-1.5 rounded font-semibold tracking-[inherit] uppercase transition-colors",
          "hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
          active ? "text-radar-ink" : "text-radar-ink3",
          align === "right" && "flex-row-reverse"
        )}
      >
        {children}
        <SortCaret state={state} />
        <span className="sr-only">
          {active
            ? `, sorted ${sort.direction === "asc" ? "ascending" : "descending"}. Activate to reverse`
            : `, not sorted. Activate to sort${hint ? ` ${hint}` : ""}`}
        </span>
      </button>
    </th>
  );
}

/**
 * Says out loud what the table just did.
 *
 * Reordering a table replaces every row without moving focus, so nothing is announced and a
 * screen-reader user hears silence after pressing a header. Render one of these beside any
 * sortable table.
 */
export function SortAnnouncement<Field extends string>({
  sort,
  labels,
  count,
  noun,
}: {
  sort: SortState<Field>;
  labels: Record<Field, string>;
  count: number;
  noun: string;
}) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {count} {noun}, sorted by {labels[sort.field] ?? sort.field},{" "}
      {sort.direction === "asc" ? "ascending" : "descending"}.
    </p>
  );
}

/* ----------------------------------------------------------------------- select */

export interface SortOption<Field extends string> {
  field: Field;
  direction: SortDirection;
  label: string;
}

/**
 * The same ordering, for a list drawn as cards or rows.
 *
 * Cards have no header to click, and they are still lists people need in a particular
 * order. Every option names both the field and the direction, because "Score" and
 * "ascending" as two separate controls is two decisions for one intent.
 */
export function SortSelect<Field extends string>({
  options,
  sort,
  onChange,
  label = "Sort",
  className,
}: {
  options: readonly SortOption<Field>[];
  sort: SortState<Field>;
  onChange: (next: SortState<Field>) => void;
  label?: string;
  className?: string;
}) {
  const fallback = options[0]
    ? { field: options[0].field, direction: options[0].direction }
    : sort;

  return (
    <RadarSelect
      aria-label={label}
      className={cn("w-auto min-w-[170px]", className)}
      value={sortToken(sort)}
      onChange={(event) => onChange(sortFromToken(event.target.value, fallback))}
    >
      {options.map((option) => {
        const token = sortToken(option);
        return (
          <option key={token} value={token}>
            {option.label}
          </option>
        );
      })}
    </RadarSelect>
  );
}

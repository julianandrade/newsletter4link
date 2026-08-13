"use client";

import type * as React from "react";
import { RadarInput } from "@/components/radar/controls";
import { radarButtonClass } from "@/components/radar/primitives";
import { SearchIcon } from "@/components/radar/icons";

/**
 * One toolbar shape for every list on the sources screen.
 *
 * There were two, thirty pixels apart, in two vocabularies: "Every source" against "All
 * Categories", "Name, A to Z" against "Name (A-Z)". Same job, different dialect, because
 * each manager grew its own.
 *
 * The bar owns no state. Each tab passes its own values and handlers, which is what lets
 * one component serve three lists whose filters have nothing in common.
 */
export function SourceFilterBar({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  selects,
  sort,
  actions,
  onClear,
}: {
  search: string;
  onSearch: (value: string) => void;
  /** Spoken label. The input has no visible one, so this is the only name it has. */
  searchLabel: string;
  searchPlaceholder: string;
  /** This list's own selects, in the order they should read. */
  selects?: React.ReactNode;
  sort?: React.ReactNode;
  /** What acts on the collection rather than narrowing it: import, add. */
  actions?: React.ReactNode;
  /** Rendered only when something is actually set, so it is never a dead control. */
  onClear?: (() => void) | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
        <SearchIcon
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
        />
        <RadarInput
          type="search"
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      {selects}
      {sort}

      {onClear && (
        <button type="button" onClick={onClear} className={radarButtonClass("ghost", "sm")}>
          Clear filters
        </button>
      )}

      {/* Pushed to the far end: these act on the collection, and reading them beside the
          filters invites a click on Add when the intent was to narrow the list. */}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchIcon } from "@/components/radar/icons";
import { RadarButton, SectionLabel } from "@/components/radar/primitives";
import { RadarField, RadarInput, RadarSelect } from "@/components/radar/controls";
import {
  SortSelect,
  type SortDirection,
  type SortOption,
  type SortState,
} from "@/components/radar/sortable";
import { cn } from "@/lib/utils";

/** Mirrors `PROJECT_SORT_FIELDS` in `app/api/projects/route.ts`. */
export type ProjectSortField =
  | "name"
  | "team"
  | "projectDate"
  | "createdAt"
  | "featured";

export const PROJECT_SORT_DEFAULT_DIRECTION: Record<ProjectSortField, SortDirection> = {
  name: "asc",
  team: "asc",
  projectDate: "desc",
  createdAt: "desc",
  featured: "desc",
};

export const PROJECT_SORT_LABELS: Record<ProjectSortField, string> = {
  name: "name",
  team: "team",
  projectDate: "when it shipped",
  createdAt: "when it was added",
  featured: "whether it is in the next send",
};

/**
 * The same orders the table headers give, for the card and compact layouts.
 *
 * Two selects, "Sort by" and "Order", became one list of named orders. Splitting them made
 * "Newest first" available under Name, where it meant Z to A, and asked for two decisions
 * to express one intent.
 */
export const PROJECT_SORT_OPTIONS: SortOption<ProjectSortField>[] = [
  { field: "createdAt", direction: "desc", label: "Added most recently" },
  { field: "createdAt", direction: "asc", label: "Added first" },
  { field: "projectDate", direction: "desc", label: "Shipped most recently" },
  { field: "projectDate", direction: "asc", label: "Shipped first" },
  { field: "name", direction: "asc", label: "Name, A to Z" },
  { field: "name", direction: "desc", label: "Name, Z to A" },
  { field: "team", direction: "asc", label: "Team, A to Z" },
  { field: "featured", direction: "desc", label: "In the next send first" },
];

export interface ProjectFilters {
  search: string;
  team: string;
  featured: string; // "all" | "true" | "false"
  dateFrom: string;
  dateTo: string;
  sortBy: ProjectSortField;
  sortOrder: "asc" | "desc";
}

export const defaultProjectFilters: ProjectFilters = {
  search: "",
  team: "all",
  featured: "all",
  dateFrom: "",
  dateTo: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

interface ProjectFiltersProps {
  filters: ProjectFilters;
  onFiltersChange: (filters: ProjectFilters) => void;
  teams: string[];
  className?: string;
}

export function ProjectFiltersComponent({
  filters,
  onFiltersChange,
  teams,
  className,
}: ProjectFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search);

  // Typing used to refetch on every keystroke; hold it for a beat instead.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onFiltersChange({ ...filters, search: searchValue });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, filters, onFiltersChange]);

  const updateFilter = useCallback(
    <K extends keyof ProjectFilters>(key: K, value: ProjectFilters[K]) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange]
  );

  const clearFilters = useCallback(() => {
    setSearchValue("");
    setShowAdvanced(false);
    onFiltersChange(defaultProjectFilters);
  }, [onFiltersChange]);

  // The order is not counted: reordering shows the same projects, so offering "Clear all"
  // for it says something is hidden when nothing is.
  const hasActiveFilters =
    filters.search !== "" ||
    filters.team !== "all" ||
    filters.featured !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[340px]">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
          />
          <RadarInput
            type="search"
            aria-label="Search projects"
            placeholder="Search names and descriptions"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="pl-9"
          />
        </div>

        <RadarSelect
          aria-label="Filter by team"
          className="w-auto min-w-[150px]"
          value={filters.team}
          onChange={(event) => updateFilter("team", event.target.value)}
        >
          <option value="all">Every team</option>
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </RadarSelect>

        <RadarSelect
          aria-label="Filter by newsletter placement"
          className="w-auto min-w-[150px]"
          value={filters.featured}
          onChange={(event) => updateFilter("featured", event.target.value)}
        >
          <option value="all">Featured or not</option>
          <option value="true">In the newsletter</option>
          <option value="false">Not featured</option>
        </RadarSelect>

        {/* Out of the disclosure. The order is the control people reach for first, and it
            was two selects behind a button labelled "Dates and sorting". */}
        <SortSelect
          label="Sort projects"
          options={PROJECT_SORT_OPTIONS}
          sort={{ field: filters.sortBy, direction: filters.sortOrder }}
          onChange={(next: SortState<ProjectSortField>) =>
            onFiltersChange({
              ...filters,
              sortBy: next.field,
              sortOrder: next.direction,
            })
          }
        />

        <RadarButton
          onClick={() => setShowAdvanced((previous) => !previous)}
          aria-expanded={showAdvanced}
        >
          Dates
        </RadarButton>

        {hasActiveFilters && (
          <RadarButton variant="ghost" onClick={clearFilters}>
            Clear all
          </RadarButton>
        )}
      </div>

      {showAdvanced && (
        <div className="radar-enter rounded-xl border border-radar-line bg-radar-surface p-4">
          <SectionLabel className="mb-3">Shipped between</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <RadarField label="Shipped from">
              <RadarInput
                type="date"
                value={filters.dateFrom}
                onChange={(event) => updateFilter("dateFrom", event.target.value)}
              />
            </RadarField>

            {/* The pair filters `projectDate`, which the table heads "Shipped". They were
                labelled "Delivered", which is a third word for the same column. */}
            <RadarField label="Shipped to">
              <RadarInput
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
              />
            </RadarField>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Build query string from filters
 */
export function buildProjectQueryString(filters: ProjectFilters): string {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.team && filters.team !== "all") {
    params.set("team", filters.team);
  }
  if (filters.featured && filters.featured !== "all") {
    params.set("featured", filters.featured);
  }
  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  if (filters.sortBy && filters.sortBy !== "createdAt") {
    params.set("sortBy", filters.sortBy);
  }
  if (filters.sortOrder && filters.sortOrder !== "desc") {
    params.set("sortOrder", filters.sortOrder);
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

"use client";

import { useEffect, useState } from "react";
import { SearchIcon } from "@/components/radar/icons";
import {
  FilterPill,
  Num,
  RadarButton,
  SectionLabel,
} from "@/components/radar/primitives";
import { RadarField, RadarInput, RadarSelect } from "@/components/radar/controls";
import { cn } from "@/lib/utils";

export interface ArticleFilters {
  search: string;
  categories: string[];
  scoreMin: number;
  scoreMax: number;
  dateFrom: string;
  dateTo: string;
  sortBy: "relevanceScore" | "publishedAt" | "title";
  sortOrder: "asc" | "desc";
}

interface ArticleFiltersProps {
  filters: ArticleFilters;
  onChange: (filters: ArticleFilters) => void;
  availableCategories: string[];
  className?: string;
}

export const defaultArticleFilters: ArticleFilters = {
  search: "",
  categories: [],
  scoreMin: 0,
  scoreMax: 10,
  dateFrom: "",
  dateTo: "",
  sortBy: "relevanceScore",
  sortOrder: "desc",
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "relevanceScore-desc", label: "Score, high to low" },
  { value: "relevanceScore-asc", label: "Score, low to high" },
  { value: "publishedAt-desc", label: "Newest first" },
  { value: "publishedAt-asc", label: "Oldest first" },
  { value: "title-asc", label: "Title, A to Z" },
  { value: "title-desc", label: "Title, Z to A" },
];

export function ArticleFiltersComponent({
  filters,
  onChange,
  availableCategories,
  className,
}: ArticleFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search);
  // Inline disclosure rather than a popover: nothing to clip, nothing to portal.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onChange({ ...filters, search: searchValue });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, filters, onChange]);

  const activeFilterCount = [
    filters.search,
    filters.categories.length > 0,
    filters.scoreMin > 0 || filters.scoreMax < 10,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchValue("");
    setShowAdvanced(false);
    onChange(defaultArticleFilters);
  };

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onChange({ ...filters, categories: newCategories });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-[380px]">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
          />
          <RadarInput
            type="search"
            aria-label="Search articles"
            placeholder="Search titles and summaries"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="pr-8 pl-9"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => {
                setSearchValue("");
                onChange({ ...filters, search: "" });
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1 text-[13px] text-radar-ink3 transition-colors hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
            >
              <span aria-hidden="true">×</span>
              <span className="sr-only">Clear search</span>
            </button>
          )}
        </div>

        <RadarSelect
          aria-label="Sort articles"
          className="w-auto min-w-[170px]"
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split("-") as [
              ArticleFilters["sortBy"],
              ArticleFilters["sortOrder"],
            ];
            onChange({ ...filters, sortBy, sortOrder });
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </RadarSelect>

        <RadarButton
          onClick={() => setShowAdvanced((previous) => !previous)}
          aria-expanded={showAdvanced}
        >
          Filters
          {activeFilterCount > 0 && (
            <Num className="text-[11px] text-radar-accent">{activeFilterCount}</Num>
          )}
        </RadarButton>

        {activeFilterCount > 0 && (
          <RadarButton variant="ghost" onClick={clearFilters}>
            Clear all
          </RadarButton>
        )}
      </div>

      {showAdvanced && (
        <div className="radar-enter rounded-xl border border-radar-line bg-radar-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <SectionLabel className="mb-2.5">
                Score between <Num>{filters.scoreMin.toFixed(1)}</Num> and{" "}
                <Num>{filters.scoreMax.toFixed(1)}</Num>
              </SectionLabel>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2.5">
                  <span className="w-8 text-[11px] text-radar-ink3">Min</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={filters.scoreMin}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      onChange({
                        ...filters,
                        scoreMin: next,
                        // Keep the pair ordered rather than silently inverting it.
                        scoreMax: Math.max(next, filters.scoreMax),
                      });
                    }}
                    className="h-1 flex-1 cursor-pointer"
                    style={{ accentColor: "var(--r-accent)" }}
                  />
                </label>
                <label className="flex items-center gap-2.5">
                  <span className="w-8 text-[11px] text-radar-ink3">Max</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={filters.scoreMax}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      onChange({
                        ...filters,
                        scoreMax: next,
                        scoreMin: Math.min(next, filters.scoreMin),
                      });
                    }}
                    className="h-1 flex-1 cursor-pointer"
                    style={{ accentColor: "var(--r-accent)" }}
                  />
                </label>
              </div>
            </div>

            <RadarField label="Published from">
              <RadarInput
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  onChange({ ...filters, dateFrom: event.target.value })
                }
              />
            </RadarField>

            <RadarField label="Published to">
              <RadarInput
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  onChange({ ...filters, dateTo: event.target.value })
                }
              />
            </RadarField>
          </div>

          {availableCategories.length > 0 && (
            <div className="mt-4 border-t border-radar-line2 pt-3.5">
              <SectionLabel className="mb-2.5">Topics</SectionLabel>
              <div className="flex max-h-[120px] flex-wrap gap-1.5 overflow-y-auto">
                {availableCategories.map((category) => (
                  <FilterPill
                    key={category}
                    active={filters.categories.includes(category)}
                    onClick={() => toggleCategory(category)}
                  >
                    {category}
                  </FilterPill>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {filters.categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <SectionLabel className="mr-1">Filtered to</SectionLabel>
          {filters.categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              className="inline-flex items-center gap-1.5 rounded-full border border-radar-accent bg-radar-surface px-2.5 py-0.5 text-[11px] text-radar-ink transition-colors hover:border-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
            >
              {category}
              <span aria-hidden="true" className="text-radar-ink3">
                ×
              </span>
              <span className="sr-only">Remove {category} filter</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Build query string from filters
 */
export function buildArticleQueryString(filters: ArticleFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.categories.length > 0)
    params.set("categories", filters.categories.join(","));
  if (filters.scoreMin > 0) params.set("scoreMin", filters.scoreMin.toString());
  if (filters.scoreMax < 10) params.set("scoreMax", filters.scoreMax.toString());
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("sortBy", filters.sortBy);
  params.set("sortOrder", filters.sortOrder);

  return params.toString();
}

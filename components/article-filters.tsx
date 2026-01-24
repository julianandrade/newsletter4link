"use client";

import { useState, useEffect } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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

export function ArticleFiltersComponent({
  filters,
  onChange,
  availableCategories,
  className,
}: ArticleFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search);

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
    onChange(defaultArticleFilters);
  };

  const toggleCategory = (category: string) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category];
    onChange({ ...filters, categories: newCategories });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search and main controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchValue && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => {
                setSearchValue("");
                onChange({ ...filters, search: "" });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Sort */}
        <Select
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split("-") as [
              ArticleFilters["sortBy"],
              ArticleFilters["sortOrder"]
            ];
            onChange({ ...filters, sortBy, sortOrder });
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevanceScore-desc">Score (high to low)</SelectItem>
            <SelectItem value="relevanceScore-asc">Score (low to high)</SelectItem>
            <SelectItem value="publishedAt-desc">Newest first</SelectItem>
            <SelectItem value="publishedAt-asc">Oldest first</SelectItem>
            <SelectItem value="title-asc">Title (A-Z)</SelectItem>
            <SelectItem value="title-desc">Title (Z-A)</SelectItem>
          </SelectContent>
        </Select>

        {/* Advanced filters popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-auto py-1 px-2 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {/* Score range */}
              <div className="space-y-2">
                <Label className="text-sm">
                  Score range: {filters.scoreMin.toFixed(1)} - {filters.scoreMax.toFixed(1)}
                </Label>
                <div className="px-2">
                  <Slider
                    min={0}
                    max={10}
                    step={0.5}
                    value={[filters.scoreMin, filters.scoreMax]}
                    onValueChange={([min, max]) =>
                      onChange({ ...filters, scoreMin: min, scoreMax: max })
                    }
                  />
                </div>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">From date</Label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      onChange({ ...filters, dateFrom: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">To date</Label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      onChange({ ...filters, dateTo: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Categories */}
              {availableCategories.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Categories</Label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {availableCategories.map((category) => (
                      <Badge
                        key={category}
                        variant={
                          filters.categories.includes(category)
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer"
                        onClick={() => toggleCategory(category)}
                      >
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear button when filters active */}
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Active category badges */}
      {filters.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.categories.map((category) => (
            <Badge
              key={category}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {category}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={() => toggleCategory(category)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
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

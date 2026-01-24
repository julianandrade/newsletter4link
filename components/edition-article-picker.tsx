"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Types
export interface Article {
  id: string;
  title: string;
  sourceUrl: string;
  author: string | null;
  publishedAt: string;
  relevanceScore: number | null;
  summary: string | null;
  category: string[];
  status: string;
  createdAt: string;
  editionCount?: number;
}

export interface EditionArticlePickerProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[], orderedArticles: Article[]) => void;
  initialArticles?: Article[];
  className?: string;
}

export function EditionArticlePicker({
  selectedIds,
  onSelectionChange,
  initialArticles = [],
  className,
}: EditionArticlePickerProps) {
  // State
  const [availableArticles, setAvailableArticles] = useState<Article[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Article[]>(
    initialArticles.filter((a) => selectedIds.includes(a.id))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Fetch available articles
  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set("search", searchQuery);
      }

      const response = await fetch(`/api/articles/approved?${params}`);
      const data = await response.json();

      if (data.success) {
        setAvailableArticles(data.data);
      } else {
        setError(data.error || "Failed to fetch articles");
      }
    } catch (err) {
      setError("Failed to fetch articles");
      console.error("Error fetching articles:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Initial fetch and on search change
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchArticles();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [fetchArticles]);

  // Sync selected articles when selectedIds prop changes
  useEffect(() => {
    if (initialArticles.length > 0 && selectedIds.length > 0) {
      const orderedSelected = selectedIds
        .map((id) => initialArticles.find((a) => a.id === id))
        .filter(Boolean) as Article[];
      setSelectedArticles(orderedSelected);
    }
  }, [selectedIds, initialArticles]);

  // Add article to selection
  const handleAddArticle = (article: Article) => {
    if (selectedArticles.find((a) => a.id === article.id)) return;

    const newSelected = [...selectedArticles, article];
    setSelectedArticles(newSelected);
    onSelectionChange(
      newSelected.map((a) => a.id),
      newSelected
    );
  };

  // Remove article from selection
  const handleRemoveArticle = (articleId: string) => {
    const newSelected = selectedArticles.filter((a) => a.id !== articleId);
    setSelectedArticles(newSelected);
    onSelectionChange(
      newSelected.map((a) => a.id),
      newSelected
    );
  };

  // Move article up in order
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSelected = [...selectedArticles];
    [newSelected[index - 1], newSelected[index]] = [
      newSelected[index],
      newSelected[index - 1],
    ];
    setSelectedArticles(newSelected);
    onSelectionChange(
      newSelected.map((a) => a.id),
      newSelected
    );
  };

  // Move article down in order
  const handleMoveDown = (index: number) => {
    if (index === selectedArticles.length - 1) return;
    const newSelected = [...selectedArticles];
    [newSelected[index], newSelected[index + 1]] = [
      newSelected[index + 1],
      newSelected[index],
    ];
    setSelectedArticles(newSelected);
    onSelectionChange(
      newSelected.map((a) => a.id),
      newSelected
    );
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSelected = [...selectedArticles];
    const [draggedItem] = newSelected.splice(draggedIndex, 1);
    newSelected.splice(index, 0, draggedItem);
    setSelectedArticles(newSelected);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      onSelectionChange(
        selectedArticles.map((a) => a.id),
        selectedArticles
      );
    }
    setDraggedIndex(null);
  };

  // Filter available articles to exclude already selected
  const filteredAvailable = availableArticles.filter(
    (article) => !selectedArticles.find((s) => s.id === article.id)
  );

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-4", className)}>
      {/* Available Articles Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Available Articles
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 text-sm text-destructive">
                {error}
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                {searchQuery
                  ? "No articles match your search"
                  : "No approved articles available"}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAvailable.map((article) => (
                  <div
                    key={article.id}
                    className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium leading-tight line-clamp-2">
                          {article.title}
                        </h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleAddArticle(article)}
                        >
                          <Plus className="h-4 w-4" />
                          <span className="sr-only">Add article</span>
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        {article.relevanceScore && (
                          <Badge variant="secondary" className="text-xs">
                            Score: {article.relevanceScore.toFixed(1)}
                          </Badge>
                        )}
                        <span>{formatDate(article.publishedAt)}</span>
                        {article.author && (
                          <>
                            <span>·</span>
                            <span className="truncate">{article.author}</span>
                          </>
                        )}
                      </div>
                      {article.category.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {article.category.slice(0, 2).map((cat) => (
                            <Badge
                              key={cat}
                              variant="outline"
                              className="text-xs px-1.5 py-0"
                            >
                              {cat}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            {filteredAvailable.length} article
            {filteredAvailable.length !== 1 ? "s" : ""} available
          </div>
        </CardContent>
      </Card>

      {/* Selected Articles Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Selected Articles ({selectedArticles.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Drag to reorder or use the arrow buttons
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[400px] pr-4">
            {selectedArticles.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No articles selected. Add articles from the left panel.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedArticles.map((article, index) => (
                  <div
                    key={article.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "group flex items-start gap-2 p-3 rounded-lg border bg-card transition-all",
                      draggedIndex === index && "opacity-50 border-primary"
                    )}
                  >
                    {/* Drag Handle */}
                    <div className="cursor-grab active:cursor-grabbing pt-0.5">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Order Number */}
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {index + 1}
                    </div>

                    {/* Article Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium leading-tight line-clamp-2">
                        {article.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {article.relevanceScore && (
                          <Badge variant="secondary" className="text-xs">
                            {article.relevanceScore.toFixed(1)}
                          </Badge>
                        )}
                        <span>{formatDate(article.publishedAt)}</span>
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary inline-flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-3 w-3" />
                        <span className="sr-only">Move up</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === selectedArticles.length - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                        <span className="sr-only">Move down</span>
                      </Button>
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveArticle(article.id)}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove article</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            {selectedArticles.length} article
            {selectedArticles.length !== 1 ? "s" : ""} selected
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

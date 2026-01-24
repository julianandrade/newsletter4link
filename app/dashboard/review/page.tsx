"use client";

import { useEffect, useState, useCallback } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  X,
  ExternalLink,
  Edit2,
  FileSearch,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import {
  LayoutToggle,
  useLayoutPreference,
  type LayoutType,
} from "@/components/layout-toggle";
import {
  ArticleFiltersComponent,
  buildArticleQueryString,
  defaultArticleFilters,
  type ArticleFilters,
} from "@/components/article-filters";

interface Article {
  id: string;
  title: string;
  sourceUrl: string;
  author?: string;
  publishedAt: string;
  relevanceScore: number;
  summary: string | null;
  category: string[];
  status: string;
}

// Helper to extract source name from URL
function getSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^(www\.|blog\.|news\.)/, "").split(".")[0];
  } catch {
    return "Unknown";
  }
}

// Helper to format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Helper to get score badge styling
function getScoreBadgeStyle(score: number): string {
  if (score >= 8.0) {
    return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
  } else if (score >= 6.0) {
    return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
  } else {
    return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
  }
}

export default function ReviewPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [filters, setFilters] = useState<ArticleFilters>(defaultArticleFilters);
  const [layout, setLayout] = useLayoutPreference("review-layout", "cards");

  // Edit modal state
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editedSummary, setEditedSummary] = useState("");
  const [editedCategories, setEditedCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Expanded cards tracking
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      const queryString = buildArticleQueryString(filters);
      const res = await fetch(`/api/articles/pending?${queryString}`);
      const data = await res.json();
      if (data.success) {
        setArticles(data.data);
        if (data.meta?.categories) {
          setAvailableCategories(data.meta.categories);
        }
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/articles/${id}/approve`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setArticles(articles.filter((a) => a.id !== id));
      }
    } catch (error) {
      console.error("Error approving article:", error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`/api/articles/${id}/reject`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setArticles(articles.filter((a) => a.id !== id));
      }
    } catch (error) {
      console.error("Error rejecting article:", error);
    }
  };

  const openEditModal = (article: Article) => {
    setEditingArticle(article);
    setEditedSummary(article.summary || "");
    setEditedCategories([...article.category]);
    setNewCategory("");
  };

  const closeEditModal = () => {
    setEditingArticle(null);
    setEditedSummary("");
    setEditedCategories([]);
    setNewCategory("");
  };

  const saveEdits = async () => {
    if (!editingArticle) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/articles/${editingArticle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: editedSummary,
          category: editedCategories,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setArticles(
          articles.map((a) =>
            a.id === editingArticle.id
              ? { ...a, summary: editedSummary, category: editedCategories }
              : a
          )
        );
        closeEditModal();
      }
    } catch (error) {
      console.error("Error updating article:", error);
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !editedCategories.includes(trimmed)) {
      setEditedCategories([...editedCategories, trimmed]);
      setNewCategory("");
    }
  };

  const removeCategory = (cat: string) => {
    setEditedCategories(editedCategories.filter((c) => c !== cat));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Cards View
  const renderCardsView = () => (
    <div className="grid gap-4 md:grid-cols-2">
      {articles.map((article) => {
        const isExpanded = expandedIds.has(article.id);

        return (
          <Card key={article.id} className="relative overflow-hidden">
            <CardContent className="p-5">
              {/* Score Badge - Top Right */}
              <Badge
                variant="outline"
                className={`absolute top-4 right-4 font-semibold ${getScoreBadgeStyle(article.relevanceScore)}`}
              >
                {article.relevanceScore.toFixed(1)}
              </Badge>

              {/* Title - linked to original */}
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group block pr-14"
              >
                <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
                  {article.title}
                  <ExternalLink className="inline-block ml-1.5 h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
              </a>

              {/* Source + Date */}
              <p className="text-sm text-muted-foreground mt-2">
                <span className="capitalize">
                  {getSourceName(article.sourceUrl)}
                </span>
                {article.author && (
                  <>
                    {" "}
                    <span className="text-muted-foreground/50">by</span>{" "}
                    {article.author}
                  </>
                )}
                <span className="mx-2 text-muted-foreground/50">{"\u2022"}</span>
                {formatDate(article.publishedAt)}
              </p>

              {/* Categories */}
              {article.category.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {article.category.map((cat) => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div className="mt-4">
                <p
                  className={`text-sm text-muted-foreground ${!isExpanded ? "line-clamp-3" : ""}`}
                >
                  {article.summary || "No summary available."}
                </p>
                {(article.summary?.length || 0) > 200 && (
                  <button
                    onClick={() => toggleExpanded(article.id)}
                    className="text-xs text-primary hover:underline mt-1 flex items-center gap-0.5"
                  >
                    {isExpanded ? (
                      <>
                        Show less <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        Show more <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Actions Row */}
              <div className="flex items-center gap-2 mt-5 pt-4 border-t">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEditModal(article)}
                  className="text-muted-foreground"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReject(article.id)}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <X className="w-4 h-4 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApprove(article.id)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  // Compact Cards View
  const renderCompactView = () => (
    <div className="space-y-2">
      {articles.map((article) => (
        <Card key={article.id} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Score */}
              <Badge
                variant="outline"
                className={`shrink-0 font-semibold ${getScoreBadgeStyle(article.relevanceScore)}`}
              >
                {article.relevanceScore.toFixed(1)}
              </Badge>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {/* Title */}
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors line-clamp-1">
                        {article.title}
                        <ExternalLink className="inline-block ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                    </a>

                    {/* Meta */}
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="capitalize">
                        {getSourceName(article.sourceUrl)}
                      </span>
                      <span className="mx-1.5">{"\u2022"}</span>
                      {formatDate(article.publishedAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditModal(article)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReject(article.id)}
                      className="h-8 w-8 p-0 hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(article.id)}
                      className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Categories + Summary */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {article.category.slice(0, 3).map((cat) => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {cat}
                    </Badge>
                  ))}
                  {article.category.length > 3 && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      +{article.category.length - 3}
                    </Badge>
                  )}
                </div>

                {article.summary && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {article.summary}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // Table View
  const renderTableView = () => (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left font-medium px-4 py-3 w-16">Score</th>
              <th className="text-left font-medium px-4 py-3">Title</th>
              <th className="text-left font-medium px-4 py-3 w-32">Source</th>
              <th className="text-left font-medium px-4 py-3 w-28">Date</th>
              <th className="text-left font-medium px-4 py-3 w-48">Categories</th>
              <th className="text-right font-medium px-4 py-3 w-36">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {articles.map((article) => (
              <tr key={article.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={`font-semibold ${getScoreBadgeStyle(article.relevanceScore)}`}
                  >
                    {article.relevanceScore.toFixed(1)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group hover:text-primary transition-colors line-clamp-2"
                  >
                    {article.title}
                    <ExternalLink className="inline-block ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </td>
                <td className="px-4 py-3 text-muted-foreground capitalize">
                  {getSourceName(article.sourceUrl)}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {formatDate(article.publishedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {article.category.slice(0, 2).map((cat) => (
                      <Badge
                        key={cat}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {cat}
                      </Badge>
                    ))}
                    {article.category.length > 2 && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        +{article.category.length - 2}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditModal(article)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReject(article.id)}
                      className="h-8 w-8 p-0 hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(article.id)}
                      className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (layout) {
      case "compact":
        return renderCompactView();
      case "table":
        return renderTableView();
      default:
        return renderCardsView();
    }
  };

  if (loading && articles.length === 0) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Review Articles" />
        <main className="flex-1 p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Review Articles" />

      <main className="flex-1 p-6 space-y-6">
        {/* Header with count badge and layout toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Pending Review</h2>
            <Badge variant="secondary" className="text-sm">
              {articles.length} article{articles.length !== 1 ? "s" : ""}
            </Badge>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <LayoutToggle value={layout} onChange={setLayout} />
        </div>

        {/* Filters */}
        <ArticleFiltersComponent
          filters={filters}
          onChange={setFilters}
          availableCategories={availableCategories}
        />

        {articles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <FileSearch className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-lg mb-2">No articles found</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                {filters.search || filters.categories.length > 0
                  ? "No articles match your current filters. Try adjusting your search criteria."
                  : "Run the curation pipeline to fetch and score new articles from your RSS feeds."}
              </p>
              {filters.search || filters.categories.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => setFilters(defaultArticleFilters)}
                >
                  Clear Filters
                </Button>
              ) : (
                <Button
                  onClick={() => (window.location.href = "/api/curation/collect")}
                >
                  Run Curation Now
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          renderContent()
        )}
      </main>

      {/* Edit Modal */}
      <Dialog open={!!editingArticle} onOpenChange={(open) => !open && closeEditModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Article</DialogTitle>
            <DialogDescription>
              Edit the summary and categories for this article. Title and URL are read-only.
            </DialogDescription>
          </DialogHeader>

          {editingArticle && (
            <div className="space-y-4">
              {/* Read-only title */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">Title</Label>
                <p className="text-sm font-medium">{editingArticle.title}</p>
              </div>

              {/* Read-only URL */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">Source URL</Label>
                <a
                  href={editingArticle.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  {editingArticle.sourceUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Editable summary */}
              <div className="space-y-1.5">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={4}
                  placeholder="Enter article summary..."
                />
              </div>

              {/* Editable categories */}
              <div className="space-y-1.5">
                <Label>Categories</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editedCategories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {cat}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-transparent"
                        onClick={() => removeCategory(cat)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Add category..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategory();
                      }
                    }}
                  />
                  <Button variant="outline" onClick={addCategory} disabled={!newCategory.trim()}>
                    Add
                  </Button>
                </div>
                {/* Suggested categories from available */}
                {availableCategories.filter(
                  (c) => !editedCategories.includes(c)
                ).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1.5">Suggestions:</p>
                    <div className="flex flex-wrap gap-1">
                      {availableCategories
                        .filter((c) => !editedCategories.includes(c))
                        .slice(0, 8)
                        .map((cat) => (
                          <Badge
                            key={cat}
                            variant="outline"
                            className="cursor-pointer hover:bg-secondary"
                            onClick={() =>
                              setEditedCategories([...editedCategories, cat])
                            }
                          >
                            + {cat}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button onClick={saveEdits} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

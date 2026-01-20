"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  X,
  ExternalLink,
  Edit2,
  Save,
  ChevronDown,
  ChevronUp,
  FileSearch,
} from "lucide-react";

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
    // Remove common prefixes
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedSummary, setEditedSummary] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      const res = await fetch("/api/articles/pending");
      const data = await res.json();
      if (data.success) {
        setArticles(data.data);
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/articles/${id}/approve`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        // Remove from list
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
        // Remove from list
        setArticles(articles.filter((a) => a.id !== id));
      }
    } catch (error) {
      console.error("Error rejecting article:", error);
    }
  };

  const startEditing = (article: Article) => {
    setEditingId(article.id);
    setEditedSummary(article.summary || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditedSummary("");
  };

  const saveSummary = async (id: string) => {
    try {
      const res = await fetch(`/api/articles/${id}/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: editedSummary }),
      });
      const data = await res.json();

      if (data.success) {
        // Update local state
        setArticles(
          articles.map((a) =>
            a.id === id ? { ...a, summary: editedSummary } : a
          )
        );
        setEditingId(null);
        setEditedSummary("");
      }
    } catch (error) {
      console.error("Error updating summary:", error);
    }
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

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Review Articles" />
        <main className="flex-1 p-6">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading articles...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Review Articles" />

      <main className="flex-1 p-6 space-y-6">
        {/* Header with count badge */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Pending Review</h2>
          <Badge variant="secondary" className="text-sm">
            {articles.length} article{articles.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {articles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <FileSearch className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-lg mb-2">No articles pending</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Run the curation pipeline to fetch and score new articles from
                your RSS feeds.
              </p>
              <Button
                onClick={() => (window.location.href = "/api/curation/collect")}
              >
                Run Curation Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {articles.map((article) => {
              const isExpanded = expandedIds.has(article.id);
              const summaryLines = article.summary?.split("\n") || [];
              const shouldTruncate =
                (article.summary?.length || 0) > 200 && !isExpanded;

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
                      <span className="mx-2 text-muted-foreground/50">
                        {"\u2022"}
                      </span>
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
                      {editingId === article.id ? (
                        <div className="space-y-3">
                          <Textarea
                            value={editedSummary}
                            onChange={(e) => setEditedSummary(e.target.value)}
                            rows={4}
                            className="w-full text-sm"
                            placeholder="Edit summary..."
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveSummary(article.id)}
                            >
                              <Save className="w-3.5 h-3.5 mr-1.5" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEditing}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
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
                                  Show less{" "}
                                  <ChevronUp className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  Show more{" "}
                                  <ChevronDown className="h-3 w-3" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center gap-2 mt-5 pt-4 border-t">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditing(article)}
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
        )}
      </main>
    </div>
  );
}

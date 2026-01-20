"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, ExternalLink, Edit2, Save, X } from "lucide-react";

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

export default function ReviewPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedSummary, setEditedSummary] = useState("");

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

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Review Articles</h1>
          <p className="text-slate-600">Loading articles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Review Articles</h1>
          <p className="text-slate-600 dark:text-slate-400">
            {articles.length} articles pending review
          </p>
        </div>

        {articles.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400">
                No articles pending review. Run the curation pipeline to fetch
                new articles.
              </p>
              <Button
                onClick={() => window.location.href = "/api/curation/collect"}
                className="mt-4"
              >
                Run Curation Now
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {articles.map((article) => (
              <Card key={article.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">
                          ⭐ {article.relevanceScore.toFixed(1)}/10
                        </Badge>
                        {article.category.map((cat) => (
                          <Badge key={cat} variant="outline">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                      <CardTitle className="text-xl mb-2">
                        {article.title}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                        {article.author && <span>{article.author}</span>}
                        <span>
                          {new Date(article.publishedAt).toLocaleDateString()}
                        </span>
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Source
                        </a>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">AI Summary:</h4>
                      {editingId !== article.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(article)}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>

                    {editingId === article.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editedSummary}
                          onChange={(e) => setEditedSummary(e.target.value)}
                          rows={4}
                          className="w-full"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveSummary(article.id)}
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEditing}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-700 dark:text-slate-300">
                        {article.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => handleApprove(article.id)}
                      className="flex-1"
                      variant="default"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleReject(article.id)}
                      className="flex-1"
                      variant="destructive"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

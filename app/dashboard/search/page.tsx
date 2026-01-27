"use client";

import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Search,
  Bookmark,
  ExternalLink,
  Download,
  Sparkles,
  Clock,
  Globe,
  TrendingUp,
  Plus,
  Play,
  Trash2,
  X,
} from "lucide-react";

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  publishedAt?: string;
  source?: string;
  aiScore: number;
  aiSummary: string;
  aiTopics: string[];
  aiSentiment: string;
  aiRelevanceNote: string;
}

interface SearchTopic {
  id: string;
  name: string;
  description?: string;
  query: string;
  schedule: string;
  timeRange: string;
  isActive: boolean;
  lastRunAt?: string;
  resultCount: number;
}

interface QueryExpansion {
  original: string;
  expanded: string;
  analysis: {
    intent: string;
    timeScope: string;
    topics: string[];
  };
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [queryExpansion, setQueryExpansion] = useState<QueryExpansion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [topics, setTopics] = useState<SearchTopic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<SearchTopic | null>(null);
  const [topicResults, setTopicResults] = useState<SearchResult[]>([]);
  const [isRunningTopic, setIsRunningTopic] = useState(false);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicQuery, setNewTopicQuery] = useState("");
  const [newTopicSchedule, setNewTopicSchedule] = useState("MANUAL");
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);

  const [importingId, setImportingId] = useState<string | null>(null);

  // Load saved topics on mount
  useState(() => {
    loadTopics();
  });

  const loadTopics = async () => {
    setIsLoadingTopics(true);
    try {
      const res = await fetch("/api/search/topics");
      const data = await res.json();
      if (data.success) {
        setTopics(data.data);
      }
    } catch (e) {
      console.error("Failed to load topics:", e);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setError(null);
    setResults([]);
    setQueryExpansion(null);

    try {
      const res = await fetch("/api/search/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), maxResults: 15 }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }

      setResults(data.data.results || []);
      setQueryExpansion(data.data.queryExpansion || null);
    } catch (e) {
      setError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicName.trim() || !newTopicQuery.trim() || isCreatingTopic) return;

    setIsCreatingTopic(true);
    try {
      const res = await fetch("/api/search/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTopicName.trim(),
          query: newTopicQuery.trim(),
          schedule: newTopicSchedule,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTopics([data.data, ...topics]);
        setIsCreateDialogOpen(false);
        setNewTopicName("");
        setNewTopicQuery("");
        setNewTopicSchedule("MANUAL");
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to create topic");
    } finally {
      setIsCreatingTopic(false);
    }
  };

  const handleRunTopic = async (topic: SearchTopic) => {
    setSelectedTopic(topic);
    setIsRunningTopic(true);
    setTopicResults([]);

    try {
      const res = await fetch(`/api/search/topics/${topic.id}`, {
        method: "POST",
      });

      const data = await res.json();
      if (data.success) {
        setTopicResults(data.data.results || []);
        // Update topic in list
        setTopics(topics.map((t) =>
          t.id === topic.id ? { ...t, lastRunAt: new Date().toISOString(), resultCount: data.data.results?.length || 0 } : t
        ));
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to run search");
    } finally {
      setIsRunningTopic(false);
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    try {
      const res = await fetch(`/api/search/topics/${topicId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setTopics(topics.filter((t) => t.id !== topicId));
        if (selectedTopic?.id === topicId) {
          setSelectedTopic(null);
          setTopicResults([]);
        }
      }
    } catch (e) {
      setError("Failed to delete topic");
    }
  };

  const handleImportResult = async (result: SearchResult, topicId?: string) => {
    // For ad-hoc search results, we'd need to save them first
    // For now, this only works with topic results that have IDs
    if (!topicId) {
      setError("Import only available for saved topic results");
      return;
    }

    setImportingId(result.url);
    try {
      // Find the result ID from topic results - we need to fetch it
      const topicRes = await fetch(`/api/search/topics/${topicId}`);
      const topicData = await topicRes.json();

      if (!topicData.success) {
        setError("Failed to find result");
        return;
      }

      const searchResult = topicData.data.results?.find((r: { url: string }) => r.url === result.url);
      if (!searchResult?.id) {
        setError("Result not found");
        return;
      }

      const res = await fetch(`/api/search/results/${searchResult.id}/import`, {
        method: "POST",
      });

      const data = await res.json();
      if (data.success) {
        // Show success - could use toast
        alert(data.alreadyExisted ? "Article already exists" : "Article imported successfully!");
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to import result");
    } finally {
      setImportingId(null);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-600 bg-green-100";
    if (score >= 6) return "text-yellow-600 bg-yellow-100";
    if (score >= 4) return "text-orange-600 bg-orange-100";
    return "text-red-600 bg-red-100";
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === "positive") return "bg-green-100 text-green-700";
    if (sentiment === "negative") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Trend Radar" />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <TrendingUp className="h-8 w-8" />
              Trend Radar
            </h1>
            <p className="text-muted-foreground mt-1">
              AI-powered web search for content discovery
            </p>
          </div>
        </div>

        <Tabs defaultValue="search" className="space-y-6">
          <TabsList>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Quick Search
            </TabsTrigger>
            <TabsTrigger value="topics" className="flex items-center gap-2">
              <Bookmark className="h-4 w-4" />
              Saved Topics
            </TabsTrigger>
          </TabsList>

          {/* Quick Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Search the Web</CardTitle>
                <CardDescription>
                  Enter a natural language query to find relevant content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSearch} className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g., What's trending in AI agents for enterprise?"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-10"
                        disabled={isSearching}
                      />
                    </div>
                    <Button type="submit" disabled={isSearching || !query.trim()}>
                      {isSearching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Search
                        </>
                      )}
                    </Button>
                  </div>

                  {queryExpansion && (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4" />
                        <span className="font-medium">AI Analysis:</span>
                        <Badge variant="outline">{queryExpansion.analysis.intent}</Badge>
                        <Badge variant="outline">{queryExpansion.analysis.timeScope}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {queryExpansion.analysis.topics.map((topic) => (
                          <Badge key={topic} variant="secondary" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>

            {error && (
              <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">
                  Found {results.length} results
                </h2>
                {results.map((result, index) => (
                  <SearchResultCard
                    key={`${result.url}-${index}`}
                    result={result}
                    onImport={() => handleImportResult(result)}
                    isImporting={importingId === result.url}
                    getScoreColor={getScoreColor}
                    getSentimentColor={getSentimentColor}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Saved Topics Tab */}
          <TabsContent value="topics" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Saved Search Topics</h2>
                <p className="text-sm text-muted-foreground">
                  Create watchlists for ongoing monitoring
                </p>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Topic
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Search Topic</DialogTitle>
                    <DialogDescription>
                      Save a search query for regular monitoring
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="topic-name">Topic Name</Label>
                      <Input
                        id="topic-name"
                        placeholder="e.g., DORA Regulation News"
                        value={newTopicName}
                        onChange={(e) => setNewTopicName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="topic-query">Search Query</Label>
                      <Textarea
                        id="topic-query"
                        placeholder="e.g., DORA regulation banking Europe 2026"
                        value={newTopicQuery}
                        onChange={(e) => setNewTopicQuery(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="topic-schedule">Schedule</Label>
                      <Select value={newTopicSchedule} onValueChange={setNewTopicSchedule}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MANUAL">Manual only</SelectItem>
                          <SelectItem value="DAILY">Daily</SelectItem>
                          <SelectItem value="WEEKLY">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTopic} disabled={isCreatingTopic}>
                      {isCreatingTopic ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Topic"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Topics List */}
              <div className="space-y-3">
                {isLoadingTopics ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : topics.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground">
                    No saved topics yet. Create one to start monitoring.
                  </Card>
                ) : (
                  topics.map((topic) => (
                    <Card
                      key={topic.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedTopic?.id === topic.id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedTopic(topic)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{topic.name}</h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {topic.query}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {topic.schedule}
                              </Badge>
                              <span>{topic.resultCount} results</span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunTopic(topic);
                              }}
                              disabled={isRunningTopic}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTopic(topic.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Topic Results */}
              <div className="md:col-span-2 space-y-4">
                {selectedTopic ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedTopic.name}</h3>
                        <p className="text-sm text-muted-foreground">{selectedTopic.query}</p>
                      </div>
                      <Button
                        onClick={() => handleRunTopic(selectedTopic)}
                        disabled={isRunningTopic}
                      >
                        {isRunningTopic ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Searching...
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Run Search
                          </>
                        )}
                      </Button>
                    </div>

                    {topicResults.length > 0 ? (
                      <div className="space-y-3">
                        {topicResults.map((result, index) => (
                          <SearchResultCard
                            key={`${result.url}-${index}`}
                            result={result}
                            onImport={() => handleImportResult(result, selectedTopic.id)}
                            isImporting={importingId === result.url}
                            getScoreColor={getScoreColor}
                            getSentimentColor={getSentimentColor}
                            compact
                          />
                        ))}
                      </div>
                    ) : (
                      <Card className="p-8 text-center text-muted-foreground">
                        {isRunningTopic ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p>Searching the web...</p>
                          </div>
                        ) : (
                          <p>Click "Run Search" to fetch results</p>
                        )}
                      </Card>
                    )}
                  </>
                ) : (
                  <Card className="p-8 text-center text-muted-foreground">
                    Select a topic to view its results
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// Search Result Card Component
function SearchResultCard({
  result,
  onImport,
  isImporting,
  getScoreColor,
  getSentimentColor,
  compact = false,
}: {
  result: SearchResult;
  onImport: () => void;
  isImporting: boolean;
  getScoreColor: (score: number) => string;
  getSentimentColor: (sentiment: string) => string;
  compact?: boolean;
}) {
  return (
    <Card className={compact ? "p-3" : ""}>
      <CardContent className={compact ? "p-0" : "p-4"}>
        <div className="flex items-start gap-4">
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-lg font-bold ${getScoreColor(
              result.aiScore
            )}`}
          >
            {result.aiScore.toFixed(1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline line-clamp-2"
                >
                  {result.title}
                </a>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Globe className="h-3 w-3" />
                  <span className="truncate">{result.source}</span>
                  {result.publishedAt && (
                    <>
                      <Clock className="h-3 w-3 ml-2" />
                      <span>{new Date(result.publishedAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" asChild>
                  <a href={result.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="sm" onClick={onImport} disabled={isImporting}>
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {result.aiSummary || result.snippet}
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="outline" className={getSentimentColor(result.aiSentiment)}>
                {result.aiSentiment}
              </Badge>
              {result.aiTopics.slice(0, 3).map((topic) => (
                <Badge key={topic} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>

            {result.aiRelevanceNote && !compact && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                {result.aiRelevanceNote}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

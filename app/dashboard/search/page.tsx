"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Plan } from "@prisma/client";
import { AppHeader } from "@/components/app-header";
import { FeatureGate } from "@/components/upgrade-prompt";
import { hasFeature } from "@/lib/plans/features";
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
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  StopCircle,
  History,
  ChevronDown,
  ChevronRight,
  Save,
  ArrowRight,
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

interface SearchProgress {
  stage: string;
  progress: number;
  message: string;
  analyzing?: {
    current: number;
    total: number;
    title: string;
  };
}

interface SearchHistoryItem {
  id: string;
  query: string;
  queryExpanded?: string;
  queryAnalysis?: {
    intent: string;
    timeScope: string;
    topics: string[];
  };
  resultCount: number;
  searchedAt: string;
  convertedToTopicId?: string | null;
  results?: SearchResult[];
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null);
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

  // Search history state
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [isLoadingHistoryResults, setIsLoadingHistoryResults] = useState<string | null>(null);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [lastSavedSearchId, setLastSavedSearchId] = useState<string | null>(null);
  const [convertingHistoryId, setConvertingHistoryId] = useState<string | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Organization plan for feature gating
  const [orgPlan, setOrgPlan] = useState<Plan>("FREE");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  // Ref to track if we've checked for running jobs
  const hasCheckedRunningJob = useRef(false);

  const fetchOrganization = useCallback(async () => {
    try {
      const res = await fetch("/api/organizations/current");
      if (res.ok) {
        const data = await res.json();
        setOrgPlan(data.organization?.plan || "FREE");
        setOrgId(data.organization?.id || null);
      }
    } catch (err) {
      console.error("Failed to fetch organization:", err);
    } finally {
      setIsLoadingOrg(false);
    }
  }, []);

  // Check for a running search job on page load
  const checkForRunningJob = useCallback(async () => {
    if (!orgId) return;

    try {
      // Check if there's a running SEARCH job
      const res = await fetch("/api/jobs?type=SEARCH&status=RUNNING");
      if (!res.ok) return;

      const data = await res.json();
      if (data.jobs && data.jobs.length > 0) {
        const runningJob = data.jobs[0];
        setCurrentJobId(runningJob.id);
        setIsSearching(true);

        // Resume progress display
        if (runningJob.currentStage) {
          setSearchProgress({
            stage: runningJob.currentStage,
            progress: runningJob.progress || 0,
            message: `Resuming ${runningJob.currentStage}...`,
          });
        }

        // Note: We can't reconnect to the SSE stream, but the job is still running
        // The user can wait for it to complete or cancel it
      }
    } catch (err) {
      console.error("Failed to check for running job:", err);
    }
  }, [orgId]);

  const loadTopics = useCallback(async () => {
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
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/search/history?page=${page}&limit=10`);
      const data = await res.json();
      if (data.history) {
        setHistory(data.history);
        setHistoryPage(data.page);
        setHistoryTotalPages(data.totalPages);
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Load organization, saved topics, and history on mount
  useEffect(() => {
    // Defer to a microtask so loading flags are not set synchronously within
    // the effect (prevents cascading renders).
    void Promise.resolve().then(() => {
      fetchOrganization();
      loadTopics();
      loadHistory(1);
    });
  }, [fetchOrganization, loadTopics, loadHistory]);

  // Check for running job on mount (after we have orgId)
  useEffect(() => {
    if (orgId && !hasCheckedRunningJob.current) {
      hasCheckedRunningJob.current = true;
      checkForRunningJob();
    }
  }, [orgId, checkForRunningJob]);

  const handleSaveSearch = async () => {
    if (isSavingSearch || results.length === 0 || !queryExpansion) return;

    setIsSavingSearch(true);
    try {
      const res = await fetch("/api/search/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          queryExpanded: queryExpansion.expanded,
          queryAnalysis: queryExpansion.analysis,
          results: results,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLastSavedSearchId(data.id);
        toast.success("Search saved");
        // Reload history to show the new entry
        loadHistory(1);
      } else {
        toast.error(data.error || "Failed to save search");
      }
    } catch (e) {
      toast.error("Failed to save search");
    } finally {
      setIsSavingSearch(false);
    }
  };

  const handleExpandHistory = async (historyId: string) => {
    // Toggle off if already expanded
    if (expandedHistoryId === historyId) {
      setExpandedHistoryId(null);
      return;
    }

    // Check if we already have results loaded
    const item = history.find((h) => h.id === historyId);
    if (item?.results) {
      setExpandedHistoryId(historyId);
      return;
    }

    // Load full results
    setIsLoadingHistoryResults(historyId);
    try {
      const res = await fetch(`/api/search/history/${historyId}`);
      const data = await res.json();
      if (res.ok) {
        // Update history item with full results
        setHistory((prev) =>
          prev.map((h) =>
            h.id === historyId ? { ...h, results: data.results || [] } : h
          )
        );
        setExpandedHistoryId(historyId);
      } else {
        toast.error(data.error || "Failed to load results");
      }
    } catch (e) {
      toast.error("Failed to load results");
    } finally {
      setIsLoadingHistoryResults(null);
    }
  };

  const handleConvertToTopic = async (historyId: string) => {
    setConvertingHistoryId(historyId);
    try {
      const res = await fetch(`/api/search/history/${historyId}/convert`, {
        method: "POST",
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Converted to topic");
        // Update history item to show it's converted
        setHistory((prev) =>
          prev.map((h) =>
            h.id === historyId ? { ...h, convertedToTopicId: data.topicId } : h
          )
        );
        // Reload topics list
        loadTopics();
      } else {
        toast.error(data.error || "Failed to convert to topic");
      }
    } catch (e) {
      toast.error("Failed to convert to topic");
    } finally {
      setConvertingHistoryId(null);
    }
  };

  const handleDeleteHistory = async (historyId: string) => {
    setDeletingHistoryId(historyId);
    try {
      const res = await fetch(`/api/search/history/${historyId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Search deleted");
        // Remove from list
        setHistory((prev) => prev.filter((h) => h.id !== historyId));
        // Close expanded if it was this one
        if (expandedHistoryId === historyId) {
          setExpandedHistoryId(null);
        }
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete");
      }
    } catch (e) {
      toast.error("Failed to delete");
    } finally {
      setDeletingHistoryId(null);
      setDeleteConfirmId(null);
    }
  };

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setError(null);
    setResults([]);
    setQueryExpansion(null);
    setLastSavedSearchId(null);
    setSearchProgress({
      stage: "starting",
      progress: 0,
      message: "Connecting...",
    });

    try {
      // Build URL with query params
      const params = new URLSearchParams({
        query: query.trim(),
        maxResults: "15",
      });

      const response = await fetch(`/api/search/stream?${params}`, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Search failed");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      const processEvent = (eventType: string, dataStr: string) => {
        try {
          const data = JSON.parse(dataStr);
          switch (eventType) {
            case "start":
              setCurrentJobId(data.jobId);
              setSearchProgress({
                stage: "starting",
                progress: 0,
                message: data.message || "Starting search...",
              });
              break;

            case "progress": {
              // Handle different progress stages
              const stage = data.stage || "processing";
              const progressInfo: SearchProgress = {
                stage,
                progress: data.progress || 0,
                message: data.message || "Processing...",
              };

              // Check if this is query_expanded event (encoded in message)
              if (stage === "query_expanded" && data.message) {
                try {
                  const expandedData = JSON.parse(data.message);
                  setQueryExpansion({
                    original: expandedData.original,
                    expanded: expandedData.expanded,
                    analysis: {
                      intent: expandedData.intent,
                      timeScope: expandedData.timeScope,
                      topics: expandedData.topics || [],
                    },
                  });
                  progressInfo.message = "Query analyzed";
                } catch {
                  // Not JSON, use as-is
                }
              }

              // Check if this is analyzing stage with details
              if (stage === "analyzing" && data.message) {
                try {
                  const analyzeData = JSON.parse(data.message);
                  if (analyzeData.current !== undefined) {
                    progressInfo.analyzing = {
                      current: analyzeData.current,
                      total: analyzeData.total,
                      title: analyzeData.title || "Analyzing...",
                    };
                    progressInfo.message = `Analyzing ${analyzeData.current}/${analyzeData.total}`;
                  }
                } catch {
                  // Not JSON, use as-is
                }
              }

              setSearchProgress(progressInfo);
              break;
            }

            case "complete":
              setCurrentJobId(null);
              setSearchProgress({
                stage: "complete",
                progress: 100,
                message: "Search complete!",
              });

              // Extract results and query expansion
              if (data.result) {
                setResults(data.result.results || []);
                if (data.result.queryExpansion) {
                  setQueryExpansion(data.result.queryExpansion);
                }
              }

              // Clear progress after short delay
              setTimeout(() => {
                setIsSearching(false);
                setSearchProgress(null);
              }, 1000);
              break;

            case "cancelled":
              setCurrentJobId(null);
              setIsSearching(false);
              setIsCancelling(false);
              setSearchProgress(null);
              setError("Search was cancelled");
              break;

            case "error":
              setCurrentJobId(null);
              setIsSearching(false);
              setSearchProgress(null);
              setError(data.error || "Search failed");
              break;
          }
        } catch {
          // Ignore parse errors
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.substring(6);
            }
          }

          if (dataStr) {
            processEvent(eventType, dataStr);
          }
        }
      }
    } catch (err) {
      console.error("Search failed:", err);
      setError(err instanceof Error ? err.message : "Search failed");
      setIsSearching(false);
      setSearchProgress(null);
      setCurrentJobId(null);
    }
  }, [query, isSearching]);

  const handleCancelSearch = async () => {
    if (!currentJobId) return;

    setIsCancelling(true);
    try {
      const res = await fetch("/api/search/cancel", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      // The SSE stream will receive the cancelled event
      setSearchProgress((prev) =>
        prev ? { ...prev, message: "Cancelling..." } : null
      );
    } catch (err) {
      console.error("Failed to cancel search:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel");
      setIsCancelling(false);
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
    setImportingId(result.url);
    setError(null);

    try {
      let res: Response;

      if (topicId) {
        // For saved topic results, use the existing endpoint that looks up SearchResult by ID
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

        res = await fetch(`/api/search/results/${searchResult.id}/import`, {
          method: "POST",
        });
      } else {
        // For ad-hoc search results, use direct import endpoint
        res = await fetch("/api/search/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            content: result.content,
            publishedAt: result.publishedAt,
            aiScore: result.aiScore,
            aiSummary: result.aiSummary,
            aiTopics: result.aiTopics,
          }),
        });
      }

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

  const hasTrendRadarAccess = hasFeature(orgPlan, "trendRadar");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Trend Radar" />

      <FeatureGate
        feature="trendRadar"
        currentPlan={orgPlan}
        hasAccess={hasTrendRadarAccess || isLoadingOrg}
      >
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
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
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
                    {isSearching ? (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleCancelSearch}
                        disabled={isCancelling}
                      >
                        {isCancelling ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          <>
                            <StopCircle className="mr-2 h-4 w-4" />
                            Cancel
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button type="submit" disabled={!query.trim()}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Search
                      </Button>
                    )}
                  </div>

                  {/* Search Progress */}
                  {isSearching && searchProgress && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="font-medium text-sm">
                            {searchProgress.stage === "query_expanded" && "Query analyzed"}
                            {searchProgress.stage === "searching" && "Searching the web"}
                            {searchProgress.stage === "analyzing" && "Analyzing results"}
                            {searchProgress.stage === "starting" && "Starting search"}
                            {searchProgress.stage === "query_processing" && "Processing query"}
                            {searchProgress.stage === "complete" && "Search complete"}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {Math.round(searchProgress.progress)}%
                        </span>
                      </div>
                      <Progress value={searchProgress.progress} className="h-2" />
                      {searchProgress.analyzing && (
                        <p className="text-sm text-muted-foreground">
                          Analyzing: {searchProgress.analyzing.title}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Query Expansion Preview - shows immediately when available */}
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Found {results.length} results
                  </h2>
                  {!isSearching && !lastSavedSearchId && (
                    <Button
                      variant="outline"
                      onClick={handleSaveSearch}
                      disabled={isSavingSearch}
                    >
                      {isSavingSearch ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Search
                        </>
                      )}
                    </Button>
                  )}
                  {lastSavedSearchId && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <History className="h-3 w-3" />
                      Saved
                    </Badge>
                  )}
                </div>
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

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Search History</h2>
              <p className="text-sm text-muted-foreground">
                View and manage your past searches
              </p>
            </div>

            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No search history yet.</p>
                <p className="text-sm mt-1">
                  Perform a search and save it to see it here.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <Collapsible
                    key={item.id}
                    open={expandedHistoryId === item.id}
                    onOpenChange={() => handleExpandHistory(item.id)}
                  >
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="p-0 h-auto">
                              {isLoadingHistoryResults === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : expandedHistoryId === item.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium line-clamp-1">
                                  {item.query}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Search className="h-3 w-3" />
                                    {item.resultCount} results
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(item.searchedAt).toLocaleDateString()}
                                  </span>
                                  {item.convertedToTopicId && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Bookmark className="h-3 w-3 mr-1" />
                                      Topic
                                    </Badge>
                                  )}
                                </div>
                                {item.queryAnalysis && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {item.queryAnalysis.intent}
                                    </Badge>
                                    {item.queryAnalysis.topics?.slice(0, 3).map((topic) => (
                                      <Badge key={topic} variant="secondary" className="text-xs">
                                        {topic}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-1 shrink-0">
                                {!item.convertedToTopicId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConvertToTopic(item.id);
                                    }}
                                    disabled={convertingHistoryId === item.id}
                                    title="Convert to Topic"
                                  >
                                    {convertingHistoryId === item.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <ArrowRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmId(item.id);
                                  }}
                                  disabled={deletingHistoryId === item.id}
                                  title="Delete"
                                >
                                  {deletingHistoryId === item.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <CollapsibleContent>
                          <div className="mt-4 pt-4 border-t space-y-3">
                            {item.results && item.results.length > 0 ? (
                              <>
                                <p className="text-sm text-muted-foreground">
                                  Showing {item.results.length} saved results
                                </p>
                                {item.results.slice(0, 5).map((result, idx) => (
                                  <SearchResultCard
                                    key={`${result.url}-${idx}`}
                                    result={result}
                                    onImport={() => handleImportResult(result)}
                                    isImporting={importingId === result.url}
                                    getScoreColor={getScoreColor}
                                    getSentimentColor={getSentimentColor}
                                    compact
                                  />
                                ))}
                                {item.results.length > 5 && (
                                  <p className="text-sm text-muted-foreground text-center py-2">
                                    + {item.results.length - 5} more results
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No results stored
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </CardContent>
                    </Card>
                  </Collapsible>
                ))}

                {/* Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadHistory(historyPage - 1)}
                      disabled={historyPage <= 1 || isLoadingHistory}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {historyPage} of {historyTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadHistory(historyPage + 1)}
                      disabled={historyPage >= historyTotalPages || isLoadingHistory}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          </Tabs>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Search History</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this saved search? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteConfirmId && handleDeleteHistory(deleteConfirmId)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </FeatureGate>
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

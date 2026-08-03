"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plan } from "@prisma/client";
import { AppHeader } from "@/components/app-header";
import { FeatureGate } from "@/components/upgrade-prompt";
import { hasFeature } from "@/lib/plans/features";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import { SearchIcon } from "@/components/radar/icons";
import { cn } from "@/lib/utils";
import { HistoryPanel, SearchResultRow, WatchlistsPanel } from "./panels";
import type {
  QueryExpansion,
  SearchHistoryItem,
  SearchProgress,
  SearchResult,
  SearchTopic,
} from "./types";

type View = "search" | "watchlists" | "history";

type Schedule = "MANUAL" | "DAILY" | "WEEKLY";

/** Stage names the SSE stream emits, in the reader's language. */
const STAGE_LABEL: Record<string, string> = {
  starting: "Starting search",
  query_processing: "Reading the question",
  query_expanded: "Question analysed",
  searching: "Searching the web",
  analyzing: "Scoring results",
  complete: "Search complete",
};

/** Shown on an empty search view: three shapes of question that work here. */
const EXAMPLES = [
  "agentic AI in banking, last 6 months",
  "EU AI Act enforcement actions",
  "RAG versus long context, serving cost",
];

/**
 * Stored rows come straight from Prisma, where every AI column is nullable and
 * dates arrive as ISO strings. Normalise once so the row component can trust it.
 */
function normaliseStoredResults(rows: unknown): SearchResult[] {
  if (!Array.isArray(rows)) return [];

  return rows.map((row: Record<string, unknown>) => ({
    url: String(row.url ?? ""),
    title: String(row.title ?? ""),
    snippet: typeof row.snippet === "string" ? row.snippet : "",
    content: typeof row.content === "string" ? row.content : undefined,
    publishedAt:
      typeof row.publishedAt === "string" ? row.publishedAt : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    aiScore: typeof row.aiScore === "number" ? row.aiScore : null,
    aiSummary: typeof row.aiSummary === "string" ? row.aiSummary : "",
    aiTopics: Array.isArray(row.aiTopics) ? (row.aiTopics as string[]) : [],
    aiSentiment: typeof row.aiSentiment === "string" ? row.aiSentiment : "neutral",
    aiRelevanceNote:
      typeof row.aiRelevanceNote === "string" ? row.aiRelevanceNote : "",
  }));
}

export default function SearchPage() {
  const [view, setView] = useState<View>("search");

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
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
  const [isLoadingTopicResults, setIsLoadingTopicResults] = useState(false);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicQuery, setNewTopicQuery] = useState("");
  const [newTopicSchedule, setNewTopicSchedule] = useState<Schedule>("MANUAL");
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);

  const [importingUrl, setImportingUrl] = useState<string | null>(null);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());

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
  const hasPreselectedTopic = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load organization, saved topics, and history on mount
  useEffect(() => {
    fetchOrganization();
    loadTopics();
    loadHistory(1);
  }, []);

  // Seed the box from ?q=, so links from Trends arrive with the query in place.
  // Read off location rather than useSearchParams to avoid a Suspense boundary.
  useEffect(() => {
    const seed = new URLSearchParams(window.location.search).get("q");
    if (seed) setQuery(seed);

    // Focus on desktop only: on a phone it would raise the keyboard over the page.
    if (window.matchMedia("(min-width: 64rem)").matches) {
      inputRef.current?.focus();
      if (seed) inputRef.current?.select();
    }
  }, []);

  // Check for running job on mount (after we have orgId)
  useEffect(() => {
    if (orgId && !hasCheckedRunningJob.current) {
      hasCheckedRunningJob.current = true;
      checkForRunningJob();
    }
  }, [orgId]);

  async function fetchOrganization() {
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
  }

  // Check for a running search job on page load
  async function checkForRunningJob() {
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
  }

  const loadTopics = async () => {
    setIsLoadingTopics(true);
    try {
      const res = await fetch("/api/search/topics");
      const data = await res.json();
      if (data.success) {
        setTopics(data.data);

        // Master/detail: open the first watchlist so the pane is never dead.
        const first: SearchTopic | undefined = data.data?.[0];
        if (first && !hasPreselectedTopic.current) {
          hasPreselectedTopic.current = true;
          setSelectedTopic(first);
          void loadTopicResults(first);
        }
      }
    } catch (e) {
      console.error("Failed to load topics:", e);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const loadHistory = async (page: number) => {
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
  };

  const handleSaveSearch = async () => {
    if (isSavingSearch || results.length === 0 || !queryExpansion) return;

    setIsSavingSearch(true);
    try {
      const res = await fetch("/api/search/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: submittedQuery,
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
        toast.success("Saved as a watchlist");
        // Update history item to show it's converted
        setHistory((prev) =>
          prev.map((h) =>
            h.id === historyId ? { ...h, convertedToTopicId: data.topicId } : h
          )
        );
        // Reload topics list
        loadTopics();
      } else {
        toast.error(data.error || "Failed to create the watchlist");
      }
    } catch (e) {
      toast.error("Failed to create the watchlist");
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
        toast.success("Saved search deleted");
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

  const runSearch = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || isSearching) return;

      setView("search");
      setIsSearching(true);
      setSubmittedQuery(trimmed);
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
          query: trimmed,
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
                let progressInfo: SearchProgress = {
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
    },
    [isSearching]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch(query);
  };

  const handleExample = (example: string) => {
    setQuery(example);
    void runSearch(example);
  };

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
        setSelectedTopic(data.data);
        setIsCreateDialogOpen(false);
        setNewTopicName("");
        setNewTopicQuery("");
        setNewTopicSchedule("MANUAL");
        toast.success(`Watchlist "${data.data.name}" created`);
      } else {
        toast.error(data.error || "Failed to create the watchlist");
      }
    } catch (e) {
      toast.error("Failed to create the watchlist");
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
        toast.error(data.error || "The watchlist run failed");
      }
    } catch (e) {
      toast.error("The watchlist run failed");
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
        toast.success("Watchlist deleted");
      } else {
        toast.error("Failed to delete the watchlist");
      }
    } catch (e) {
      toast.error("Failed to delete the watchlist");
    }
  };

  /**
   * Stored results come back from the topic endpoint, so selecting a watchlist
   * shows what it kept without spending a live search.
   */
  const loadTopicResults = useCallback(async (topic: SearchTopic) => {
    if (topic.resultCount === 0) {
      setTopicResults([]);
      return;
    }

    setIsLoadingTopicResults(true);
    try {
      const res = await fetch(`/api/search/topics/${topic.id}`);
      const data = await res.json();
      if (data.success) {
        setTopicResults(normaliseStoredResults(data.data?.results));
      } else {
        setTopicResults([]);
      }
    } catch (e) {
      setTopicResults([]);
    } finally {
      setIsLoadingTopicResults(false);
    }
  }, []);

  const handleSelectTopic = (topic: SearchTopic) => {
    setSelectedTopic(topic);
    setTopicResults([]);
    void loadTopicResults(topic);
  };

  const handleImportResult = async (result: SearchResult, topicId?: string) => {
    setImportingUrl(result.url);

    try {
      let res: Response;

      if (topicId) {
        // For saved topic results, use the existing endpoint that looks up SearchResult by ID
        const topicRes = await fetch(`/api/search/topics/${topicId}`);
        const topicData = await topicRes.json();

        if (!topicData.success) {
          toast.error("Could not find that result to import");
          return;
        }

        const searchResult = topicData.data.results?.find((r: { url: string }) => r.url === result.url);
        if (!searchResult?.id) {
          toast.error("Could not find that result to import");
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
        setImportedUrls((prev) => new Set(prev).add(result.url));
        toast.success(
          data.alreadyExisted
            ? "Already in the review queue"
            : "Imported into the review queue"
        );
      } else {
        toast.error(data.error || "Failed to import");
      }
    } catch (e) {
      toast.error("Failed to import");
    } finally {
      setImportingUrl(null);
    }
  };

  const hasTrendRadarAccess = hasFeature(orgPlan, "trendRadar");

  const { eyebrow, title, subtitle } = useMemo(() => {
    if (view === "watchlists") {
      return {
        eyebrow: "Web search · watchlists",
        title:
          topics.length > 0
            ? `${topics.length} standing ${topics.length === 1 ? "question" : "questions"}`
            : "Questions worth asking twice",
        subtitle:
          "A watchlist keeps a question on file so it can be re-run on a schedule, and keeps what it found last time.",
      };
    }

    if (view === "history") {
      return {
        eyebrow: "Web search · history",
        title:
          history.length > 0
            ? `${history.length} saved ${history.length === 1 ? "search" : "searches"} on this page`
            : "Nothing saved yet",
        subtitle:
          "Saved searches keep their scored results, so revisiting one costs nothing.",
      };
    }

    return {
      eyebrow: "Web search",
      title:
        results.length > 0
          ? `${results.length} scored ${results.length === 1 ? "result" : "results"}`
          : "Ask the web anything",
      subtitle:
        results.length > 0 ? (
          <>
            Ranked by relevance to your brand voice, not by what the search engine
            put first. Importing a result sends it to the review queue with its
            score and summary attached.
          </>
        ) : (
          <>
            Claude reads the question, widens it into a proper query, searches the
            live web, then scores and summarises every hit against your brand voice.
            Roughly a minute end to end.
          </>
        ),
    };
  }, [view, topics.length, history.length, results.length]);

  return (
    <>
      <AppHeader hideSearch />

      <FeatureGate
        feature="trendRadar"
        currentPlan={orgPlan}
        hasAccess={hasTrendRadarAccess || isLoadingOrg}
      >
        {/* The search view is a reading column; the other two need table width. */}
        <RadarMain width={view === "search" ? "880px" : "1160px"}>
          <PageHeading
            eyebrow={eyebrow}
            title={title}
            subtitle={subtitle}
            actions={
              <ChipGroup<View>
                label="Search views"
                idBase="search-view"
                value={view}
                onChange={setView}
                options={[
                  { value: "search", label: "Search" },
                  {
                    value: "watchlists",
                    label: `Watchlists${topics.length > 0 ? ` · ${topics.length}` : ""}`,
                  },
                  { value: "history", label: "History" },
                ]}
              />
            }
          />

          {view === "search" && (
            <div
              role="tabpanel"
              id="search-view-panel-search"
              aria-labelledby="search-view-tab-search"
            >
              <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
                <div className="relative min-w-[240px] flex-1">
                  <SearchIcon
                    size={16}
                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-radar-ink3"
                  />
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={isSearching}
                    aria-label="Your question for the web"
                    placeholder="What has changed in enterprise AI this quarter?"
                    className={cn(
                      "h-[42px] w-full rounded-lg border border-radar-line bg-radar-surface pr-3.5 pl-10 text-[13.5px] text-radar-ink",
                      "placeholder:text-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
                      "disabled:cursor-not-allowed disabled:opacity-70"
                    )}
                  />
                </div>
                {isSearching ? (
                  <RadarButton
                    onClick={handleCancelSearch}
                    disabled={isCancelling || !currentJobId}
                    className="h-[42px] w-full hover:border-radar-err hover:text-radar-err sm:w-auto"
                  >
                    {isCancelling ? "Cancelling…" : "Cancel"}
                  </RadarButton>
                ) : (
                  <RadarButton
                    type="submit"
                    variant="accent"
                    disabled={!query.trim()}
                    className="h-[42px] w-full px-5 sm:w-auto"
                  >
                    Search the web
                  </RadarButton>
                )}
              </form>

              {/* Progress */}
              {isSearching && searchProgress && (
                <div
                  role="status"
                  aria-live="polite"
                  className="radar-enter mt-4 rounded-xl border border-radar-primary2 bg-radar-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-radar-primary2"
                    />
                    <p className="m-0 min-w-0 flex-1 text-[13px] font-semibold text-radar-ink">
                      {STAGE_LABEL[searchProgress.stage] ?? searchProgress.message}
                    </p>
                    <Num className="text-[12px] text-radar-ink2">
                      {Math.round(searchProgress.progress)}%
                    </Num>
                  </div>
                  <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-radar-line2">
                    <div
                      className="h-full rounded-full bg-radar-primary2 transition-[width] duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(2, Math.round(searchProgress.progress)))}%`,
                      }}
                    />
                  </div>
                  {searchProgress.analyzing && (
                    <p className="mt-2.5 mb-0 truncate text-[12px] text-radar-ink3">
                      Scoring {searchProgress.analyzing.current} of{" "}
                      {searchProgress.analyzing.total}:{" "}
                      {searchProgress.analyzing.title}
                    </p>
                  )}
                </div>
              )}

              {/* How the question was read */}
              {queryExpansion && (
                <div className="radar-enter mt-4 rounded-xl border border-radar-line2 bg-radar-surface2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SectionLabel>Read as</SectionLabel>
                    <Tag>{queryExpansion.analysis.intent}</Tag>
                    <Tag>{queryExpansion.analysis.timeScope}</Tag>
                    {queryExpansion.analysis.topics.slice(0, 4).map((topic) => (
                      <Tag key={topic}>{topic}</Tag>
                    ))}
                  </div>
                  {queryExpansion.expanded && (
                    <p className="mt-2 mb-0 text-[12px] leading-[1.5] text-radar-ink2 text-pretty">
                      Searched for &ldquo;{queryExpansion.expanded}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {/* Failure */}
              {error && (
                <div className="mt-4 rounded-xl border border-radar-err bg-radar-surface px-4 py-3.5">
                  <p className="m-0 text-[13px] font-semibold text-radar-ink">
                    The search did not finish
                  </p>
                  <p className="mt-1 mb-3 text-[12.5px] text-radar-ink2">{error}</p>
                  <RadarButton
                    size="sm"
                    onClick={() => void runSearch(submittedQuery || query)}
                    disabled={isSearching || !(submittedQuery || query).trim()}
                  >
                    Try again
                  </RadarButton>
                </div>
              )}

              {/* Results */}
              {results.length > 0 && (
                <div className="mt-8">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-radar-line pb-2.5">
                    {/* The h1 counts them and the box still holds the question, so
                        this row only has to say how they are ordered. */}
                    <SectionLabel>Highest score first</SectionLabel>
                    {lastSavedSearchId ? (
                      <StatusChip tone="ok">Saved</StatusChip>
                    ) : (
                      <RadarButton
                        size="sm"
                        onClick={handleSaveSearch}
                        disabled={isSavingSearch || !queryExpansion}
                      >
                        {isSavingSearch ? "Saving…" : "Save this search"}
                      </RadarButton>
                    )}
                  </div>

                  {results.map((result, index) => (
                    <SearchResultRow
                      key={`${result.url}-${index}`}
                      result={result}
                      onImport={() => handleImportResult(result)}
                      isImporting={importingUrl === result.url}
                      isImported={importedUrls.has(result.url)}
                    />
                  ))}
                </div>
              )}

              {/* First run: three questions that show the shape this expects */}
              {!isSearching && !error && results.length === 0 && (
                <div className="radar-enter mt-10 border-t border-radar-line pt-8">
                  <SectionLabel className="mb-3">Try one of these</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => handleExample(example)}
                        className="flex items-center gap-3 rounded-lg border border-radar-line bg-radar-surface px-3.5 py-2.5 text-left text-[13px] text-radar-ink2 transition-colors hover:border-radar-ink3 hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                      >
                        <SearchIcon size={14} className="shrink-0 text-radar-ink3" />
                        <span className="min-w-0 flex-1">{example}</span>
                        <span aria-hidden="true" className="text-radar-ink3">
                          ›
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "watchlists" && (
            <div
              role="tabpanel"
              id="search-view-panel-watchlists"
              aria-labelledby="search-view-tab-watchlists"
            >
              <WatchlistsPanel
                topics={topics}
                isLoading={isLoadingTopics}
                selected={selectedTopic}
                onSelect={handleSelectTopic}
                onRun={handleRunTopic}
                onDelete={handleDeleteTopic}
                onCreate={() => setIsCreateDialogOpen(true)}
                isRunning={isRunningTopic}
                isLoadingResults={isLoadingTopicResults}
                results={topicResults}
                importingUrl={importingUrl}
                importedUrls={importedUrls}
                onImport={(result) =>
                  handleImportResult(result, selectedTopic?.id)
                }
              />
            </div>
          )}

          {view === "history" && (
            <div
              role="tabpanel"
              id="search-view-panel-history"
              aria-labelledby="search-view-tab-history"
            >
              <HistoryPanel
                items={history}
                isLoading={isLoadingHistory}
                page={historyPage}
                totalPages={historyTotalPages}
                onPage={loadHistory}
                expandedId={expandedHistoryId}
                onToggle={handleExpandHistory}
                loadingResultsId={isLoadingHistoryResults}
                convertingId={convertingHistoryId}
                onConvert={handleConvertToTopic}
                deletingId={deletingHistoryId}
                onRequestDelete={setDeleteConfirmId}
                importingUrl={importingUrl}
                importedUrls={importedUrls}
                onImport={(result) => handleImportResult(result)}
              />
            </div>
          )}
        </RadarMain>
      </FeatureGate>

      {/* Create watchlist */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a watchlist</DialogTitle>
            <DialogDescription>
              The same question, kept on file. Run it by hand or let the schedule
              run it for you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                Name
              </span>
              <input
                value={newTopicName}
                onChange={(event) => setNewTopicName(event.target.value)}
                placeholder="DORA enforcement"
                className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink placeholder:text-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                Question
              </span>
              <textarea
                value={newTopicQuery}
                onChange={(event) => setNewTopicQuery(event.target.value)}
                rows={3}
                placeholder="DORA regulation enforcement, European banks, 2026"
                className="w-full resize-y rounded-lg border border-radar-line bg-radar-bg px-3 py-2 text-[13px] leading-[1.5] text-radar-ink placeholder:text-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                Schedule
              </span>
              {/* Wrapper keeps the group at its content width inside the dialog. */}
              <div className="flex">
                <ChipGroup<Schedule>
                  label="Watchlist schedule"
                  kind="options"
                  value={newTopicSchedule}
                  onChange={setNewTopicSchedule}
                  options={[
                    { value: "MANUAL", label: "On demand" },
                    { value: "DAILY", label: "Daily" },
                    { value: "WEEKLY", label: "Weekly" },
                  ]}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <RadarButton
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isCreatingTopic}
            >
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={handleCreateTopic}
              disabled={
                isCreatingTopic || !newTopicName.trim() || !newTopicQuery.trim()
              }
            >
              {isCreatingTopic ? "Creating…" : "Create watchlist"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete a saved search */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved search?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored results go with it, so revisiting the question later means
              paying to search again. Articles you already imported are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirmId && handleDeleteHistory(deleteConfirmId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

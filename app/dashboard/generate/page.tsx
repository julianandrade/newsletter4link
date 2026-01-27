"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Plan } from "@prisma/client";
import { AppHeader } from "@/components/app-header";
import { FeatureGate } from "@/components/upgrade-prompt";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Wand2,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  FileText,
  StopCircle,
  XCircle,
} from "lucide-react";
import { hasFeature } from "@/lib/plans/features";

const STORAGE_KEY_PREFIX = "generation_job_";

interface Edition {
  id: string;
  week: number;
  year: number;
  status: string;
  scheduledDate?: string;
  generatedContent?: GeneratedNewsletter | null;
  generatedAt?: string | null;
  articleCount: number;
}

interface BrandVoice {
  id: string;
  name: string;
  personality?: string;
  isDefault: boolean;
}

interface GeneratedArticle {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  isHero: boolean;
}

interface GeneratedSection {
  name: string;
  articles: GeneratedArticle[];
  transition?: string;
}

interface GeneratedNewsletter {
  opening: string;
  sections: GeneratedSection[];
  closing: string;
  subjectLines: string[];
  plan: {
    heroArticle: { title: string; summary?: string };
    totalArticles: number;
  };
  generatedAt: string;
}

interface GenerationProgress {
  stage: string;
  progress: number;
  message: string;
}

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  opening: "Opening",
  articles: "Articles",
  transitions: "Transitions",
  closing: "Closing",
  subjects: "Subject Lines",
  complete: "Complete",
};

export default function GeneratePage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoice[]>([]);
  const [isLoadingEditions, setIsLoadingEditions] = useState(true);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);

  const [selectedEditionId, setSelectedEditionId] = useState<string>("");
  const [selectedBrandVoiceId, setSelectedBrandVoiceId] = useState<string>("");
  const [selectedEdition, setSelectedEdition] = useState<Edition | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedNewsletter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editedContent, setEditedContent] = useState<{
    opening: string;
    closing: string;
    sections: GeneratedSection[];
  } | null>(null);

  const [selectedSubjectLine, setSelectedSubjectLine] = useState<number>(0);
  const [isRegeneratingSubjects, setIsRegeneratingSubjects] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);

  // Organization plan for feature gating
  const [orgPlan, setOrgPlan] = useState<Plan>("FREE");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);

  // Ref to track if we've checked for running jobs
  const hasCheckedRunningJob = useRef(false);

  // Fetch organization, editions and brand voices on mount
  useEffect(() => {
    fetchOrganization();
    fetchEditions();
    fetchBrandVoices();
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

  // Check for a running generation job on page load
  async function checkForRunningJob() {
    if (!orgId) return;

    try {
      // Check localStorage for stored job ID
      const storedJobId = localStorage.getItem(`${STORAGE_KEY_PREFIX}${orgId}`);

      // Check if there's a running GENERATION job
      const res = await fetch("/api/jobs?type=GENERATION&status=RUNNING");
      if (!res.ok) return;

      const data = await res.json();
      if (data.jobs && data.jobs.length > 0) {
        const runningJob = data.jobs[0];
        setCurrentJobId(runningJob.id);
        setIsGenerating(true);

        // Resume progress display
        if (runningJob.currentStage) {
          setGenerationProgress({
            stage: runningJob.currentStage,
            progress: runningJob.progress || 0,
            message: `Resuming ${STAGE_LABELS[runningJob.currentStage] || runningJob.currentStage}...`,
          });
        }

        // Note: We can't reconnect to the SSE stream, but the job is still running
        // The user can wait for it to complete or cancel it
      } else {
        // No running job, clear localStorage
        if (storedJobId) {
          localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orgId}`);
        }
      }
    } catch (err) {
      console.error("Failed to check for running job:", err);
    }
  }

  // When edition is selected, update selectedEdition and check for existing generation
  useEffect(() => {
    if (selectedEditionId) {
      const edition = editions.find((e) => e.id === selectedEditionId);
      setSelectedEdition(edition || null);
      if (edition?.generatedContent) {
        setGenerated(edition.generatedContent as GeneratedNewsletter);
        setEditedContent({
          opening: edition.generatedContent.opening,
          closing: edition.generatedContent.closing,
          sections: edition.generatedContent.sections,
        });
      } else {
        setGenerated(null);
        setEditedContent(null);
      }
    } else {
      setSelectedEdition(null);
      setGenerated(null);
      setEditedContent(null);
    }
  }, [selectedEditionId, editions]);

  async function fetchEditions() {
    setIsLoadingEditions(true);
    try {
      const res = await fetch("/api/editions");
      if (!res.ok) throw new Error("Failed to fetch editions");
      const json = await res.json();
      // Filter to only DRAFT and FINALIZED editions
      const filteredEditions = (json.data || []).filter(
        (e: Edition) => e.status === "DRAFT" || e.status === "FINALIZED"
      );
      setEditions(filteredEditions);
    } catch (err) {
      console.error("Failed to fetch editions:", err);
      setError("Failed to load editions");
    } finally {
      setIsLoadingEditions(false);
    }
  }

  async function fetchBrandVoices() {
    setIsLoadingVoices(true);
    try {
      const res = await fetch("/api/brand-voices");
      if (!res.ok) throw new Error("Failed to fetch brand voices");
      const data = await res.json();
      setBrandVoices(data.brandVoices || []);
      // Select default voice
      const defaultVoice = data.brandVoices?.find((v: BrandVoice) => v.isDefault);
      if (defaultVoice) {
        setSelectedBrandVoiceId(defaultVoice.id);
      }
    } catch (err) {
      console.error("Failed to fetch brand voices:", err);
    } finally {
      setIsLoadingVoices(false);
    }
  }

  const handleGenerate = useCallback(async () => {
    if (!selectedEditionId) return;

    setIsGenerating(true);
    setError(null);
    setGenerationProgress({
      stage: "starting",
      progress: 0,
      message: "Connecting...",
    });

    try {
      // Build URL with query params
      const params = new URLSearchParams({ editionId: selectedEditionId });
      if (selectedBrandVoiceId && selectedBrandVoiceId !== "default") {
        params.set("brandVoiceId", selectedBrandVoiceId);
      }

      const response = await fetch(`/api/generation/stream?${params}`, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Generation failed");
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
              // Store jobId in localStorage for recovery
              if (orgId && data.jobId) {
                localStorage.setItem(`${STORAGE_KEY_PREFIX}${orgId}`, data.jobId);
              }
              setGenerationProgress({
                stage: "starting",
                progress: 0,
                message: data.message || "Starting generation...",
              });
              break;

            case "progress":
              setGenerationProgress({
                stage: data.stage || "processing",
                progress: data.progress || 0,
                message: data.message || "Processing...",
              });
              break;

            case "complete":
              // Clear localStorage
              if (orgId) {
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orgId}`);
              }
              setCurrentJobId(null);
              setGenerationProgress({
                stage: "complete",
                progress: 100,
                message: "Generation complete!",
              });

              // Extract newsletter from result
              if (data.result?.newsletter) {
                setGenerated(data.result.newsletter);
                setEditedContent({
                  opening: data.result.newsletter.opening,
                  closing: data.result.newsletter.closing,
                  sections: data.result.newsletter.sections,
                });
              }

              // Refresh editions
              fetchEditions();

              // Clear progress after short delay
              setTimeout(() => {
                setIsGenerating(false);
                setGenerationProgress(null);
              }, 1500);
              break;

            case "cancelled":
              // Clear localStorage
              if (orgId) {
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orgId}`);
              }
              setCurrentJobId(null);
              setIsGenerating(false);
              setIsCancelling(false);
              setGenerationProgress(null);
              setError("Generation was cancelled");
              break;

            case "error":
              // Clear localStorage
              if (orgId) {
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orgId}`);
              }
              setCurrentJobId(null);
              setIsGenerating(false);
              setGenerationProgress(null);
              setError(data.error || "Generation failed");
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
      console.error("Generation failed:", err);
      setError(err instanceof Error ? err.message : "Generation failed");
      setIsGenerating(false);
      setGenerationProgress(null);
      setCurrentJobId(null);
      // Clear localStorage
      if (orgId) {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orgId}`);
      }
    }
  }, [selectedEditionId, selectedBrandVoiceId, orgId]);

  async function handleCancel() {
    if (!currentJobId) return;

    setIsCancelling(true);
    try {
      const res = await fetch("/api/generation/cancel", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      // The SSE stream will receive the cancelled event
      setGenerationProgress((prev) =>
        prev ? { ...prev, message: "Cancelling..." } : null
      );
    } catch (err) {
      console.error("Failed to cancel generation:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel");
      setIsCancelling(false);
    }
  }

  async function handleRegenerateSubjectLines() {
    if (!selectedEditionId || !generated) return;

    setIsRegeneratingSubjects(true);
    try {
      const res = await fetch("/api/generation/subject-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId: selectedEditionId,
          brandVoiceId: selectedBrandVoiceId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to regenerate subject lines");
      }

      const data = await res.json();
      setGenerated({
        ...generated,
        subjectLines: data.subjectLines,
      });
      setSelectedSubjectLine(0);
    } catch (err) {
      console.error("Failed to regenerate subject lines:", err);
      setError(err instanceof Error ? err.message : "Failed to regenerate subject lines");
    } finally {
      setIsRegeneratingSubjects(false);
    }
  }

  function copySubjectLine() {
    if (!generated) return;
    navigator.clipboard.writeText(generated.subjectLines[selectedSubjectLine]);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 2000);
  }

  const isLoading = isLoadingEditions || isLoadingVoices || isLoadingOrg;
  const hasGhostWriterAccess = hasFeature(orgPlan, "ghostWriter");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Ghost Writer" />

      <FeatureGate
        feature="ghostWriter"
        currentPlan={orgPlan}
        hasAccess={hasGhostWriterAccess || isLoadingOrg}
      >
        <main className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Wand2 className="h-8 w-8" />
              Ghost Writer
            </h1>
            <p className="text-muted-foreground">
              AI-powered newsletter generation with brand voice matching
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <Card className="mb-6 border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-5 w-5" />
                    <p>{error}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Generation Settings</CardTitle>
              <CardDescription>
                Select an edition and brand voice to generate newsletter content
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Edition Selection */}
                <div className="space-y-2">
                  <Label>Edition</Label>
                  <Select
                    value={selectedEditionId}
                    onValueChange={setSelectedEditionId}
                    disabled={isLoading || isGenerating}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select edition..." />
                    </SelectTrigger>
                    <SelectContent>
                      {editions.map((edition) => (
                        <SelectItem key={edition.id} value={edition.id}>
                          Week {edition.week}, {edition.year} ({edition.articleCount} articles)
                          {edition.generatedContent && " - Generated"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Brand Voice Selection */}
                <div className="space-y-2">
                  <Label>Brand Voice</Label>
                  <Select
                    value={selectedBrandVoiceId}
                    onValueChange={setSelectedBrandVoiceId}
                    disabled={isLoading || isGenerating}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default voice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (Professional)</SelectItem>
                      {brandVoices.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name} {voice.isDefault && "(Default)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Generate / Cancel Button */}
                <div className="space-y-2">
                  <Label className="invisible">Action</Label>
                  {isGenerating ? (
                    <Button
                      variant="destructive"
                      onClick={handleCancel}
                      disabled={isCancelling}
                      className="w-full"
                    >
                      {isCancelling ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <StopCircle className="h-4 w-4 mr-2" />
                          Cancel Generation
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGenerate}
                      disabled={!selectedEditionId || isGenerating}
                      className="w-full"
                    >
                      {generated ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Regenerate
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Newsletter
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Generation Progress */}
              {isGenerating && generationProgress && (
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-medium">
                        {STAGE_LABELS[generationProgress.stage] || generationProgress.stage}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(generationProgress.progress)}%
                    </span>
                  </div>
                  <Progress value={generationProgress.progress} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {generationProgress.message}
                  </p>
                </div>
              )}

              {/* Edition Info */}
              {selectedEdition && !isGenerating && (
                <div className="mt-4 pt-4 border-t flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {selectedEdition.articleCount} articles
                  </span>
                  <Badge variant={selectedEdition.status === "DRAFT" ? "secondary" : "default"}>
                    {selectedEdition.status}
                  </Badge>
                  {selectedEdition.generatedAt && (
                    <span>
                      Generated: {new Date(selectedEdition.generatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated Content */}
          {generated && editedContent && !isGenerating && (
            <div className="space-y-6">
              {/* Subject Lines */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Subject Lines
                        <Badge variant="outline">{generated.subjectLines.length} variants</Badge>
                      </CardTitle>
                      <CardDescription>
                        Select a subject line for your newsletter email
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerateSubjectLines}
                      disabled={isRegeneratingSubjects}
                    >
                      {isRegeneratingSubjects ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Regenerate
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {generated.subjectLines.map((subject, index) => (
                      <div
                        key={index}
                        onClick={() => setSelectedSubjectLine(index)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedSubjectLine === index
                            ? "border-primary bg-primary/5"
                            : "hover:border-muted-foreground/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            {selectedSubjectLine === index && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                            {subject}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {subject.length} chars
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" size="sm" onClick={copySubjectLine}>
                      {copiedSubject ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Selected
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Opening */}
              <Card>
                <CardHeader>
                  <CardTitle>Opening</CardTitle>
                  <CardDescription>
                    The hook that draws readers in
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={editedContent.opening}
                    onChange={(e) =>
                      setEditedContent({ ...editedContent, opening: e.target.value })
                    }
                    rows={4}
                    className="resize-none"
                  />
                </CardContent>
              </Card>

              {/* Sections */}
              {editedContent.sections.map((section, sectionIndex) => (
                <Card key={sectionIndex}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {section.name}
                      <Badge variant="secondary">{section.articles.length} articles</Badge>
                    </CardTitle>
                    {section.transition && (
                      <CardDescription>
                        Transition: {section.transition}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.articles.map((article, articleIndex) => (
                      <div
                        key={article.id}
                        className={`p-4 rounded-lg border ${
                          article.isHero ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{article.title}</h4>
                            {article.isHero && (
                              <Badge variant="default">Hero</Badge>
                            )}
                          </div>
                          <a
                            href={article.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        <Textarea
                          value={article.summary}
                          onChange={(e) => {
                            const newSections = [...editedContent.sections];
                            newSections[sectionIndex].articles[articleIndex].summary = e.target.value;
                            setEditedContent({ ...editedContent, sections: newSections });
                          }}
                          rows={3}
                          className="resize-none"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              {/* Closing */}
              <Card>
                <CardHeader>
                  <CardTitle>Closing</CardTitle>
                  <CardDescription>
                    Sign-off with call to action
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={editedContent.closing}
                    onChange={(e) =>
                      setEditedContent({ ...editedContent, closing: e.target.value })
                    }
                    rows={4}
                    className="resize-none"
                  />
                </CardContent>
              </Card>

              {/* Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Generation Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{generated.plan.totalArticles}</div>
                      <div className="text-sm text-muted-foreground">Articles</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{editedContent.sections.length}</div>
                      <div className="text-sm text-muted-foreground">Sections</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{generated.subjectLines.length}</div>
                      <div className="text-sm text-muted-foreground">Subject Lines</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {new Date(generated.generatedAt).toLocaleTimeString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Generated</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty State */}
          {!generated && !isLoading && !isGenerating && selectedEditionId && (
            <Card>
              <CardContent className="py-12 text-center">
                <Wand2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Ready to Generate</h3>
                <p className="text-muted-foreground mb-4">
                  Click the Generate button to create AI-powered newsletter content
                </p>
              </CardContent>
            </Card>
          )}

          {/* No Edition Selected */}
          {!selectedEditionId && !isLoading && !isGenerating && (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select an Edition</h3>
                <p className="text-muted-foreground">
                  Choose an edition above to generate newsletter content
                </p>
              </CardContent>
            </Card>
          )}
        </main>
      </FeatureGate>
    </div>
  );
}

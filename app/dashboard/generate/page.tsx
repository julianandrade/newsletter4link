"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Plan } from "@prisma/client";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { FeatureGate } from "@/components/upgrade-prompt";
import {
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import {
  Callout,
  EmptyState,
  RadarField,
  RadarPanel,
  RadarProgress,
  RadarSelect,
  RadarTextarea,
  SkeletonRows,
  StatTile,
} from "@/components/radar/controls";
import { hasFeature } from "@/lib/plans/features";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

const STORAGE_KEY_PREFIX = "generation_job_";

interface Edition {
  id: string;
  week: number;
  year: number;
  /** RQ-008: the title, or the week label when there is none. Derived by the API. */
  label: string;
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

interface GenerationDraft {
  id: string;
  status: "DRAFT" | "APPROVED" | "USED" | "DISCARDED";
  generatedAt: string;
  approvedAt?: string | null;
  brandVoiceId?: string | null;
  content?: GeneratedNewsletter;
}

interface GenerationProgress {
  stage: string;
  progress: number;
  message: string;
}

const STAGE_LABELS: Record<string, string> = {
  starting: "Starting",
  planning: "Planning the running order",
  opening: "Writing the opening",
  articles: "Writing the story summaries",
  transitions: "Writing the transitions",
  closing: "Writing the sign-off",
  subjects: "Drafting subject lines",
  complete: "Complete",
};

const DRAFT_TONE: Record<
  GenerationDraft["status"],
  "ok" | "warn" | "err" | "info" | "neutral"
> = {
  DRAFT: "info",
  APPROVED: "ok",
  USED: "neutral",
  DISCARDED: "neutral",
};

const DRAFT_LABEL: Record<GenerationDraft["status"], string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  USED: "Used in a send",
  DISCARDED: "Discarded",
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
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgress | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedNewsletter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<GenerationDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [isLoadingDraftContentId, setIsLoadingDraftContentId] = useState<
    string | null
  >(null);
  const [isApprovingDraftId, setIsApprovingDraftId] = useState<string | null>(null);
  const [isDiscardingDraftId, setIsDiscardingDraftId] = useState<string | null>(
    null
  );

  const [editedContent, setEditedContent] = useState<{
    opening: string;
    closing: string;
    sections: GeneratedSection[];
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingEdits, setIsSavingEdits] = useState(false);

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
  //
  // The ref is the guard, so this runs once per orgId however often the component
  // renders. `checkForRunningJob` is redeclared every render, so listing it as a
  // dependency would restart the check instead of leaving it alone.
  useEffect(() => {
    if (orgId && !hasCheckedRunningJob.current) {
      hasCheckedRunningJob.current = true;
      checkForRunningJob();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            message: `Picking up where it left off: ${
              STAGE_LABELS[runningJob.currentStage] || runningJob.currentStage
            }`,
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
      setDrafts([]);
      setSelectedDraftId(null);
      loadDrafts(selectedEditionId);
    } else {
      setSelectedEdition(null);
      setGenerated(null);
      setEditedContent(null);
      setDrafts([]);
      setSelectedDraftId(null);
    }
  }, [selectedEditionId, editions]);

  useEffect(() => {
    if (!selectedDraftId) {
      setGenerated(null);
      setEditedContent(null);
      return;
    }

    const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId);
    if (!selectedDraft) {
      if (isLoadingDrafts) return;
      setGenerated(null);
      setEditedContent(null);
      return;
    }

    if (!selectedDraft.content) {
      loadDraftContent(selectedDraft.id);
      return;
    }

    setGenerated(selectedDraft.content);
    setEditedContent({
      opening: selectedDraft.content.opening,
      closing: selectedDraft.content.closing,
      sections: selectedDraft.content.sections,
    });
    setIsDirty(false);
    setSelectedSubjectLine(0);
  }, [selectedDraftId, drafts, isLoadingDrafts]);

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
      setError("The edition list could not be loaded");
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

  const loadDrafts = async (editionId: string) => {
    setIsLoadingDrafts(true);
    try {
      const res = await fetch(`/api/drafts?editionId=${editionId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.drafts)) {
        setDrafts(data.drafts);
        setSelectedDraftId((prev) => {
          if (
            prev &&
            data.drafts.some((draft: GenerationDraft) => draft.id === prev)
          ) {
            return prev;
          }
          return data.drafts[0]?.id || null;
        });
      } else {
        setDrafts([]);
        setSelectedDraftId(null);
      }
    } catch (err) {
      console.error("Failed to load drafts:", err);
      setDrafts([]);
      setSelectedDraftId(null);
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  const loadDraftContent = async (draftId: string) => {
    setIsLoadingDraftContentId(draftId);
    try {
      const res = await fetch(`/api/drafts/${draftId}`);
      const data = await res.json();
      if (res.ok && data.draft?.content) {
        setDrafts((prev) =>
          prev.map((draft) =>
            draft.id === draftId ? { ...draft, content: data.draft.content } : draft
          )
        );
      }
    } catch (err) {
      console.error("Failed to load draft content:", err);
    } finally {
      setIsLoadingDraftContentId(null);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!selectedEditionId) return;

    setIsGenerating(true);
    setError(null);
    setGenerationProgress({
      stage: "starting",
      progress: 0,
      message: "Connecting",
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
                message: data.message || "Starting",
              });
              break;

            case "progress":
              setGenerationProgress({
                stage: data.stage || "processing",
                progress: data.progress || 0,
                message: data.message || "Working",
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
                message: "Done",
              });

              // Extract newsletter from result
              if (data.result?.newsletter) {
                setGenerated(data.result.newsletter);
                setEditedContent({
                  opening: data.result.newsletter.opening,
                  closing: data.result.newsletter.closing,
                  sections: data.result.newsletter.sections,
                });
                setIsDirty(false);
              }

              if (data.result?.draftId) {
                setSelectedDraftId(data.result.draftId);
              }

              // Refresh editions
              fetchEditions();
              if (selectedEditionId) {
                loadDrafts(selectedEditionId);
              }

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
              setError("The run was cancelled before it finished");
              break;

            case "error":
              // Clear localStorage
              if (orgId) {
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orgId}`);
              }
              setCurrentJobId(null);
              setIsGenerating(false);
              setGenerationProgress(null);
              setError(data.error || "The run failed");
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
      setError(err instanceof Error ? err.message : "The run failed");
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
        prev ? { ...prev, message: "Cancelling" } : null
      );
    } catch (err) {
      console.error("Failed to cancel generation:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel");
      setIsCancelling(false);
    }
  }

  async function handleApproveDraft(draftId: string) {
    setIsApprovingDraftId(draftId);
    try {
      const res = await fetch(`/api/drafts/${draftId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve draft");
      }
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === draftId
            ? { ...draft, status: "APPROVED", approvedAt: data.draft?.approvedAt }
            : draft
        )
      );
      toast.success("Draft approved, ready for a send");
    } catch (err) {
      console.error("Failed to approve draft:", err);
      toast.error(
        err instanceof Error ? err.message : "Could not approve that draft"
      );
    } finally {
      setIsApprovingDraftId(null);
    }
  }

  async function handleDiscardDraft(draftId: string) {
    setIsDiscardingDraftId(draftId);
    try {
      const res = await fetch(`/api/drafts/${draftId}/discard`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to discard draft");
      }
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === draftId ? { ...draft, status: "DISCARDED" } : draft
        )
      );
      if (selectedDraftId === draftId) {
        setSelectedDraftId(null);
      }
      toast.success("Draft discarded");
    } catch (err) {
      console.error("Failed to discard draft:", err);
      toast.error(
        err instanceof Error ? err.message : "Could not discard that draft"
      );
    } finally {
      setIsDiscardingDraftId(null);
    }
  }

  /** Persists the copy edits; without this the textareas were decorative. */
  async function handleSaveEdits() {
    if (!selectedDraftId || !editedContent || isSavingEdits) return;

    setIsSavingEdits(true);
    try {
      const res = await fetch(`/api/drafts/${selectedDraftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedContent }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save the edits");
      }

      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === selectedDraftId && draft.content
            ? { ...draft, content: { ...draft.content, ...editedContent } }
            : draft
        )
      );
      setGenerated((prev) => (prev ? { ...prev, ...editedContent } : prev));
      setIsDirty(false);
      toast.success("Edits saved to the draft");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the edits"
      );
    } finally {
      setIsSavingEdits(false);
    }
  }

  async function handleRegenerateSubjectLines() {
    if (!selectedDraftId || !generated) return;

    setIsRegeneratingSubjects(true);
    try {
      const res = await fetch("/api/generation/subject-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: selectedDraftId,
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
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === selectedDraftId && draft.content
            ? {
                ...draft,
                content: {
                  ...draft.content,
                  subjectLines: data.subjectLines,
                },
              }
            : draft
        )
      );
      setSelectedSubjectLine(0);
    } catch (err) {
      console.error("Failed to regenerate subject lines:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not draft new subject lines"
      );
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

  /** Immutable summary edit: the old version mutated nested state in place. */
  function updateArticleSummary(
    sectionIndex: number,
    articleIndex: number,
    summary: string
  ) {
    setEditedContent((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        sections: previous.sections.map((section, sIndex) =>
          sIndex !== sectionIndex
            ? section
            : {
                ...section,
                articles: section.articles.map((article, aIndex) =>
                  aIndex !== articleIndex ? article : { ...article, summary }
                ),
              }
        ),
      };
    });
    setIsDirty(true);
  }

  const isLoading = isLoadingEditions || isLoadingVoices || isLoadingOrg;
  const hasGhostWriterAccess = hasFeature(orgPlan, "ghostWriter");
  const getBrandVoiceName = (brandVoiceId?: string | null) => {
    if (!brandVoiceId) return "Default voice";
    return (
      brandVoices.find((voice) => voice.id === brandVoiceId)?.name || "Custom voice"
    );
  };

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId]
  );
  const canEditDraft = selectedDraft?.status === "DRAFT";

  const heading = isGenerating
    ? "Writing the edition"
    : generated && selectedEdition
      ? `${selectedEdition.label} is drafted`
      : selectedEdition
        ? `${selectedEdition.label} is ready to write`
        : "Write the edition";

  return (
    <>
      <AppHeader />

      <FeatureGate
        feature="ghostWriter"
        currentPlan={orgPlan}
        hasAccess={hasGhostWriterAccess || isLoadingOrg}
      >
        <RadarMain width="form">
          <PageHeading
            eyebrow="Ghost Writer"
            title={heading}
            subtitle="Claude reads the approved stories in an edition, plans a running order, and writes the opening, the summaries, the transitions and the sign-off in your brand voice. Everything it writes is editable before it ships."
            actions={
              isGenerating ? (
                <RadarButton
                  onClick={handleCancel}
                  disabled={isCancelling || !currentJobId}
                  className="hover:border-radar-err hover:text-radar-err"
                >
                  {isCancelling ? "Cancelling…" : "Cancel the run"}
                </RadarButton>
              ) : (
                <RadarButton
                  variant="accent"
                  onClick={handleGenerate}
                  disabled={!selectedEditionId || isLoading}
                >
                  {generated ? "Write another draft" : "Write the edition"}
                </RadarButton>
              )
            }
          />

          {error && (
            <Callout
              tone="err"
              title="The last run did not finish"
              className="mb-5"
              actions={
                <RadarButton size="sm" onClick={() => setError(null)}>
                  Dismiss
                </RadarButton>
              }
            >
              {error}
            </Callout>
          )}

          {/* Settings */}
          <div className="mb-5 grid gap-4 rounded-xl border border-radar-line bg-radar-surface p-4 sm:grid-cols-2">
            <RadarField
              label="Edition"
              htmlFor="generate-edition"
              hint={
                selectedEdition
                  ? `${selectedEdition.articleCount} approved stories in this one`
                  : "Only draft and finalised editions can be written."
              }
            >
              <RadarSelect
                id="generate-edition"
                value={selectedEditionId}
                disabled={isLoading || isGenerating}
                onChange={(event) => setSelectedEditionId(event.target.value)}
              >
                <option value="">Choose an edition</option>
                {editions.map((edition) => (
                  <option key={edition.id} value={edition.id}>
                    {edition.label} · {edition.articleCount}{" "}
                    stories
                  </option>
                ))}
              </RadarSelect>
            </RadarField>

            <RadarField
              label="Brand voice"
              htmlFor="generate-voice"
              hint="Sets register, sentence length and how much hedging is allowed."
            >
              <RadarSelect
                id="generate-voice"
                value={selectedBrandVoiceId}
                disabled={isLoading || isGenerating}
                onChange={(event) => setSelectedBrandVoiceId(event.target.value)}
              >
                <option value="default">Default, professional</option>
                {brandVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                    {voice.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </RadarSelect>
            </RadarField>
          </div>

          {/* Live run */}
          {isGenerating && generationProgress && (
            <Callout
              tone="info"
              live
              className="mb-5"
              title={
                STAGE_LABELS[generationProgress.stage] || generationProgress.stage
              }
            >
              <div className="flex items-center gap-3">
                <RadarProgress
                  value={generationProgress.progress}
                  className="flex-1"
                />
                <Num className="shrink-0 text-[12px] text-radar-ink2">
                  {Math.round(generationProgress.progress)}%
                </Num>
              </div>
              <p className="mt-2 mb-0 text-[12px] text-radar-ink3">
                {generationProgress.message}
              </p>
            </Callout>
          )}

          {/* Drafts for this edition */}
          {selectedEditionId && !isGenerating && (
            <RadarPanel
              title="Drafts for this edition"
              note="Each run keeps its own draft, so you can compare voices before approving one."
              className="mb-5"
              padded={false}
            >
              {isLoadingDrafts ? (
                <div className="px-4 py-2">
                  <SkeletonRows rows={2} />
                </div>
              ) : drafts.length === 0 ? (
                <p className="m-0 px-4 py-8 text-center text-[12.5px] text-radar-ink3">
                  Nothing written for this edition yet.
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {drafts.map((draft) => {
                    const isSelected = draft.id === selectedDraftId;

                    return (
                      <li
                        key={draft.id}
                        className={cn(
                          "flex flex-col gap-2.5 border-b border-radar-line2 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between",
                          isSelected && "bg-radar-surface2"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-radar-ink">
                              {getBrandVoiceName(draft.brandVoiceId)}
                            </span>
                            <StatusChip tone={DRAFT_TONE[draft.status]}>
                              {DRAFT_LABEL[draft.status]}
                            </StatusChip>
                          </div>
                          <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3">
                            Written {relativeTime(draft.generatedAt)}
                            {draft.approvedAt &&
                              ` · approved ${relativeTime(draft.approvedAt)}`}
                            {isLoadingDraftContentId === draft.id &&
                              " · loading the copy…"}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <RadarButton
                            size="sm"
                            variant={isSelected ? "accent" : "outline"}
                            onClick={() => setSelectedDraftId(draft.id)}
                          >
                            {isSelected ? "Open" : "Read"}
                          </RadarButton>
                          {draft.status === "DRAFT" && (
                            <RadarButton
                              size="sm"
                              onClick={() => handleApproveDraft(draft.id)}
                              disabled={isApprovingDraftId === draft.id}
                            >
                              {isApprovingDraftId === draft.id
                                ? "Approving…"
                                : "Approve"}
                            </RadarButton>
                          )}
                          {(draft.status === "DRAFT" ||
                            draft.status === "APPROVED") && (
                            <RadarButton
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDiscardDraft(draft.id)}
                              disabled={isDiscardingDraftId === draft.id}
                              className="hover:border-radar-err hover:text-radar-err"
                            >
                              {isDiscardingDraftId === draft.id
                                ? "Discarding…"
                                : "Discard"}
                            </RadarButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </RadarPanel>
          )}

          {/* The written edition */}
          {generated && editedContent && !isGenerating && (
            <div className="flex flex-col gap-5">
              {/* Sticky save bar, only when something changed */}
              {isDirty && (
                <div className="radar-enter sticky top-[68px] z-20 flex flex-wrap items-center gap-3 rounded-xl border border-radar-accent bg-radar-surface px-4 py-3 shadow-radar-lg">
                  <p className="m-0 flex-1 text-[12.5px] text-radar-ink">
                    {canEditDraft
                      ? "You have unsaved copy edits."
                      : "This draft is locked, so edits cannot be saved. Generate a new draft to make changes."}
                  </p>
                  {canEditDraft && (
                    <RadarButton
                      size="sm"
                      variant="accent"
                      onClick={handleSaveEdits}
                      disabled={isSavingEdits}
                    >
                      {isSavingEdits ? "Saving…" : "Save edits"}
                    </RadarButton>
                  )}
                </div>
              )}

              {/* Subject lines */}
              <RadarPanel
                title="Subject lines"
                note={`${generated.subjectLines.length} options. Inbox previews cut around 60 characters.`}
                actions={
                  <>
                    <RadarButton size="sm" variant="ghost" onClick={copySubjectLine}>
                      {copiedSubject ? "Copied" : "Copy the chosen one"}
                    </RadarButton>
                    <RadarButton
                      size="sm"
                      onClick={handleRegenerateSubjectLines}
                      disabled={isRegeneratingSubjects || !selectedDraftId}
                    >
                      {isRegeneratingSubjects ? "Writing…" : "New options"}
                    </RadarButton>
                  </>
                }
              >
                <div
                  role="radiogroup"
                  aria-label="Subject line"
                  className="flex flex-col gap-1.5"
                >
                  {generated.subjectLines.map((subject, index) => {
                    const chosen = selectedSubjectLine === index;

                    return (
                      <button
                        key={`${subject}-${index}`}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        onClick={() => setSelectedSubjectLine(index)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
                          chosen
                            ? "border-radar-accent bg-radar-surface2"
                            : "border-radar-line hover:border-radar-ink3"
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            chosen ? "bg-radar-accent" : "bg-radar-line"
                          )}
                        />
                        <span className="min-w-0 flex-1 text-[13px] text-radar-ink">
                          {subject}
                        </span>
                        <Num
                          className={cn(
                            "shrink-0 text-[11px]",
                            subject.length > 60
                              ? "text-radar-warn"
                              : "text-radar-ink3"
                          )}
                        >
                          {subject.length}
                        </Num>
                      </button>
                    );
                  })}
                </div>
              </RadarPanel>

              {/* Opening */}
              <RadarPanel
                title="Opening"
                note="The first thing a reader sees after the subject line."
              >
                <RadarTextarea
                  aria-label="Opening"
                  value={editedContent.opening}
                  readOnly={!canEditDraft}
                  onChange={(event) => {
                    setEditedContent({
                      ...editedContent,
                      opening: event.target.value,
                    });
                    setIsDirty(true);
                  }}
                  rows={4}
                />
              </RadarPanel>

              {/* Sections */}
              {editedContent.sections.map((section, sectionIndex) => (
                <RadarPanel
                  key={`${section.name}-${sectionIndex}`}
                  title={section.name}
                  note={
                    section.transition
                      ? `Leads in with: ${section.transition}`
                      : `${section.articles.length} ${section.articles.length === 1 ? "story" : "stories"}`
                  }
                >
                  <div className="flex flex-col gap-4">
                    {section.articles.map((article, articleIndex) => (
                      <div
                        key={article.id}
                        className={cn(
                          "rounded-lg border p-3.5",
                          article.isHero
                            ? "border-radar-accent"
                            : "border-radar-line2"
                        )}
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <h3 className="font-editorial m-0 text-[15px] font-medium leading-[1.3] text-radar-ink text-pretty">
                            <a
                              href={article.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-radar-ink no-underline hover:text-radar-accent"
                            >
                              {article.title}
                            </a>
                          </h3>
                          {article.isHero && (
                            <StatusChip tone="warn">Lead story</StatusChip>
                          )}
                        </div>
                        <RadarTextarea
                          aria-label={`Summary for ${article.title}`}
                          value={article.summary}
                          readOnly={!canEditDraft}
                          onChange={(event) =>
                            updateArticleSummary(
                              sectionIndex,
                              articleIndex,
                              event.target.value
                            )
                          }
                          rows={3}
                        />
                      </div>
                    ))}
                  </div>
                </RadarPanel>
              ))}

              {/* Closing */}
              <RadarPanel title="Sign-off" note="The last word and the ask.">
                <RadarTextarea
                  aria-label="Closing"
                  value={editedContent.closing}
                  readOnly={!canEditDraft}
                  onChange={(event) => {
                    setEditedContent({
                      ...editedContent,
                      closing: event.target.value,
                    });
                    setIsDirty(true);
                  }}
                  rows={4}
                />
              </RadarPanel>

              <div>
                <SectionLabel className="mb-3">This draft</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-4">
                  <StatTile
                    label="Stories"
                    value={generated.plan.totalArticles}
                  />
                  <StatTile
                    label="Sections"
                    value={editedContent.sections.length}
                  />
                  <StatTile
                    label="Subject lines"
                    value={generated.subjectLines.length}
                  />
                  <StatTile
                    label="Written"
                    value={relativeTime(generated.generatedAt)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Nothing chosen yet */}
          {!selectedEditionId && !isLoading && !isGenerating && (
            <EmptyState title="Pick an edition to write">
              Ghost Writer works from the approved stories already collected in an
              edition. Choose one above and it will plan and write the whole issue in
              about a minute.
            </EmptyState>
          )}

          {selectedEditionId &&
            !generated &&
            !isLoading &&
            !isGenerating &&
            !isLoadingDrafts &&
            drafts.length === 0 && (
              <EmptyState
                title="Ready when you are"
                actions={
                  <RadarButton variant="accent" onClick={handleGenerate}>
                    Write the edition
                  </RadarButton>
                }
              >
                {selectedEdition?.articleCount
                  ? `${selectedEdition.articleCount} approved stories are waiting in this edition.`
                  : "This edition has no approved stories yet, so there is nothing to write about."}
              </EmptyState>
            )}
        </RadarMain>
      </FeatureGate>
    </>
  );
}

"use client";

/**
 * RQ-005 action 1, 2, 4, 5 and 6: the proposal screen.
 *
 * Opening the product shows this week's edition, already assembled, with the
 * week's counts and the machine's status beside it, and one control that
 * approves and sends it (D1, D4, BR-010). The review queue is a view of this
 * same screen rather than a second screen reading the same pending-articles
 * query, which is the duplication BR-012 forbids and action 4 removes.
 *
 * All of the state lives here. The two views are presentational and take
 * callbacks, so a decision taken in the queue updates the queue, the counts and
 * the proposal in one dispatch (AC-4.5).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  SkeletonBar,
  StatusChip,
} from "@/components/radar/primitives";
import { LoadError } from "@/components/radar/controls";
import {
  buildArticleQueryString,
  defaultArticleFilters,
  type ArticleFilters,
} from "@/components/article-filters";
import { MachineStatus } from "@/components/proposal/machine-status";
import { announceOutcome } from "@/components/proposal/announce";
import { useOrgRole } from "@/components/radar/use-role";
import { useCollectionRun } from "@/components/proposal/use-collection-run";
import { useQueueActions } from "@/components/proposal/use-queue-actions";
import { ProposalView } from "@/components/proposal/proposal-view";
import { QueueView } from "@/components/proposal/queue-view";
import {
  addedToProposalOutcome,
  countsSentence,
  rejectedOutcome,
  removedFromProposalOutcome,
  removedProjectOutcome,
  thinReason,
  type Outcome,
} from "@/components/proposal/copy";
import {
  editionPatchPayload,
  initialProposalState,
  isEditable,
  proposalReducer,
  type ProposalAction,
  type ProposalArticle,
  type ProposalPayload,
  type ProposalProject,
  type QueueArticle,
} from "@/components/proposal/state";

type View = "proposal" | "queue";

export default function ProposalPage() {
  const [state, dispatch] = useReducer(proposalReducer, initialProposalState);
  const { atLeast } = useOrgRole();
  const canEdit = atLeast("EDITOR");

  /**
   * Mirror of the current state, for the writes below.
   *
   * Not an optimisation, a correctness fix. An editor control computes the next
   * edition from the current one and persists it. Reading `state` from the
   * render closure means two controls used in quick succession, or an undo
   * clicked in a toast, compute from a state that has already moved on, and the
   * PATCH then saves an edition without the change before it.
   */
  const stateRef = useRef(state);
  stateRef.current = state;

  const [view, setView] = useState<View>("proposal");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ArticleFilters>(defaultArticleFilters);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [writing, setWriting] = useState(false);
  const [sending, setSending] = useState(false);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);


  /**
   * RQ-005 AC-4.2 and AC-4.3: the view is in the URL, so the queue is linkable
   * and the old `/dashboard/review` bookmark lands on it.
   *
   * Read from `window.location` rather than `useSearchParams`, which would make
   * this whole screen need a Suspense boundary to prerender.
   */
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("view");
    if (param === "queue" || param === "proposal") setView(param);
  }, []);

  const changeView = (next: View) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "proposal") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  };

  /* ------------------------------------------------------------------ loading */

  /**
   * RQ-005 AC-1.1: one call, and the proposal exists whether or not anyone asked
   * for it. Unit B's `GET /api/editions/proposal` ensures it and returns it with
   * the week's counts and the pipeline status.
   */
  const loadProposal = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const res = await fetch("/api/editions/proposal");
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error || `This week's edition could not be loaded (${res.status})`
        );
      }

      dispatch({ type: "payloadLoaded", payload: json.data as ProposalPayload });
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "This week's edition could not be loaded"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);

    try {
      const res = await fetch(
        `/api/articles/pending?${buildArticleQueryString(filters)}`
      );
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `The queue request failed (${res.status})`);
      }

      dispatch({ type: "queueLoaded", articles: (json.data ?? []) as QueueArticle[] });
      if (json.meta?.categories) setAvailableCategories(json.meta.categories);
    } catch (cause) {
      setQueueError(
        cause instanceof Error ? cause.message : "The queue request failed"
      );
    } finally {
      setQueueLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const proposal = state.proposal;

  const loadPreview = useCallback(async (editionId: string) => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success || typeof json.html !== "string") {
        throw new Error(json?.error || `The edition could not be rendered (${res.status})`);
      }

      setPreviewHtml(json.html);
    } catch (cause) {
      setPreviewError(
        cause instanceof Error ? cause.message : "The edition could not be rendered"
      );
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (proposal?.id) void loadPreview(proposal.id);
  }, [proposal?.id, loadPreview]);

  /* ------------------------------------------------------------------ writing */

  /**
   * RQ-005 AC-6.5 and AC-2.4: an editor control writes straight through, so
   * whatever is on screen is what would be sent. There is no save step, and no
   * copy of the edition in the client that a send could take instead.
   *
   * The reducer is pure, so the next state can be computed here and persisted
   * before it is dispatched: the PATCH body and the screen can never disagree.
   */
  const applyToEdition = useCallback(
    async (action: ProposalAction, outcome?: Outcome, undo?: () => void) => {
      const current = stateRef.current;
      const next = proposalReducer(current, action);
      if (!next.proposal || next.proposal === current.proposal) return;

      dispatch(action);
      setWriting(true);

      try {
        const res = await fetch(`/api/editions/${next.proposal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editionPatchPayload(next.proposal)),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `The edition could not be updated (${res.status})`);
        }

        if (outcome) announceOutcome(outcome, undo);
        void loadPreview(next.proposal.id);
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "The edition could not be updated"
        );
        // The screen must not keep a change the server refused.
        void loadProposal();
      } finally {
        setWriting(false);
      }
    },
    [loadPreview, loadProposal]
  );

  /**
   * RQ-005 action 3: the verdicts, and what they say afterwards.
   *
   * Dispatches into the reducer above, so a decision taken here updates the
   * queue, the counts and the proposal at once (AC-4.5).
   */
  const queueActions = useQueueActions({ dispatch, reloadQueue: loadQueue });

  /* ---------------------------------------------------- proposal edit controls */

  const removeArticle = (article: ProposalArticle) =>
    void applyToEdition(
      { type: "articleRemoved", id: article.id },
      removedFromProposalOutcome(article.title),
      () =>
        void applyToEdition({ type: "articlesAdded", articles: [article] })
    );

  /** RQ-005 AC-6.4: rejecting from the proposal is a verdict on the article. */
  const rejectArticle = async (article: ProposalArticle) => {
    await applyToEdition({ type: "articleRejected", id: article.id });

    try {
      const res = await fetch(`/api/articles/${article.id}/reject`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Could not reject that story");
      }
      announceOutcome(rejectedOutcome(1), () =>
        // Undo puts the verdict back and the story back into the edition.
        void queueActions
          .undoDecision([article.id])
          .then(() =>
            applyToEdition({ type: "articlesAdded", articles: [article] })
          )
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not reject that story"
      );
    }
  };

  const addToProposal = async (
    articles: ProposalArticle[],
    projects: ProposalProject[]
  ) => {
    if (articles.length === 0 && projects.length === 0) return;
    // One action, so one write: the edition is never saved with the projects and
    // without the stories chosen in the same breath.
    await applyToEdition(
      { type: "contentAdded", articles, projects },
      addedToProposalOutcome(articles.length, projects.length)
    );
  };

  /* --------------------------------------------------------- approve and send */

  /**
   * RQ-005 AC-2.1 and AC-2.4: the send posts the edition id and nothing else, so
   * the edition as stored is what goes out. AC-2.8: a partial failure still
   * reads as sent, and says how many received it and how many failed.
   */
  const approveAndSend = async () => {
    if (!proposal) return;
    setSending(true);

    try {
      const res = await fetch("/api/email/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId: proposal.id }),
      });
      const json = await res.json().catch(() => null);
      const sent = json?.data?.sent ?? 0;
      const failed = json?.data?.failed ?? 0;

      if (!res.ok || (!json?.success && sent === 0)) {
        throw new Error(
          json?.error || `The edition was not sent (${res.status}). Nothing went out.`
        );
      }

      dispatch({
        type: "proposalSent",
        sentAt: new Date().toISOString(),
        approvedByEmail: null,
      });

      if (failed > 0) {
        toast.warning(
          `Sent to ${sent} ${sent === 1 ? "recipient" : "recipients"}, ${failed} failed`,
          {
            description:
              "The edition reads as sent because mail went out. Mail that went out cannot be recalled from a screen.",
          }
        );
      } else {
        toast.success(
          `Sent to ${sent} ${sent === 1 ? "recipient" : "recipients"}`,
          { description: "The edition records who approved it and when." }
        );
      }

      // The payload carries the approval record, so read it back rather than
      // guessing who approved it.
      await loadProposal();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "The edition was not sent"
      );
    } finally {
      setSending(false);
    }
  };

  /* ------------------------------------------------------------ collection run */

  /**
   * RQ-005 AC-5.2 and AC-5.7: the run, and its progress on the status band.
   * The stream reader lives in the hook; this only says where the result goes.
   */
  const collection = useCollectionRun({
    onProgress: (progress) =>
      dispatch({ type: "pipelineProgress", ...progress }),
    onFinished: () => {
      void loadProposal();
      void loadQueue();
    },
  });


  /* --------------------------------------------------------------------- view */

  const subtitle = useMemo(() => {
    if (!proposal) return "Assembling this week's edition.";
    return countsSentence(state.counts);
  }, [proposal, state.counts]);

  return (
    <>
      <AppHeader />

      <RadarMain width="1180px">
        <PageHeading
          eyebrow={
            proposal ? `Week ${proposal.week} · ${proposal.year}` : "This week"
          }
          title={"This week’s edition"}
          subtitle={
            <>
              {subtitle}
              {proposal?.thin && (
                <>
                  {" "}
                  <StatusChip tone="warn">thin</StatusChip>{" "}
                  {thinReason(state.counts)}
                </>
              )}
            </>
          }
          actions={
            <ChipGroup<View>
              label="Screen view"
              value={view}
              onChange={changeView}
              options={[
                { value: "proposal", label: "Proposal" },
                {
                  value: "queue",
                  label: (
                    <>
                      Queue <Num>{state.counts.pending}</Num>
                    </>
                  ),
                },
              ]}
            />
          }
        />

        <MachineStatus
          pipeline={state.pipeline}
          assembly={state.assembly}
          liveMessage={collection.liveMessage}
          canRun={canEdit}
          onRun={() => void collection.run()}
          onCancel={() => void collection.cancel()}
          cancelling={collection.cancelling}
        />

        {loadError && !loading && (
          <LoadError
            what="This week's edition"
            message={loadError}
            onRetry={() => void loadProposal()}
          />
        )}

        {loading && !proposal && (
          <div className="flex flex-col gap-4 pt-2" aria-busy="true">
            <span className="sr-only">Loading this week&rsquo;s edition</span>
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="radar-skeleton rounded-xl border border-radar-line bg-radar-surface p-4"
              >
                <SkeletonBar width="35%" height={10} />
                <SkeletonBar width="88%" height={17} className="mt-2.5" />
                <SkeletonBar width="62%" height={11} className="mt-2" />
              </div>
            ))}
          </div>
        )}

        {view === "proposal" && proposal && (
          <ProposalView
            proposal={proposal}
            recipients={state.recipients.active}
            canEdit={canEdit}
            busy={writing}
            onMoveArticle={(id, direction) =>
              void applyToEdition({ type: "articleMoved", id, direction })
            }
            onRemoveArticle={removeArticle}
            onRejectArticle={(article) => void rejectArticle(article)}
            onMoveProject={(id, direction) =>
              void applyToEdition({ type: "projectMoved", id, direction })
            }
            onRemoveProject={(project) =>
              void applyToEdition(
                { type: "projectRemoved", id: project.id },
                removedProjectOutcome(project.name),
                () =>
                  void applyToEdition({
                    type: "projectsAdded",
                    projects: [project],
                  })
              )
            }
            onAdd={addToProposal}
            onOpenQueue={() => changeView("queue")}
            previewHtml={previewHtml}
            previewLoading={previewLoading}
            previewError={previewError}
            onReloadPreview={() => proposal && void loadPreview(proposal.id)}
            onSend={approveAndSend}
            sending={sending}
          />
        )}

        {view === "queue" && (
          <QueueView
            articles={state.queue}
            loading={queueLoading}
            error={queueError}
            onRetry={() => void loadQueue()}
            filters={filters}
            onFiltersChange={setFilters}
            availableCategories={availableCategories}
            canEdit={canEdit}
            deciding={queueActions.deciding}
            onDecide={(article, verdict) =>
              void queueActions.decide(article, verdict)
            }
            bulkBusy={queueActions.bulkBusy}
            onBulk={(verdict, ids) => void queueActions.decideBulk(verdict, ids)}
            onSaveEdits={queueActions.saveEdits}
          />
        )}

        {/* The stories already approved and waiting live on the editions screen,
            which is the destination every approval points at (AC-3.6). */}
        {view === "proposal" && proposal && isEditable(proposal) && (
          <p className="mt-5 mb-0 text-[12px] text-radar-ink3">
            <Num>{state.counts.approvedWaiting}</Num> approved{" "}
            {state.counts.approvedWaiting === 1 ? "story is" : "stories are"}{" "}
            waiting for an edition.{" "}
            <Link
              href="/dashboard/send?view=pipeline#approved-waiting"
              className="text-radar-primary2 underline hover:text-radar-accent"
            >
              See the pipeline
            </Link>
          </p>
        )}

        {!loading && !loadError && !proposal && (
          <div className="pt-4">
            <RadarButton variant="accent" onClick={() => void loadProposal()}>
              Assemble this week&rsquo;s edition
            </RadarButton>
            <Link
              href="/dashboard/send"
              className={radarButtonClass("outline", "md", "ml-2.5")}
            >
              Open editions
            </Link>
          </div>
        )}
      </RadarMain>
    </>
  );
}

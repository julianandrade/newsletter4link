"use client";

/**
 * RQ-005 action 3: the verdicts, and what they say afterwards.
 *
 * Approving an article moved it somewhere real and said nothing about where,
 * which reads as losing it (BR-009). Every verdict here reports its destination
 * and carries an undo, and the same message is used for one story and for a
 * selection of them (AC-3.1 to AC-3.5).
 *
 * The state itself belongs to the screen: this hook dispatches into the screen's
 * reducer so the queue, the counts and the proposal move together (AC-4.5).
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { announceOutcome } from "./announce";
import { approvedOutcome, rejectedOutcome } from "./copy";
import type { ProposalAction, QueueArticle, Verdict } from "./state";

export interface QueueActions {
  /** Id of the row mid-decision, so a double click cannot fire two verdicts. */
  deciding: string | null;
  bulkBusy: string | null;
  decide: (article: QueueArticle, verdict: Verdict) => Promise<void>;
  decideBulk: (verdict: Verdict, ids: string[]) => Promise<void>;
  /** RQ-005 AC-3.3: back to awaiting a decision, and back into the list. */
  undoDecision: (ids: string[]) => Promise<void>;
  saveEdits: (
    article: QueueArticle,
    edits: { summary: string; category: string[] }
  ) => Promise<boolean>;
}

export function useQueueActions(options: {
  dispatch: (action: ProposalAction) => void;
  reloadQueue: () => Promise<void> | void;
}): QueueActions {
  const { dispatch, reloadQueue } = options;
  const [deciding, setDeciding] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const undoDecision = useCallback(
    async (ids: string[]) => {
      try {
        const res = await fetch("/api/articles/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset", ids }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "That decision could not be undone");
        }

        /**
         * What came back, not what was asked for.
         *
         * `reset` carries a guard, so a story another reviewer moved in between matches
         * nothing and the route answers `affected: 0` with `success: true`. Dispatching on
         * that puts the rows and the counts back in the UI over a database that never
         * changed, and the reader is told an undo worked that did not. The per-article
         * controls and the all-articles screen both branch on this; this path did not.
         */
        const affected: number = json.affected ?? ids.length;

        if (affected === 0) {
          toast.info("Nothing to undo. Somebody else changed those stories first.");
          await reloadQueue();
          return;
        }

        dispatch({ type: "decisionUndone" });
        toast.success(
          affected === 1
            ? "Back in the queue, awaiting a decision"
            : `${affected} stories are back in the queue`
        );

        // A partial undo leaves the reducer's restored rows and the database disagreeing,
        // because `decisionUndone` puts back everything it holds. Refetching is the cheap
        // way to make the list true again, and this is the rare path.
        if (affected < ids.length) await reloadQueue();
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "That decision could not be undone"
        );
        await reloadQueue();
      }
    },
    [dispatch, reloadQueue]
  );

  const decide = useCallback(
    async (article: QueueArticle, verdict: Verdict) => {
      setDeciding(article.id);

      try {
        const res = await fetch(`/api/articles/${article.id}/${verdict}`, {
          method: "POST",
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Could not ${verdict} that story`);
        }

        dispatch({ type: "queueDecided", verdict, ids: [article.id] });
        announceOutcome(
          verdict === "approve" ? approvedOutcome(1) : rejectedOutcome(1),
          () => void undoDecision([article.id])
        );
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : `Could not ${verdict} that story`
        );
      } finally {
        setDeciding(null);
      }
    },
    [dispatch, undoDecision]
  );

  const decideBulk = useCallback(
    async (verdict: Verdict, ids: string[]) => {
      setBulkBusy(verdict);

      try {
        const res = await fetch("/api/articles/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: verdict, ids }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Could not ${verdict} those stories`);
        }

        /**
         * The undo acts on what actually changed, not on the selection as it
         * was: another reviewer may have decided some of them in between, and
         * an undo must not reopen their verdict.
         */
        const affectedIds: string[] = json.affectedIds ?? ids;
        const affected: number = json.affected ?? affectedIds.length;
        const skipped: number = json.skipped ?? 0;

        dispatch({ type: "queueDecided", verdict, ids: affectedIds });

        const outcome =
          verdict === "approve" ? approvedOutcome(affected) : rejectedOutcome(affected);

        announceOutcome(
          skipped > 0
            ? {
                ...outcome,
                description: `${outcome.description ?? ""} ${skipped} were already decided by someone else.`.trim(),
              }
            : outcome,
          () => void undoDecision(affectedIds)
        );

        if (skipped > 0) await reloadQueue();
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : `Could not ${verdict} those stories`
        );
        await reloadQueue();
      } finally {
        setBulkBusy(null);
      }
    },
    [dispatch, reloadQueue, undoDecision]
  );

  const saveEdits = useCallback(
    async (
      article: QueueArticle,
      edits: { summary: string; category: string[] }
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edits),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Could not save those edits");
        }

        dispatch({
          type: "queueArticleEdited",
          id: article.id,
          summary: edits.summary,
          category: edits.category,
        });
        toast.success("Story updated");
        return true;
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Could not save those edits"
        );
        return false;
      }
    },
    [dispatch]
  );

  return { deciding, bulkBusy, decide, decideBulk, undoDecision, saveEdits };
}

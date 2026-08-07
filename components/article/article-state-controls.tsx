"use client";

/**
 * Every state an article can be moved to, from wherever it is shown.
 *
 * Before this, the only controls in the product were Approve and Reject on the queue, which
 * lists PENDING_REVIEW and nothing else. An article that had been decided was decided: the
 * detail screen carried no control at all, the approved pool was read-only, and a rejected
 * article was unreachable. This component is the single answer, mounted by every screen
 * that shows an article.
 *
 * One request shape for all five actions, `PATCH /api/articles/bulk` with a selection of
 * one, so a single verdict and a bulk verdict cannot drift apart the way the old single-id
 * routes did.
 */

import { useState } from "react";
import { toast } from "sonner";
import { RadarButton } from "@/components/radar/primitives";
import type { BulkAction } from "@/lib/articles/bulk-action";

export interface ArticleState {
  status: string;
  discardedAt: string | null;
}

/**
 * The actions worth offering, in the order they should read.
 *
 * A discarded article offers only Restore. Deciding one would be deciding something that is
 * out of every list, so the verdict would be invisible until it came back.
 */
export function nextActionsFor(article: ArticleState): BulkAction[] {
  if (article.discardedAt) return ["restore"];

  switch (article.status) {
    case "APPROVED":
      return ["reject", "reset", "discard"];
    case "REJECTED":
      return ["approve", "reset", "discard"];
    default:
      return ["approve", "reject", "discard"];
  }
}

const LABELS: Record<BulkAction, string> = {
  approve: "Approve",
  reject: "Reject",
  reset: "Back to the queue",
  discard: "Discard",
  restore: "Restore",
};

const DONE: Record<BulkAction, string> = {
  approve: "Approved, and in the pool for an edition",
  reject: "Rejected, and out of the running",
  reset: "Back in the queue, awaiting a decision",
  discard: "Discarded, and out of every list",
  restore: "Restored, with the verdict it had",
};

export function ArticleStateControls({
  article,
  articleId,
  canEdit,
  onChanged,
}: {
  article: ArticleState;
  articleId: string;
  /** RQ-005 AC-6.8: a VIEWER reads and decides nothing. */
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<BulkAction | null>(null);

  if (!canEdit) return null;

  const run = async (action: BulkAction) => {
    setBusy(action);

    try {
      const res = await fetch("/api/articles/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [articleId] }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Could not ${action} that story`);
      }

      if (json.affected === 0) {
        // The guard matched nothing, which means somebody else moved it first. Saying so
        // is better than a success message about a change that did not happen.
        toast.info("Somebody else changed this story first. Reloading it.");
      } else {
        toast.success(
          json.detachedFrom > 0
            ? `${DONE[action]}, and out of ${json.detachedFrom} open ${
                json.detachedFrom === 1 ? "edition" : "editions"
              }`
            : DONE[action]
        );
      }

      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : `Could not ${action} that story`
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nextActionsFor(article).map((action) => (
        <RadarButton
          key={action}
          size="sm"
          variant={action === "approve" || action === "restore" ? "accent" : "outline"}
          disabled={busy !== null}
          onClick={() => void run(action)}
          className={
            action === "discard" || action === "reject"
              ? "hover:border-radar-err hover:text-radar-err"
              : undefined
          }
        >
          {busy === action ? "Saving…" : LABELS[action]}
        </RadarButton>
      ))}
    </div>
  );
}

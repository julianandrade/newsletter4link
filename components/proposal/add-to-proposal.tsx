"use client";

/**
 * RQ-005 AC-6.1 and AC-6.6: add to this week's edition without leaving it.
 *
 * A shell around `CandidateList`, which is the same list the edition builder embeds
 * inline. This file used to carry its own copy of the pool, its own row markup and its
 * own selection `Set`, and the two had drifted: this one had checkboxes and the
 * builder did not, this one hid stories already used elsewhere and the builder offered
 * them, and neither had a filter beyond a search box.
 *
 * What is left here is the part that genuinely differs: this surface is a dialog, and
 * the proposal writes through on every change rather than waiting for a save.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CandidateList } from "@/components/edition/candidate-list";
import type { ProposalArticle, ProposalProject } from "./state";

export function AddToProposal({
  open,
  onOpenChange,
  onAdd,
  excludeIds,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (
    articles: ProposalArticle[],
    projects: ProposalProject[]
  ) => Promise<void> | void;
  /** What the proposal already holds, so the pool cannot offer it twice. */
  excludeIds?: string[];
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Wider than the dialog default, because the filter row is what makes a pool of
        this size workable and it does not fit in `max-w-2xl`.
      */}
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add from what is waiting</DialogTitle>
          <DialogDescription>
            Approved stories and featured projects that are not in this week&rsquo;s
            edition yet. Adding takes effect straight away, so there is nothing to
            save.
          </DialogDescription>
        </DialogHeader>

        <CandidateList
          sections={["articles", "projects"]}
          onAdd={onAdd}
          excludeIds={excludeIds}
          busy={busy}
          // The bar is sticky to the viewport when the list is a page. Inside a
          // scrolling dialog that would pin it over the rows instead of under them.
          barClassName="static bottom-auto"
        />
      </DialogContent>
    </Dialog>
  );
}

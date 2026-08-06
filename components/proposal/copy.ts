/**
 * RQ-005 BR-009: an action that moves work off the screen says where it went.
 *
 * Every sentence the proposal screen says about a decision is built here, which
 * is what makes AC-3.4 ("the same message whether one at a time or in bulk")
 * true by construction rather than by discipline. Pure functions, so the words
 * are unit tested instead of eyeballed.
 */

import type { ProposalCounts } from "./state";

export interface Destination {
  label: string;
  href: string;
}

export interface Outcome {
  /** The headline a person reads first. */
  message: string;
  /** The sentence that names the consequence, when one is needed. */
  description?: string;
  destination?: Destination;
  undo?: { label: string };
}

/**
 * RQ-005 AC-3.2 and AC-3.6: the approved-and-waiting column on the editions
 * screen. It exists already, so nothing is built for it; the defect this closes
 * is that approving never said where the story went.
 */
export const APPROVED_WAITING: Destination = {
  label: "See it waiting",
  href: "/dashboard/send?view=pipeline#approved-waiting",
};

function stories(count: number): string {
  return count === 1 ? "story" : "stories";
}

/** RQ-005 AC-3.1, AC-3.4. */
export function approvedOutcome(count: number): Outcome {
  return {
    message:
      count === 1
        ? "Approved and waiting for an edition"
        : `${count} ${stories(count)} approved and waiting for an edition`,
    description:
      "It sits in the approved pool until an edition picks it up, and this week's proposal can take it now.",
    destination: APPROVED_WAITING,
    undo: { label: "Undo" },
  };
}

/**
 * RQ-005 AC-3.5.
 *
 * No screen in the product lists rejected stories, and AC-3.6 forbids building
 * one here, so the message says plainly what rejecting does and the undo is the
 * way back rather than a link to a view that does not exist.
 */
export function rejectedOutcome(count: number): Outcome {
  return {
    message:
      count === 1
        ? "Rejected and out of the queue"
        : `${count} ${stories(count)} rejected and out of the queue`,
    description:
      "Rejected stories stay out of every edition and are not listed on any screen. Undo puts it back in the queue.",
    undo: { label: "Undo" },
  };
}

/** RQ-005 AC-6.2: removing from the proposal is not a rejection. */
export function removedFromProposalOutcome(title: string): Outcome {
  return {
    message: "Taken out of this week's edition",
    description: `${title} is back in the approved pool, waiting for an edition. It was not rejected.`,
    destination: APPROVED_WAITING,
    undo: { label: "Put it back" },
  };
}

/** RQ-005 AC-6.6: the same treatment for a project. */
export function removedProjectOutcome(name: string): Outcome {
  return {
    message: "Taken out of this week's edition",
    description: `${name} is no longer in the proposal. The project itself is untouched.`,
    undo: { label: "Put it back" },
  };
}

/** RQ-005 AC-6.1. */
export function addedToProposalOutcome(articles: number, projects: number): Outcome {
  const parts: string[] = [];
  if (articles > 0) parts.push(`${articles} ${stories(articles)}`);
  if (projects > 0)
    parts.push(`${projects} ${projects === 1 ? "project" : "projects"}`);

  // No undo here: adding moves nothing off the screen, and the Remove control
  // is on the row that was just added. BR-009 is about work that disappears.
  return {
    message: `Added to this week's edition: ${parts.join(" and ")}`,
    description: "It is in the proposal now, so it goes out when you approve it.",
  };
}

/**
 * RQ-005 AC-1.5: the week's counts, in words a business user reads without
 * hovering over anything.
 */
export function countsSentence(counts: ProposalCounts): string {
  const held = counts.rejected + counts.belowThreshold;
  return (
    `${counts.collected} ${counts.collected === 1 ? "story" : "stories"} collected this week, ` +
    `${held} rejected or below your relevance threshold, ` +
    `${counts.inProposal} in the proposal.`
  );
}

/**
 * RQ-005 AC-1.6 and AC-1.7: a light week reads as light, and the mark names the
 * reason from the counts rather than judging the week. Nothing pads the proposal
 * and nothing lowers the threshold to fill it.
 */
export function thinReason(counts: ProposalCounts): string {
  if (counts.collected === 0) {
    return (
      `Nothing was collected this week, so the proposal holds ` +
      `${counts.inProposal} ${stories(counts.inProposal)}. Collection has not run, or the sources published nothing.`
    );
  }

  return (
    `A light week: ${counts.collected} collected, ` +
    `${counts.belowThreshold} below your relevance threshold, ` +
    `${counts.rejected} rejected. The proposal holds ${counts.inProposal} ` +
    `${stories(counts.inProposal)} and was not padded to look fuller.`
  );
}

/**
 * RQ-005 AC-2.3: one confirmation, stating the edition, the number of articles
 * and the number of active recipients.
 */
export function sendConfirmation(input: {
  /**
   * RQ-008: what the edition is called, not its week.
   *
   * This took `week` and `year` and wrote "Week 32 of 2026 goes out now", which is wrong
   * as soon as two editions share a week and was never right for a special edition.
   */
  label: string;
  articles: number;
  projects: number;
  recipients: number;
}): string {
  return (
    `${input.label} goes out now: ` +
    `${input.articles} ${stories(input.articles)} and ` +
    `${input.projects} ${input.projects === 1 ? "project" : "projects"}, to ` +
    `${input.recipients} active ${input.recipients === 1 ? "recipient" : "recipients"}. ` +
    `Mail that has gone out cannot be recalled.`
  );
}

/** RQ-005 AC-2.6 and AC-2.10: who approved it, and when. */
export function sentBySentence(
  approvedByEmail: string | null,
  approvedAt: string | null
): string {
  const when = approvedAt
    ? new Date(approvedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "an unrecorded time";

  return approvedByEmail
    ? `Sent ${when}, approved by ${approvedByEmail}.`
    : `Sent ${when}.`;
}

/** RQ-005 AC-5.3 and AC-5.6: the pipeline reason, in the product's own words. */
export function runReasonSentence(reason: string): string {
  switch (reason) {
    case "never-run":
      return "Collection has never run for this organization, so a run is needed.";
    case "last-run-failed":
      return "The last collection failed, so a run is needed. The counts below are from that failed run.";
    case "stale":
      return "The last collection is more than a day old, so a run is needed.";
    case "running":
      return "A collection is running now. No run is needed.";
    case "current":
      return "Collection is current. No run is needed.";
    default:
      return "The collector has not reported a state.";
  }
}

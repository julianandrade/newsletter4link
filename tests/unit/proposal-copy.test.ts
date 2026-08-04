import { describe, expect, it } from "vitest";
import {
  addedToProposalOutcome,
  approvedOutcome,
  APPROVED_WAITING,
  countsSentence,
  rejectedOutcome,
  removedFromProposalOutcome,
  removedProjectOutcome,
  runReasonSentence,
  sendConfirmation,
  sentBySentence,
  thinReason,
} from "@/components/proposal/copy";
import { emptyCounts, type ProposalCounts } from "@/components/proposal/state";

/**
 * RQ-005 BR-009: when an action moves work off the screen a person is using, the
 * interface must say where it went. Approving used to move an article somewhere
 * real and say nothing about where, which read as losing it. These tests are
 * what keeps the words honest.
 */

const counts = (over: Partial<ProposalCounts> = {}): ProposalCounts => ({
  ...emptyCounts,
  collected: 40,
  rejected: 6,
  belowThreshold: 32,
  inProposal: 2,
  approvedWaiting: 3,
  pending: 5,
  ...over,
});

describe("approvedOutcome", () => {
  it("names the destination and carries an undo", () => {
    // RQ-005 AC-3.1, AC-3.2, AC-3.3.
    const outcome = approvedOutcome(1);
    expect(outcome.message).toContain("waiting for an edition");
    expect(outcome.destination).toEqual(APPROVED_WAITING);
    expect(outcome.undo).toBeDefined();
  });

  it("points at the approved and waiting column that already exists", () => {
    // RQ-005 AC-3.6: no screen is built for the destination.
    expect(APPROVED_WAITING.href).toBe(
      "/dashboard/send?view=pipeline#approved-waiting"
    );
  });

  it("reports the count in bulk, with the same destination and undo as one", () => {
    // RQ-005 AC-3.4: the same message whether one at a time or in bulk.
    const single = approvedOutcome(1);
    const bulk = approvedOutcome(7);

    expect(bulk.message).toContain("7");
    expect(bulk.message).toContain("stories");
    expect(bulk.destination).toEqual(single.destination);
    expect(bulk.undo).toEqual(single.undo);
  });

  it("says story for one and stories for many", () => {
    expect(approvedOutcome(2).message).toContain("2 stories");
    expect(approvedOutcome(1).message).not.toContain("stories");
  });
});

describe("rejectedOutcome", () => {
  it("says what rejecting does and always carries an undo", () => {
    // RQ-005 AC-3.5. No screen lists rejected stories and AC-3.6 forbids
    // building one, so the undo is the way back rather than a dead link.
    const outcome = rejectedOutcome(1);
    expect(outcome.message).toContain("out of the queue");
    expect(outcome.description).toContain("out of every edition");
    expect(outcome.undo).toBeDefined();
    expect(outcome.destination).toBeUndefined();
  });

  it("reports the count in bulk with the same undo", () => {
    const bulk = rejectedOutcome(23);
    expect(bulk.message).toContain("23 stories");
    expect(bulk.undo).toEqual(rejectedOutcome(1).undo);
  });
});

describe("removedFromProposalOutcome", () => {
  it("says the story went back to waiting and was not rejected", () => {
    // RQ-005 AC-6.2: removing from the edition is not a verdict.
    const outcome = removedFromProposalOutcome("A story about MCP");
    expect(outcome.description).toContain("A story about MCP");
    expect(outcome.description).toContain("was not rejected");
    expect(outcome.destination).toEqual(APPROVED_WAITING);
    expect(outcome.undo).toBeDefined();
  });

  it("gives a project the same treatment", () => {
    // RQ-005 AC-6.6.
    const outcome = removedProjectOutcome("Claims triage");
    expect(outcome.description).toContain("Claims triage");
    expect(outcome.undo).toBeDefined();
  });
});

describe("addedToProposalOutcome", () => {
  it("names what was added", () => {
    expect(addedToProposalOutcome(2, 0).message).toContain("2 stories");
    expect(addedToProposalOutcome(0, 1).message).toContain("1 project");
    expect(addedToProposalOutcome(1, 2).message).toContain("1 story and 2 projects");
  });
});

describe("countsSentence", () => {
  it("states collected, held back and in the proposal, in words", () => {
    // RQ-005 AC-1.5: a business user reads this without hovering over anything.
    const sentence = countsSentence(counts());
    expect(sentence).toContain("40 stories collected");
    expect(sentence).toContain("38 rejected or below your relevance threshold");
    expect(sentence).toContain("2 in the proposal");
  });
});

describe("thinReason", () => {
  it("names the collected and below-threshold counts rather than judging the week", () => {
    // RQ-005 AC-1.6 and AC-1.7: it says why, and says nothing was padded.
    const reason = thinReason(counts({ collected: 40, belowThreshold: 38, rejected: 0, inProposal: 2 }));
    expect(reason).toContain("40 collected");
    expect(reason).toContain("38 below your relevance threshold");
    expect(reason).toContain("2");
    expect(reason).toContain("not padded");
  });

  it("says so plainly when nothing was collected at all", () => {
    const reason = thinReason(counts({ collected: 0, belowThreshold: 0, rejected: 0, inProposal: 0 }));
    expect(reason).toContain("Nothing was collected");
  });
});

describe("sendConfirmation", () => {
  it("states the edition, the number of articles and the number of recipients", () => {
    // RQ-005 AC-2.3: one confirmation, with the real numbers in it.
    const sentence = sendConfirmation({
      week: 32,
      year: 2026,
      articles: 6,
      projects: 2,
      recipients: 412,
    });

    expect(sentence).toContain("Week 32 of 2026");
    expect(sentence).toContain("6 stories");
    expect(sentence).toContain("2 projects");
    expect(sentence).toContain("412 active recipients");
  });

  it("keeps the singular readable", () => {
    const sentence = sendConfirmation({
      week: 1,
      year: 2027,
      articles: 1,
      projects: 1,
      recipients: 1,
    });
    expect(sentence).toContain("1 story");
    expect(sentence).toContain("1 project");
    expect(sentence).toContain("1 active recipient");
  });
});

describe("sentBySentence", () => {
  it("names who approved it and when", () => {
    // RQ-005 AC-2.6 and AC-2.10.
    const sentence = sentBySentence(
      "julian.andrade@example.com",
      "2026-08-03T10:00:00.000Z"
    );
    expect(sentence).toContain("julian.andrade@example.com");
    expect(sentence).toContain("2026");
  });

  it("does not invent an approver when none was recorded", () => {
    expect(sentBySentence(null, "2026-08-03T10:00:00.000Z")).not.toContain(
      "approved by"
    );
  });
});

describe("runReasonSentence", () => {
  it("says whether a run is needed, in those terms", () => {
    // RQ-005 AC-5.3: learning this never requires starting a run.
    expect(runReasonSentence("never-run")).toContain("a run is needed");
    expect(runReasonSentence("stale")).toContain("a run is needed");
    expect(runReasonSentence("current")).toContain("No run is needed");
    expect(runReasonSentence("running")).toContain("No run is needed");
  });

  it("says a failure was a failure rather than showing it as current", () => {
    // RQ-005 AC-5.6.
    const sentence = runReasonSentence("last-run-failed");
    expect(sentence).toContain("failed");
    expect(sentence).toContain("a run is needed");
  });
});

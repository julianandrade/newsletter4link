import { describe, expect, it } from "vitest";
import { previewSourceChoice } from "@/app/api/email/preview/route";

/**
 * Which body a preview of a real edition renders, and in which order the question is
 * asked.
 *
 * The order is the whole test. `POST /api/email/preview` has three candidate bodies: the
 * frozen record of a send, an approved generation draft, and the edition's current rows.
 * The draft branch pairs draft titles with categories read from the live `Article` rows,
 * so if it were consulted first a draft approved after the send would produce a
 * half-frozen preview: historical text, current metadata, and nothing on the screen saying
 * which is which. That is the merge lib/editions/sent-snapshot.ts refuses, and asking
 * "frozen?" first is what prevents it.
 *
 * Pure unit test against the exported helper, in the shape the rest of tests/unit uses.
 * There is no route harness in this repo.
 */

describe("previewSourceChoice", () => {
  it("renders the frozen record of a send when there is one", () => {
    expect(previewSourceChoice({ frozen: true, approvedDraftSections: 0 })).toBe("frozen");
  });

  it("keeps the frozen record even when a draft was approved after the send", () => {
    // The regression this ordering exists for. A draft can be approved at any time,
    // including after the edition went out, and approving one must not rewrite the
    // record of what subscribers received.
    expect(previewSourceChoice({ frozen: true, approvedDraftSections: 3 })).toBe("frozen");
  });

  it("uses an approved draft on an edition that has no frozen record", () => {
    expect(previewSourceChoice({ frozen: false, approvedDraftSections: 2 })).toBe(
      "approved-draft"
    );
  });

  it("falls back to the live rows when neither is there", () => {
    expect(previewSourceChoice({ frozen: false, approvedDraftSections: 0 })).toBe("live");
  });

  it("treats a draft with no sections as no draft at all", () => {
    // An approved draft whose content generated nothing must not blank the preview: the
    // route's draft branch would map an empty sections array to an edition with no
    // articles.
    expect(previewSourceChoice({ frozen: false, approvedDraftSections: 0 })).toBe("live");
  });
});

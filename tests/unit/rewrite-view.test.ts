import { describe, expect, it } from "vitest";
import {
  formatInputMode,
  resolveLinkTakeState,
  type LinkTakePayload,
  type ViewRewrite,
} from "@/lib/rewrite/view";

/**
 * RQ-006_03: the state resolution the screen rests on, tested without a DOM.
 *
 * The distinction this file exists to protect is `absent` against `refused`. Both
 * arrive from the API as `rewrite: null`, and telling them apart by comparing an
 * English sentence would break silently the first time somebody reworded it.
 *
 * The body parser has its own file, `markdown-blocks.test.ts`, because it has its own
 * module and knows nothing about rewrites.
 */

const ATTRIBUTION = {
  publication: "reuters.com",
  url: "https://www.reuters.com/technology/ai-act-banks",
  publishedAt: "2026-08-05T07:00:00.000Z",
  capturedAt: "2026-08-05T08:30:00.000Z",
  originalTitle: "EU AI Act high-risk obligations bite for banks",
};

const REWRITE: ViewRewrite = {
  id: "rw1",
  title: "O AI Act chega aos bancos, e a conformidade deixa de ser teoria",
  body: "A supervisao abriu as primeiras revisoes.\n\n## Relevancia para a Link\n\nTres clientes nossos correm modelos de scoring.",
  language: "pt-PT",
  inputMode: "FULL_TEXT",
  generatedAt: "2026-08-05T09:12:00.000Z",
  model: "claude-haiku-4-5-20251001",
  checkSummary: "passed: 204 words, longest run shared with the source 1 words",
  longestSharedRun: 1,
  wordCount: 204,
};

function payload(over: Partial<LinkTakePayload> = {}): LinkTakePayload {
  return {
    attribution: ATTRIBUTION,
    rewrite: null,
    unavailableReason: null,
    stale: false,
    attempted: false,
    summary: "Supervisors in three member states have opened the first reviews.",
    ...over,
  };
}

describe("resolveLinkTakeState", () => {
  it("is ready when a rewrite exists and the article has not changed", () => {
    const state = resolveLinkTakeState(payload({ rewrite: REWRITE }));
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") expect(state.rewrite.id).toBe("rw1");
  });

  it("is stale when a rewrite exists and the article changed after it", () => {
    const state = resolveLinkTakeState(payload({ rewrite: REWRITE, stale: true }));
    expect(state.kind).toBe("stale");
    // The prose still travels with the state: it was verified against the text it
    // was written from, and hiding it would lose information for no gain.
    if (state.kind === "stale") expect(state.rewrite.body).toContain("Relevancia");
  });

  it("is absent when nothing has ever been attempted", () => {
    const state = resolveLinkTakeState(
      payload({
        attempted: false,
        unavailableReason: "No Link Take has been written for this article yet.",
      })
    );
    expect(state.kind).toBe("absent");
  });

  it("is refused when an attempt was made and produced nothing usable", () => {
    const state = resolveLinkTakeState(
      payload({
        attempted: true,
        unavailableReason:
          "The checks refused it after 2 attempts: verbatim, unsupported-number.",
      })
    );
    expect(state.kind).toBe("refused");
    if (state.kind === "refused") {
      expect(state.reason).toContain("unsupported-number");
    }
  });

  it("does not read the reason to decide, so a reworded sentence changes nothing", () => {
    // The same fallback wording as the route uses, but attempted: true. If the
    // resolution matched on the sentence this would come back as absent, and the
    // screen would offer to write a piece that was already refused.
    const state = resolveLinkTakeState(
      payload({
        attempted: true,
        unavailableReason: "No Link Take has been written for this article yet.",
      })
    );
    expect(state.kind).toBe("refused");
  });

  it("still has a reason to show when the API sent none", () => {
    const state = resolveLinkTakeState(payload({ attempted: true }));
    expect(state.kind).toBe("refused");
    if (state.kind === "refused") expect(state.reason.length).toBeGreaterThan(0);
  });

  it("prefers the rewrite over the attempted flag, since a passing piece is readable", () => {
    const state = resolveLinkTakeState(payload({ rewrite: REWRITE, attempted: true }));
    expect(state.kind).toBe("ready");
  });
});

describe("formatInputMode", () => {
  it("says what the piece was written from, in words a person reads", () => {
    expect(formatInputMode("FULL_TEXT")).toBe("full article text");
    expect(formatInputMode("EXCERPT")).toBe("feed excerpt only");
  });
});

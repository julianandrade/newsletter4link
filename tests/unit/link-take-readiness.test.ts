import { describe, expect, it } from "vitest";
import { linkTakeReadiness, linkTakeBlockReason } from "@/lib/editions/link-take-readiness";

const row = (over: Partial<Parameters<typeof linkTakeReadiness>[0][number]> = {}) => ({
  articleId: "a",
  title: "OpenAI ships agent mode",
  useLinkTake: false,
  hasUsableTake: false,
  ...over,
});

describe("linkTakeReadiness", () => {
  it("is ready when nothing is flagged", () => {
    const result = linkTakeReadiness([row(), row({ articleId: "b" })]);
    expect(result).toEqual({ flagged: 0, missing: [], ready: true });
  });

  it("is ready when every flagged story has a usable take", () => {
    const result = linkTakeReadiness([row({ useLinkTake: true, hasUsableTake: true })]);
    expect(result.flagged).toBe(1);
    expect(result.ready).toBe(true);
  });

  it("is blocked when a flagged story has none, and names it", () => {
    const result = linkTakeReadiness([
      row({ useLinkTake: true, hasUsableTake: true }),
      row({ articleId: "b", title: "Segunda", useLinkTake: true, hasUsableTake: false }),
    ]);
    expect(result.flagged).toBe(2);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([{ articleId: "b", title: "Segunda" }]);
  });

  it("ignores an unflagged story that happens to have no take", () => {
    const result = linkTakeReadiness([row({ useLinkTake: false, hasUsableTake: false })]);
    expect(result.ready).toBe(true);
  });
});

describe("linkTakeBlockReason", () => {
  it("is null when ready", () => {
    expect(linkTakeBlockReason({ flagged: 2, missing: [], ready: true })).toBeNull();
  });

  it("names the stories when blocked", () => {
    const reason = linkTakeBlockReason({
      flagged: 2,
      missing: [{ articleId: "b", title: "Segunda" }],
      ready: false,
    });
    expect(reason).toContain("Segunda");
    expect(reason).toContain("Link Take");
  });
});

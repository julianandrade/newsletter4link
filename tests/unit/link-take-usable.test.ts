import { describe, expect, it } from "vitest";
import { isUsableTake } from "@/lib/rewrite/usable";

const passing = {
  id: "r1",
  title: "Titulo",
  body: "Corpo",
  language: "pt-PT",
  model: "claude-sonnet-5",
  inputMode: "FULL_TEXT" as const,
  status: "GENERATED" as const,
  checksPassed: true,
  checkSummary: null,
  longestSharedRun: 4,
  wordCount: 210,
  generatedAt: new Date(),
  error: null,
  instruction: null,
};

describe("isUsableTake", () => {
  it("accepts a generated take that passed its checks and is current", () => {
    expect(isUsableTake({ rewrite: passing, stale: false })).toBe(true);
  });

  it("refuses when there is no take at all", () => {
    expect(isUsableTake({ rewrite: null, stale: false })).toBe(false);
  });

  it("refuses a FAILED take", () => {
    expect(
      isUsableTake({ rewrite: { ...passing, status: "FAILED", checksPassed: false }, stale: false })
    ).toBe(false);
  });

  // A piece that passed its checks but whose article moved underneath it is an analysis of
  // a version of the story that no longer exists.
  it("refuses a stale take", () => {
    expect(isUsableTake({ rewrite: passing, stale: true })).toBe(false);
  });

  it("refuses a take whose checks did not pass, whatever its status says", () => {
    expect(isUsableTake({ rewrite: { ...passing, checksPassed: false }, stale: false })).toBe(false);
  });

  it("refuses a take with an empty body", () => {
    expect(isUsableTake({ rewrite: { ...passing, body: "  " }, stale: false })).toBe(false);
  });
});

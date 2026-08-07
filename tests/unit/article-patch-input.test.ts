import { describe, expect, it } from "vitest";
import { parseArticlePatch } from "@/lib/articles/patch-input";

const ok = (body: unknown) => {
  const parsed = parseArticlePatch(body);
  if ("error" in parsed) throw new Error(`expected a parse, got: ${parsed.error}`);
  return parsed.data;
};

const err = (body: unknown) => {
  const parsed = parseArticlePatch(body);
  if (!("error" in parsed)) throw new Error("expected a refusal, got a parse");
  return parsed.error;
};

describe("parseArticlePatch", () => {
  it("accepts the six editable fields", () => {
    expect(
      ok({
        title: "A model ships",
        summary: "Why it matters.",
        sourceUrl: "https://example.test/a1",
        author: "Someone",
        publishedAt: "2026-08-01T10:00:00.000Z",
        category: ["Models"],
      })
    ).toEqual({
      title: "A model ships",
      summary: "Why it matters.",
      sourceUrl: "https://example.test/a1",
      author: "Someone",
      publishedAt: new Date("2026-08-01T10:00:00.000Z"),
      category: ["Models"],
    });
  });

  it("only includes the fields that were sent", () => {
    // A PATCH that names one field must not blank the other five.
    expect(ok({ summary: "Just this" })).toEqual({ summary: "Just this" });
  });

  it("refuses a body with nothing editable in it", () => {
    expect(err({})).toContain("No valid fields");
    expect(err({ status: "APPROVED" })).toContain("No valid fields");
    expect(err({ relevanceScore: 9 })).toContain("No valid fields");
  });

  it("refuses a title that is blank, because the newsletter renders it", () => {
    expect(err({ title: "   " })).toContain("title");
  });

  it("trims a title and an author", () => {
    expect(ok({ title: "  Spaced  ", author: "  Someone  " })).toEqual({
      title: "Spaced",
      author: "Someone",
    });
  });

  it("clears an author with an empty string, since not every story has one", () => {
    expect(ok({ author: "" })).toEqual({ author: null });
  });

  it("refuses a sourceUrl that is not an http or https URL", () => {
    // The value becomes an href in a mail client. javascript: must never reach one.
    expect(err({ sourceUrl: "javascript:alert(1)" })).toContain("http");
    expect(err({ sourceUrl: "not a url" })).toContain("http");
    expect(err({ sourceUrl: "ftp://example.test/x" })).toContain("http");
    expect(ok({ sourceUrl: "https://example.test/x" }).sourceUrl).toBe(
      "https://example.test/x"
    );
  });

  it("refuses a publishedAt that is not a date, and accepts null to clear it", () => {
    expect(err({ publishedAt: "sometime last week" })).toContain("date");
    expect(ok({ publishedAt: null })).toEqual({ publishedAt: null });
  });

  it("drops blank categories and deduplicates the rest", () => {
    expect(ok({ category: ["Models", "  ", "Models", " Agents "] })).toEqual({
      category: ["Models", "Agents"],
    });
  });

  it("refuses a category array holding something other than strings", () => {
    expect(err({ category: ["Models", 7] })).toContain("category");
  });

  it("survives a body that is not an object", () => {
    expect(err(null)).toBeTruthy();
    expect(err("title")).toBeTruthy();
    expect(err([])).toBeTruthy();
  });
});

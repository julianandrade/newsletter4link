import { describe, expect, it } from "vitest";
import { MAX_BRAND_VOICE_CHARS, parseSettingsPatch } from "@/lib/settings-input";
import {
  MAX_ORG_CONTEXT_CHARS,
  MAX_RELEVANCE_HEADING_CHARS,
} from "@/lib/rewrite/config";

/**
 * What a settings save may change, and what it may be.
 *
 * The validation was fourteen inline branches in the route and had no test at all, which is
 * how three fields the rewrite pipeline reads came to be missing from it without anything
 * noticing. The allowlist is the security property here: `updateOrgSettings` hands whatever
 * it is given to Prisma.
 */

function updates(body: unknown): Record<string, unknown> {
  const parsed = parseSettingsPatch(body);
  if (!parsed.ok) throw new Error(`expected ok, got: ${parsed.error}`);
  return parsed.updates;
}

function error(body: unknown): string {
  const parsed = parseSettingsPatch(body);
  if (parsed.ok) throw new Error("expected a refusal");
  return parsed.error;
}

describe("the allowlist", () => {
  it("ignores a field nobody may write", () => {
    // The point of the allowlist: OrgSettings has columns this endpoint must not touch, and
    // an unknown key is dropped rather than refused, so a newer client is not broken by it.
    expect(updates({ organizationId: "org-2", id: "x" })).toEqual({});
  });

  it("ignores a field of the wrong type rather than storing it", () => {
    expect(updates({ relevanceThreshold: "8", aiModel: 5 })).toEqual({});
  });

  it("refuses a body that is not an object", () => {
    expect(error(null)).toMatch(/must be an object/);
    expect(error("relevanceThreshold=8")).toMatch(/must be an object/);
  });
});

describe("the numbers keep their bounds", () => {
  it("accepts what is in range", () => {
    expect(
      updates({
        relevanceThreshold: 7.5,
        maxArticlesPerEdition: 12,
        vectorSimilarityThreshold: 0.9,
        articleMaxAgeDays: 14,
      })
    ).toEqual({
      relevanceThreshold: 7.5,
      maxArticlesPerEdition: 12,
      vectorSimilarityThreshold: 0.9,
      articleMaxAgeDays: 14,
    });
  });

  it("names the field and the bounds when it refuses", () => {
    expect(error({ relevanceThreshold: 11 })).toBe(
      "relevanceThreshold must be between 0 and 10"
    );
    expect(error({ vectorSimilarityThreshold: 1.2 })).toMatch(/between 0 and 1/);
    expect(error({ maxArticlesPerEdition: 0 })).toMatch(/between 1 and 100/);
    expect(error({ articleMaxAgeDays: 400 })).toMatch(/between 1 and 365/);
  });

  it("refuses NaN, which is what an emptied number field sends", () => {
    // parseFloat("") in the settings screen. Stored, it would break every curation run.
    expect(error({ relevanceThreshold: Number.NaN })).toMatch(/between 0 and 10/);
  });
});

describe("the closed lists", () => {
  it("accepts a model the product offers", () => {
    expect(updates({ aiModel: "claude-sonnet-5" })).toEqual({
      aiModel: "claude-sonnet-5",
    });
  });

  it("refuses one it does not, rather than failing on the next run", () => {
    expect(error({ aiModel: "gpt-9" })).toBe("Unknown aiModel");
    expect(error({ embeddingModel: "something" })).toBe("Unknown embeddingModel");
  });

  it("holds the prose language to the offered tags", () => {
    expect(updates({ rewriteLanguage: "en-GB" })).toEqual({
      rewriteLanguage: "en-GB",
    });
    // A hand-typed value would silently stop asides matching, which are compared on it by
    // exact string.
    expect(error({ rewriteLanguage: "Portugues" })).toBe("Unknown rewriteLanguage");
  });
});

describe("the free text", () => {
  it("stores it, and treats an emptied field as cleared", () => {
    expect(updates({ brandVoicePrompt: "Plain and concrete." })).toEqual({
      brandVoicePrompt: "Plain and concrete.",
    });
    expect(updates({ brandVoicePrompt: "" })).toEqual({ brandVoicePrompt: null });
    expect(updates({ orgContextPrompt: null })).toEqual({ orgContextPrompt: null });
  });

  it("holds each field to its own cap", () => {
    expect(error({ brandVoicePrompt: "a".repeat(MAX_BRAND_VOICE_CHARS + 1) })).toMatch(
      /brandVoicePrompt must be 500/
    );
    expect(
      error({ orgContextPrompt: "a".repeat(MAX_ORG_CONTEXT_CHARS + 1) })
    ).toMatch(/orgContextPrompt must be 1000/);

    // Exactly the cap passes, which is the boundary a `>` and a `>=` disagree on.
    expect(
      updates({ orgContextPrompt: "a".repeat(MAX_ORG_CONTEXT_CHARS) })
    ).toHaveProperty("orgContextPrompt");
  });
});

/**
 * The organization's description, and the heading of the section it grounds.
 *
 * Both are read by `lib/rewrite/pipeline.ts` and neither was writable before 11 August
 * 2026. The heading is the one field here that cannot be cleared: the column is not
 * nullable and the value is printed as a heading inside the prose.
 */
describe("the relevance heading", () => {
  it("is trimmed and stored", () => {
    expect(updates({ relevanceHeading: "  Why this matters to Acme  " })).toEqual({
      relevanceHeading: "Why this matters to Acme",
    });
  });

  it("cannot be emptied, and says why", () => {
    expect(error({ relevanceHeading: "" })).toMatch(/cannot be empty/);
    expect(error({ relevanceHeading: "   " })).toMatch(/cannot be empty/);
  });

  it("is one line, not a paragraph", () => {
    expect(
      error({ relevanceHeading: "a".repeat(MAX_RELEVANCE_HEADING_CHARS + 1) })
    ).toMatch(/80 characters or less/);
  });
});

import { describe, expect, it } from "vitest";
import { dayBounds, utcDay } from "@/lib/radar/sources";
import { targetDay } from "@/lib/radar/collect";
import { PRECISION_THRESHOLD, SEED_WATCHLIST } from "@/lib/radar/watchlist";

describe("utcDay", () => {
  it("truncates to midnight UTC", () => {
    expect(utcDay(new Date("2026-08-03T13:47:12.345Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });

  it("is idempotent", () => {
    const once = utcDay(new Date("2026-08-03T13:47:12.345Z"));
    expect(utcDay(once).toISOString()).toBe(once.toISOString());
  });

  it("does not shift a time near either edge of the day", () => {
    expect(utcDay(new Date("2026-08-03T00:00:00.000Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
    expect(utcDay(new Date("2026-08-03T23:59:59.999Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });
});

describe("dayBounds", () => {
  it("spans exactly one day, half open", () => {
    const { startSeconds, endSeconds } = dayBounds(new Date("2026-08-03T09:00:00Z"));

    expect(startSeconds).toBe(Date.UTC(2026, 7, 3) / 1000);
    expect(endSeconds - startSeconds).toBe(86_400);
  });

  it("leaves no overlap between consecutive days", () => {
    // The filter is created_at_i >= start AND < end, so one day's end is the next
    // day's start and an item at midnight is counted once, not twice.
    const first = dayBounds(new Date("2026-08-03T00:00:00Z"));
    const second = dayBounds(new Date("2026-08-04T00:00:00Z"));

    expect(first.endSeconds).toBe(second.startSeconds);
  });

  it("ignores the time of day it is given", () => {
    const early = dayBounds(new Date("2026-08-03T00:00:01Z"));
    const late = dayBounds(new Date("2026-08-03T23:59:59Z"));

    expect(early).toEqual(late);
  });
});

describe("targetDay", () => {
  it("collects yesterday, never today", () => {
    // A day counted while it is still running records a partial figure, and with no
    // backfill there is no way to correct it later.
    expect(targetDay(new Date("2026-08-05T06:00:00Z")).toISOString()).toBe(
      "2026-08-04T00:00:00.000Z"
    );
  });

  it("steps back across a month boundary", () => {
    expect(targetDay(new Date("2026-08-01T06:00:00Z")).toISOString()).toBe(
      "2026-07-31T00:00:00.000Z"
    );
  });

  it("steps back across a year boundary", () => {
    expect(targetDay(new Date("2027-01-01T06:00:00Z")).toISOString()).toBe(
      "2026-12-31T00:00:00.000Z"
    );
  });

  it("returns the same day whatever hour the cron fires", () => {
    const early = targetDay(new Date("2026-08-05T00:05:00Z"));
    const late = targetDay(new Date("2026-08-05T23:55:00Z"));

    expect(early.toISOString()).toBe(late.toISOString());
  });
});

describe("the seed watchlist", () => {
  it("is the size the scope revision asked for", () => {
    // Fifteen to twenty-five: enough to see movement, few enough that every query
    // can be checked by hand before a day of data exists.
    expect(SEED_WATCHLIST.length).toBeGreaterThanOrEqual(15);
    expect(SEED_WATCHLIST.length).toBeLessThanOrEqual(25);
  });

  it("has unique slugs", () => {
    const slugs = SEED_WATCHLIST.map((entity) => entity.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses slugs that are safe to put in a URL or a report", () => {
    for (const entity of SEED_WATCHLIST) {
      expect(entity.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives every entity at least one source to be counted from", () => {
    for (const entity of SEED_WATCHLIST) {
      expect(
        entity.hnQuery !== null || entity.arxivQuery !== null,
        `${entity.slug} has no query at all`
      ).toBe(true);
    }
  });

  it("never reuses a bare ambiguous name as a query", () => {
    /**
     * The failure the plan review calls make-or-break. Ambiguity is a property of
     * the corpus, not of the word, so the lists differ by source: Hacker News is a
     * general-interest forum where a llama is an animal and Mistral is a wind, while
     * arXiv is a research corpus where "LLaMA" in a paper is the model. Each entry
     * names the other meaning, so removing a qualifier is a deliberate act.
     */
    const ambiguousOnHn: Record<string, string> = {
      claude: "a given name",
      gemini: "a constellation and a crypto exchange",
      mistral: "a wind",
      llama: "an animal",
      cursor: "a UI element",
      bedrock: "geology",
      rag: "a cloth",
    };

    /**
     * arXiv needs a different rule, because its noise has a different cause and the
     * central category filter already removed most of it. Sampling showed the
     * nuclear-physics MISTRAL and the astronomical Gemini disappear once the search
     * is confined to cs.AI, cs.CL and cs.LG.
     *
     * What the filter cannot fix is that the `all:` field includes the author list,
     * so a person-like name queried through `all:` counts every computing paper by
     * anyone with that name. Those must use `abs:` or `ti:`.
     */
    const personLike = ["claude", "gemini", "mistral"];

    const bareOf = (query: string) =>
      query.toLowerCase().replace(/^(all|abs|ti):/, "").replace(/"/g, "").trim();

    for (const entity of SEED_WATCHLIST) {
      if (entity.hnQuery) {
        const bare = bareOf(entity.hnQuery);
        expect(
          ambiguousOnHn[bare],
          `${entity.slug} queries Hacker News for the bare word "${bare}", which is ${ambiguousOnHn[bare]}`
        ).toBeUndefined();
      }

      if (entity.arxivQuery) {
        const bare = bareOf(entity.arxivQuery);
        if (personLike.includes(bare)) {
          expect(
            entity.arxivQuery.startsWith("all:"),
            `${entity.slug} queries arXiv with all:"${bare}", which includes the author list`
          ).toBe(false);
        }
      }
    }
  });

  it("quotes any arXiv query that is a multi-word phrase", () => {
    for (const entity of SEED_WATCHLIST) {
      const query = entity.arxivQuery;
      if (!query) continue;

      // Each field term must be quoted or be a single word, or arXiv reads the words
      // as separate terms and the count stops meaning the phrase.
      for (const term of query.split(/\s+AND\s+/)) {
        const value = term.replace(/^all:/, "");
        if (value.includes(" ")) {
          expect(value.startsWith('"') && value.endsWith('"'), `${entity.slug}: ${term}`).toBe(
            true
          );
        }
      }
    }
  });

  it("keeps a note on every entity whose query needed a judgement call", () => {
    const needExplaining = [
      "claude",
      "gemini",
      "llama",
      "mistral",
      "model-context-protocol",
      "retrieval-augmented-generation",
      "cursor-editor",
      "aws-bedrock",
      "copilot",
    ];

    for (const slug of needExplaining) {
      const entity = SEED_WATCHLIST.find((candidate) => candidate.slug === slug);
      expect(entity, `${slug} is missing from the watchlist`).toBeDefined();
      expect(entity?.note, `${slug} has no note explaining its query`).toBeTruthy();
    }
  });

  it("sets a precision bar that rejects a coin flip", () => {
    expect(PRECISION_THRESHOLD).toBeGreaterThan(0.5);
    expect(PRECISION_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

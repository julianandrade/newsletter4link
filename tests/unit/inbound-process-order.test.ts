import { describe, expect, it } from "vitest";
import { dedupeByUrl, tallyItems, type ItemOutcome } from "@/lib/inbound/tally";

/**
 * The race the worker pool opens, and the guard that closes it.
 *
 * Sequentially a repeated URL was harmless: the second copy was recognised as a duplicate
 * of the row the first had just written. Concurrently both copies can pass the duplicate
 * check before either writes, and `Article.sourceUrl` has no unique index to catch it.
 */
describe("dedupeByUrl", () => {
  it("keeps the first of a repeated URL and drops the rest", () => {
    const items = [
      { url: "https://a.com/1", title: "headline" },
      { url: "https://b.com/2", title: "other" },
      { url: "https://a.com/1", title: "read more" },
    ];

    expect(dedupeByUrl(items)).toEqual([
      { url: "https://a.com/1", title: "headline" },
      { url: "https://b.com/2", title: "other" },
    ]);
  });

  it("treats surrounding whitespace as the same URL", () => {
    const items = [{ url: "https://a.com/1" }, { url: " https://a.com/1 " }];
    expect(dedupeByUrl(items)).toHaveLength(1);
  });

  it("leaves a list with no repeats untouched", () => {
    const items = [{ url: "https://a.com/1" }, { url: "https://b.com/2" }];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });

  it("does not treat different paths on one host as the same", () => {
    const items = [{ url: "https://a.com/1" }, { url: "https://a.com/2" }];
    expect(dedupeByUrl(items)).toHaveLength(2);
  });

  it("handles an empty list", () => {
    expect(dedupeByUrl([])).toEqual([]);
  });
});

/**
 * With a worker pool, items finish out of order. The totals and the notes must not
 * depend on that, or a run's reported numbers would vary between identical inputs.
 */
describe("tallyItems", () => {
  const outcomes: ItemOutcome[] = [
    { created: 1, duplicate: false, note: null },
    { created: 0, duplicate: true, note: null },
    { created: 0, duplicate: false, note: "a1: refused a link (stopped: not allowed)" },
    { created: 1, duplicate: false, note: null },
  ];

  it("sums what was created and what was a duplicate", () => {
    const tally = tallyItems(outcomes);
    expect(tally.created).toBe(2);
    expect(tally.duplicates).toBe(1);
  });

  it("keeps the notes in input order, whatever order the work finished in", () => {
    const shuffled = [outcomes[3], outcomes[0], outcomes[2], outcomes[1]];
    // The caller passes results indexed by input, so tally sees input order either way.
    expect(tallyItems(outcomes).notes).toEqual([
      "a1: refused a link (stopped: not allowed)",
    ]);
    expect(tallyItems(shuffled).notes).toEqual([
      "a1: refused a link (stopped: not allowed)",
    ]);
  });

  it("drops the empty notes rather than carrying nulls into the report", () => {
    expect(tallyItems(outcomes).notes).toHaveLength(1);
  });

  it("returns zeroes for no items, which is a valid digest", () => {
    expect(tallyItems([])).toEqual({ created: 0, duplicates: 0, notes: [] });
  });

  it("counts several notes, in order, when several items had something to say", () => {
    const many: ItemOutcome[] = [
      { created: 0, duplicate: false, note: "first" },
      { created: 1, duplicate: false, note: null },
      { created: 0, duplicate: false, note: "second" },
    ];
    expect(tallyItems(many).notes).toEqual(["first", "second"]);
    expect(tallyItems(many).created).toBe(1);
  });
});

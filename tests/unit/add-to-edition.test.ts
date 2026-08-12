import { describe, expect, it } from "vitest";
import { mergeEditionArticles, type EditionArticleRow } from "@/lib/editions/add-to-edition";

/**
 * The `order` on each input row is irrelevant to the result: `mergeEditionArticles`
 * renumbers everything by position. This just saves every existing-side fixture
 * below from having to spell out a real order.
 */
function rowsFrom(ids: readonly string[]): EditionArticleRow[] {
  return ids.map((articleId) => ({ articleId, order: 0, useLinkTake: false }));
}

describe("mergeEditionArticles", () => {
  /**
   * The whole reason the helper exists. `PATCH /api/editions/:id` deletes every join
   * row and recreates what it is given, so a caller that sends only the new ids empties
   * the edition of everything it already held.
   */
  it("keeps what the edition already holds", () => {
    const existing = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rows = mergeEditionArticles(rowsFrom(existing), ["x", "y", "z"]);

    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.articleId)).toEqual([...existing, "x", "y", "z"]);
  });

  it("numbers the result from one, contiguously", () => {
    const rows = mergeEditionArticles(rowsFrom(["a", "b"]), ["c"]);

    expect(rows).toEqual([
      { articleId: "a", order: 1, useLinkTake: false },
      { articleId: "b", order: 2, useLinkTake: false },
      { articleId: "c", order: 3, useLinkTake: false },
    ]);
  });

  it("appends rather than reshuffling an edition someone has arranged", () => {
    const rows = mergeEditionArticles(rowsFrom(["c", "a", "b"]), ["d"]);

    expect(rows.map((row) => row.articleId)).toEqual(["c", "a", "b", "d"]);
  });

  /**
   * `@@id([editionId, articleId])` is a composite primary key, so a repeated id does
   * not overwrite: `createMany` fails and the transaction takes the whole add down.
   */
  it("does not add something the edition already has", () => {
    const rows = mergeEditionArticles(rowsFrom(["a", "b"]), ["b", "c"]);

    expect(rows.map((row) => row.articleId)).toEqual(["a", "b", "c"]);
  });

  it("collapses duplicates inside the incoming list", () => {
    const rows = mergeEditionArticles([], ["a", "a", "b"]);

    expect(rows.map((row) => row.articleId)).toEqual(["a", "b"]);
  });

  it("handles both sides being empty", () => {
    expect(mergeEditionArticles([], [])).toEqual([]);
  });

  it("adds to an empty edition", () => {
    expect(mergeEditionArticles([], ["a"])).toEqual([
      { articleId: "a", order: 1, useLinkTake: false },
    ]);
  });
});

describe("mergeEditionArticles carries the Link Take flag", () => {
  it("preserves the flag on rows that were already there", () => {
    const merged = mergeEditionArticles(
      [
        { articleId: "a", order: 1, useLinkTake: true },
        { articleId: "b", order: 2, useLinkTake: false },
      ],
      ["c"]
    );

    expect(merged).toEqual([
      { articleId: "a", order: 1, useLinkTake: true },
      { articleId: "b", order: 2, useLinkTake: false },
      { articleId: "c", order: 3, useLinkTake: false },
    ]);
  });

  it("adds new rows unflagged", () => {
    const merged = mergeEditionArticles([], ["a"]);
    expect(merged[0].useLinkTake).toBe(false);
  });

  it("does not flag a duplicate back to false", () => {
    const merged = mergeEditionArticles(
      [{ articleId: "a", order: 1, useLinkTake: true }],
      ["a"]
    );
    expect(merged).toEqual([{ articleId: "a", order: 1, useLinkTake: true }]);
  });
});

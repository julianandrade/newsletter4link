import { describe, expect, it } from "vitest";
import { mergeEditionArticles } from "@/lib/editions/add-to-edition";

describe("mergeEditionArticles", () => {
  /**
   * The whole reason the helper exists. `PATCH /api/editions/:id` deletes every join
   * row and recreates what it is given, so a caller that sends only the new ids empties
   * the edition of everything it already held.
   */
  it("keeps what the edition already holds", () => {
    const existing = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rows = mergeEditionArticles(existing, ["x", "y", "z"]);

    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.articleId)).toEqual([...existing, "x", "y", "z"]);
  });

  it("numbers the result from one, contiguously", () => {
    const rows = mergeEditionArticles(["a", "b"], ["c"]);

    expect(rows).toEqual([
      { articleId: "a", order: 1 },
      { articleId: "b", order: 2 },
      { articleId: "c", order: 3 },
    ]);
  });

  it("appends rather than reshuffling an edition someone has arranged", () => {
    const rows = mergeEditionArticles(["c", "a", "b"], ["d"]);

    expect(rows.map((row) => row.articleId)).toEqual(["c", "a", "b", "d"]);
  });

  /**
   * `@@id([editionId, articleId])` is a composite primary key, so a repeated id does
   * not overwrite: `createMany` fails and the transaction takes the whole add down.
   */
  it("does not add something the edition already has", () => {
    const rows = mergeEditionArticles(["a", "b"], ["b", "c"]);

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
      { articleId: "a", order: 1 },
    ]);
  });
});

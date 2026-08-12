import { describe, expect, it } from "vitest";
import { parseEditionPatch, toEditionArticleView } from "@/app/api/editions/[id]/route";
import { mergeEditionArticles } from "@/lib/editions/add-to-edition";

/**
 * RQ-008: an unsent edition can be renamed and rescheduled.
 *
 * Absent and null are different here and the distinction is the whole point of the
 * parse: an absent `title` leaves the name alone, and an explicit null clears it back to
 * the derived week label. Every screen that sends a partial PATCH omits the fields it is
 * not touching, so a parse that could not tell them apart would erase the name on every
 * reorder.
 */

describe("parseEditionPatch", () => {
  it("returns nothing to change for an empty body", () => {
    expect(parseEditionPatch({})).toEqual({ ok: true, value: {} });
  });

  it("leaves the title alone when the key is absent", () => {
    const result = parseEditionPatch({ publishDate: "2026-08-11" });
    expect(result).toEqual({
      ok: true,
      value: { publishDate: new Date("2026-08-11T00:00:00.000Z") },
    });
  });

  it("clears the title when it is explicitly null", () => {
    expect(parseEditionPatch({ title: null })).toEqual({
      ok: true,
      value: { title: null },
    });
  });

  it("clears the title when it is blank", () => {
    expect(parseEditionPatch({ title: "  " })).toEqual({
      ok: true,
      value: { title: null },
    });
  });

  it("trims a new title", () => {
    expect(parseEditionPatch({ title: " Year in review " })).toEqual({
      ok: true,
      value: { title: "Year in review" },
    });
  });

  it("refuses a title longer than 120 characters", () => {
    expect(parseEditionPatch({ title: "x".repeat(121) })).toEqual({
      ok: false,
      error: "title must be 120 characters or fewer",
    });
  });

  it("refuses a publishDate that is not a date", () => {
    expect(parseEditionPatch({ publishDate: "soon" })).toEqual({
      ok: false,
      error: "publishDate must be an ISO date such as 2026-08-10",
    });
  });

  it("refuses a title that is neither a string nor null", () => {
    expect(parseEditionPatch({ title: 7 })).toEqual({
      ok: false,
      error: "title must be a string or null",
    });
  });

  /**
   * The other keys this route already accepted are none of this parser's business, and
   * it must not report them as changes or the PATCH would rewrite the name on a reorder.
   */
  it("ignores the status, articles and projects keys the route handles elsewhere", () => {
    expect(
      parseEditionPatch({
        status: "FINALIZED",
        articles: [{ articleId: "a" }],
        projects: [],
        templateId: "t1",
      })
    ).toEqual({ ok: true, value: {} });
  });

  it("survives a null or undefined body rather than throwing", () => {
    expect(parseEditionPatch(null)).toEqual({ ok: true, value: {} });
    expect(parseEditionPatch(undefined)).toEqual({ ok: true, value: {} });
  });
});

/**
 * The closing block on an edition.
 *
 * Absent and null are kept apart for the same reason the title keeps them apart: the send
 * screen PATCHes partially, so an omitted field must never be read as "clear it".
 */
describe("parseEditionPatch and the closing aside", () => {
  it("leaves the aside alone when the field is absent", () => {
    const parsed = parseEditionPatch({ title: "A special" });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect("asideId" in parsed.value).toBe(false);
  });

  it("accepts an id", () => {
    const parsed = parseEditionPatch({ asideId: "as-1" });

    expect(parsed).toEqual({ ok: true, value: { asideId: "as-1" } });
  });

  it("reads null as sending without one", () => {
    expect(parseEditionPatch({ asideId: null })).toEqual({
      ok: true,
      value: { asideId: null },
    });
  });

  it("reads an empty or blank string as null rather than looking up an empty id", () => {
    expect(parseEditionPatch({ asideId: "" })).toEqual({
      ok: true,
      value: { asideId: null },
    });
    expect(parseEditionPatch({ asideId: "   " })).toEqual({
      ok: true,
      value: { asideId: null },
    });
  });

  it("refuses anything that is not a string or null", () => {
    expect(parseEditionPatch({ asideId: 7 }).ok).toBe(false);
    expect(parseEditionPatch({ asideId: { id: "as-1" } }).ok).toBe(false);
  });
});

/**
 * The Link Take flag's round trip: GET lifts it onto the article the way it lifts
 * `order`, a screen reads it back off that response, and an add-to-edition merge
 * must not reset it. `toEditionArticleView` is the piece `GET` actually runs; this
 * proves what it produces survives `mergeEditionArticles` unchanged, which is the
 * same shape `app/dashboard/send/page.tsx` reads to build the rows it PATCHes back.
 */
describe("toEditionArticleView, and its round trip through mergeEditionArticles", () => {
  it("carries order and useLinkTake alongside the article's own fields", () => {
    const article = { id: "a1", title: "OpenAI ships agent mode" };

    expect(toEditionArticleView(article, 2, true)).toEqual({
      id: "a1",
      title: "OpenAI ships agent mode",
      order: 2,
      useLinkTake: true,
    });
  });

  it("defaults to false without lying about it being unset", () => {
    const article = { id: "a1", title: "OpenAI ships agent mode" };
    expect(toEditionArticleView(article, 1, false).useLinkTake).toBe(false);
  });

  it("a flagged row read back from GET keeps its flag through an add", () => {
    // Exactly what a screen like app/dashboard/send/page.tsx does: read the
    // GET response, reduce each article to the row shape the merge needs.
    const fromGet = [
      toEditionArticleView({ id: "a" }, 1, true),
      toEditionArticleView({ id: "b" }, 2, false),
    ];
    const existing = fromGet.map((article) => ({
      articleId: article.id,
      order: article.order,
      useLinkTake: article.useLinkTake,
    }));

    const merged = mergeEditionArticles(existing, ["c"]);

    expect(merged).toEqual([
      { articleId: "a", order: 1, useLinkTake: true },
      { articleId: "b", order: 2, useLinkTake: false },
      { articleId: "c", order: 3, useLinkTake: false },
    ]);
  });
});

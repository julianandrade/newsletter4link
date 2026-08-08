import { describe, expect, it } from "vitest";
import { parseAsideCreate, parseAsidePatch } from "@/lib/asides/input";

function value(result: ReturnType<typeof parseAsideCreate>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
}

describe("parseAsideCreate", () => {
  it("accepts the minimum: text alone", () => {
    expect(parseAsideCreate({ text: "A one-liner." })).toEqual({
      ok: true,
      value: { text: "A one-liner.", kind: "JOKE", language: "pt-PT", reusable: true },
    });
  });

  it("refuses empty text, because the text is also the image's alt", () => {
    // An image alone is exactly the failure mode this feature exists to avoid: a reader
    // whose client blocks images would receive nothing at all.
    expect(parseAsideCreate({ text: "   " }).ok).toBe(false);
    expect(parseAsideCreate({ imageUrl: "https://x.co/a.png" }).ok).toBe(false);
    expect(parseAsideCreate({}).ok).toBe(false);
  });

  it("refuses an image URL that is not http or https", () => {
    expect(parseAsideCreate({ text: "x", imageUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseAsideCreate({ text: "x", imageUrl: "data:image/png;base64,AAA" }).ok).toBe(
      false
    );
    expect(parseAsideCreate({ text: "x", imageUrl: "not a url" }).ok).toBe(false);
  });

  it("refuses an unknown kind", () => {
    expect(parseAsideCreate({ text: "x", kind: "MEME" }).ok).toBe(false);
  });

  it("refuses an unknown status", () => {
    expect(parseAsideCreate({ text: "x", status: "DELETED" }).ok).toBe(false);
  });

  it("trims the text and drops a blank attribution", () => {
    const parsed = value(parseAsideCreate({ text: "  x  ", attribution: "  " }));

    expect(parsed.text).toBe("x");
    expect(parsed.attribution).toBeUndefined();
  });

  it("caps the text, because an email block is not an essay", () => {
    expect(parseAsideCreate({ text: "x".repeat(500) }).ok).toBe(true);
    expect(parseAsideCreate({ text: "x".repeat(501) }).ok).toBe(false);
  });

  it("refuses a body that is not an object", () => {
    expect(parseAsideCreate(null).ok).toBe(false);
    expect(parseAsideCreate("text").ok).toBe(false);
  });

  it("keeps a valid image and attribution", () => {
    const parsed = value(
      parseAsideCreate({
        text: "x",
        imageUrl: "https://example.supabase.co/meme.gif",
        attribution: "Julian",
        kind: "NOTE",
        language: "en",
        reusable: false,
      })
    );

    expect(parsed).toEqual({
      text: "x",
      kind: "NOTE",
      language: "en",
      reusable: false,
      imageUrl: "https://example.supabase.co/meme.gif",
      attribution: "Julian",
    });
  });
});

describe("parseAsidePatch", () => {
  it("accepts a status change on its own", () => {
    expect(parseAsidePatch({ status: "RETIRED" })).toEqual({
      ok: true,
      value: { status: "RETIRED" },
    });
  });

  it("refuses an unknown status", () => {
    expect(parseAsidePatch({ status: "DELETED" }).ok).toBe(false);
  });

  it("refuses an empty patch, which is a caller bug", () => {
    expect(parseAsidePatch({}).ok).toBe(false);
  });

  it("never lets a caller set the counters", () => {
    // useCount and lastUsedAt are written by the send path and by nothing else. A caller
    // able to set them could push a joke to the front or back of every picker.
    expect(parseAsidePatch({ text: "x", useCount: 99, lastUsedAt: "2020-01-01" })).toEqual({
      ok: true,
      value: { text: "x" },
    });
  });

  it("never lets a caller set the source, so an AI suggestion cannot relabel itself", () => {
    expect(parseAsidePatch({ text: "x", source: "HUMAN" })).toEqual({
      ok: true,
      value: { text: "x" },
    });
  });

  it("clears an image with null and refuses a bad one", () => {
    expect(parseAsidePatch({ imageUrl: null })).toEqual({
      ok: true,
      value: { imageUrl: null },
    });
    expect(parseAsidePatch({ imageUrl: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("refuses blank text rather than storing it", () => {
    expect(parseAsidePatch({ text: "  " }).ok).toBe(false);
  });
});

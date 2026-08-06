import { describe, expect, it } from "vitest";
import { pgSafe, pgSafeDeep } from "@/lib/pg-safe-text";

/**
 * The search failed in production with "unsupported Unicode escape sequence", and the
 * search itself had succeeded: only the write of its result failed, which is why the
 * message was opaque and why Try again never helped.
 *
 * Scraped page text reaches us through Tavily's `raw_content`, and that text carries
 * NUL bytes. Postgres refuses a NUL inside a jsonb value, and the job's result is a
 * jsonb column, so `completeJob` threw and the SSE stream forwarded the database's own
 * message to the screen.
 *
 * What a jsonb column actually accepts was measured against the database rather than
 * assumed, and it is narrower than it looks and wider than a blunt fix would allow:
 *
 *   NUL                     refused, "unsupported Unicode escape sequence"
 *   lone surrogate          refused, "lone leading surrogate in hex escape"
 *   valid surrogate pair    accepted, and emoji are exactly this
 *   other C0 controls       accepted
 *   tab and newline         accepted
 *
 * So this strips two things and nothing else. Stripping all control characters, or all
 * non-BMP characters, would have quietly mangled legitimate text and every emoji.
 */

describe("pgSafe", () => {
  it("leaves ordinary text exactly as it is", () => {
    expect(pgSafe("The EU AI Act, in plain terms.")).toBe(
      "The EU AI Act, in plain terms."
    );
  });

  it("removes a NUL, which is the byte that broke the search", () => {
    expect(pgSafe("before\u0000after")).toBe("beforeafter");
  });

  it("removes every NUL, not only the first", () => {
    expect(pgSafe("a\u0000b\u0000c\u0000")).toBe("abc");
  });

  it("removes a lone high surrogate", () => {
    expect(pgSafe("a\uD800b")).toBe("ab");
  });

  it("removes a lone low surrogate", () => {
    expect(pgSafe("a\uDC00b")).toBe("ab");
  });

  it("removes a high surrogate at the very end of the string", () => {
    // The common real case: text truncated to a fixed length mid-character, which is
    // what `snippet: result.content.slice(0, 500)` does on the ingress path.
    expect(pgSafe("text\uD83D")).toBe("text");
  });

  /**
   * The line this function must not cross. An emoji is a valid surrogate pair and
   * Postgres accepts it, so a fix that stripped the surrogate range wholesale would
   * silently delete emoji from every scraped headline.
   */
  it("keeps a valid surrogate pair, so emoji survive", () => {
    expect(pgSafe("ships 🚀 today")).toBe("ships 🚀 today");
    expect(pgSafe("a\u{1F600}b")).toBe("a\u{1F600}b");
  });

  it("keeps tabs and newlines, which carry meaning in scraped text", () => {
    expect(pgSafe("line one\nline two\tindented")).toBe("line one\nline two\tindented");
  });

  it("keeps other C0 control characters, which Postgres accepts", () => {
    expect(pgSafe("a\u0001b")).toBe("a\u0001b");
  });

  it("keeps accented and non-Latin text untouched", () => {
    expect(pgSafe("proveniência, 日本語, Ελληνικά")).toBe(
      "proveniência, 日本語, Ελληνικά"
    );
  });

  it("returns an empty string for an empty string", () => {
    expect(pgSafe("")).toBe("");
  });
});

describe("pgSafeDeep", () => {
  it("cleans strings nested in objects and arrays", () => {
    const input = {
      results: [
        { title: "A\u0000 title", snippet: "text\uD800" },
        { title: "clean", nested: { deep: "also\u0000dirty" } },
      ],
    };

    expect(pgSafeDeep(input)).toEqual({
      results: [
        { title: "A title", snippet: "text" },
        { title: "clean", nested: { deep: "alsodirty" } },
      ],
    });
  });

  it("leaves numbers, booleans, null and undefined alone", () => {
    expect(pgSafeDeep({ n: 7, b: true, z: null, u: undefined })).toEqual({
      n: 7,
      b: true,
      z: null,
      u: undefined,
    });
  });

  it("cleans a bare string", () => {
    expect(pgSafeDeep("a\u0000b")).toBe("ab");
  });

  it("keeps a Date as a Date rather than flattening it to an object", () => {
    // A search result carries publishedAt as a Date, and a deep walk that rebuilt it as
    // a plain object would turn it into {} on the way to the database.
    const when = new Date("2026-08-06T09:00:00.000Z");
    const cleaned = pgSafeDeep({ publishedAt: when }) as { publishedAt: Date };

    expect(cleaned.publishedAt).toBeInstanceOf(Date);
    expect(cleaned.publishedAt.toISOString()).toBe("2026-08-06T09:00:00.000Z");
  });

  it("does not choke on a cyclic object", () => {
    // Defence in depth runs on whatever a caller hands it, and a stack overflow inside
    // the guard would be a worse failure than the one it prevents.
    const cyclic: Record<string, unknown> = { title: "a\u0000b" };
    cyclic.self = cyclic;

    const cleaned = pgSafeDeep(cyclic) as Record<string, unknown>;

    expect(cleaned.title).toBe("ab");
    expect(cleaned.self).toBe(cleaned);
  });

  it("keeps object keys clean too, since a key is text in jsonb as well", () => {
    expect(pgSafeDeep({ "a\u0000b": 1 })).toEqual({ ab: 1 });
  });
});

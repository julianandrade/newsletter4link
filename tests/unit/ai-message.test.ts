import { describe, expect, it } from "vitest";
import { describeBlocks, messageText, messageTextOr } from "@/lib/ai/message";

/** Enough of a Message to exercise the reader, without pulling in the SDK's types. */
const message = (blocks: Array<Record<string, unknown>>, stop = "end_turn") =>
  ({ content: blocks, stop_reason: stop }) as never;

const text = (value: string) => ({ type: "text", text: value });
const thinking = (value: string) => ({ type: "thinking", thinking: value });

describe("messageText", () => {
  it("reads a single text block", () => {
    expect(messageText(message([text("hello")]))).toBe("hello");
  });

  it("reads the text when a thinking block comes first", () => {
    // This is the bug the module exists for. `content[0].type === "text"` returned the
    // empty string here, in twenty-one places, and nothing complained: a rewrite
    // refused twice for "no parsable reply", an article would have scored zero.
    const reply = message([thinking("let me consider"), text('{"title":"t"}')]);

    expect(messageText(reply)).toBe('{"title":"t"}');
  });

  it("joins several text blocks", () => {
    expect(messageText(message([text("one"), text("two")]))).toBe("one\ntwo");
  });

  it("skips every non-text block", () => {
    const reply = message([
      thinking("hmm"),
      { type: "tool_use", id: "t1", name: "x", input: {} },
      text("answer"),
    ]);

    expect(messageText(reply)).toBe("answer");
  });

  it("trims, because callers parse the result", () => {
    expect(messageText(message([text("  hello  ")]))).toBe("hello");
  });

  it("is empty when there is no text at all", () => {
    expect(messageText(message([thinking("only thinking")]))).toBe("");
    expect(messageText(message([]))).toBe("");
  });
});

describe("messageTextOr", () => {
  it("returns the text when there is some", () => {
    expect(messageTextOr(message([text("hello")]), "{}")).toBe("hello");
  });

  it("returns the caller's fallback when there is none", () => {
    // The fallback stays the caller's choice: one parses JSON and wants "{}", another
    // wants a sentence to show a reader.
    expect(messageTextOr(message([thinking("x")]), "{}")).toBe("{}");
    expect(messageTextOr(message([]), "[]")).toBe("[]");
  });

  it("treats whitespace-only text as none", () => {
    expect(messageTextOr(message([text("   ")]), "{}")).toBe("{}");
  });
});

describe("describeBlocks", () => {
  it("names what came back, for a log line", () => {
    expect(describeBlocks(message([thinking("x"), text("y")]))).toBe(
      "thinking, text, stop reason end_turn"
    );
  });

  it("says so when nothing came back", () => {
    expect(describeBlocks(message([], "max_tokens"))).toBe(
      "no blocks, stop reason max_tokens"
    );
  });
});

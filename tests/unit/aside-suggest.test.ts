import { describe, expect, it } from "vitest";
import { buildSuggestPrompt, parseSuggestions, SUGGESTION_COUNT } from "@/lib/asides/suggest";

describe("parseSuggestions", () => {
  it("reads one candidate per line", () => {
    expect(parseSuggestions("First one.\nSecond one.\nThird one.")).toEqual([
      "First one.",
      "Second one.",
      "Third one.",
    ]);
  });

  it("drops blank lines and the numbering a model adds anyway", () => {
    expect(parseSuggestions("1. First one.\n\n2. Second one.\n")).toEqual([
      "First one.",
      "Second one.",
    ]);
  });

  it("strips bullets too", () => {
    expect(parseSuggestions("- First one.\n* Second one.\n• Third one.")).toEqual([
      "First one.",
      "Second one.",
      "Third one.",
    ]);
  });

  it("strips wrapping quotes, which a model uses when asked for lines", () => {
    expect(parseSuggestions('"First one."\n“Second one.”')).toEqual([
      "First one.",
      "Second one.",
    ]);
  });

  it("drops a line over the cap rather than truncating a joke", () => {
    // Truncating would produce a line whose punchline is missing, which reads as a bug
    // rather than as a rejected suggestion.
    const long = "x".repeat(501);

    expect(parseSuggestions(`Fine.\n${long}`)).toEqual(["Fine."]);
  });

  it("returns nothing for an empty reply, which the caller must handle", () => {
    expect(parseSuggestions("")).toEqual([]);
    expect(parseSuggestions("   \n  ")).toEqual([]);
  });

  it("drops a preamble line the model was told not to write", () => {
    // "Here are five suggestions:" is not a joke, and it ends in a colon rather than
    // in the punctuation a one-liner ends in.
    expect(parseSuggestions("Here are five suggestions:\nA real one.")).toEqual([
      "A real one.",
    ]);
  });

  it("de-duplicates, because a model repeats itself across a list", () => {
    expect(parseSuggestions("Same one.\nSame one.\nAnother.")).toEqual([
      "Same one.",
      "Another.",
    ]);
  });
});

describe("buildSuggestPrompt", () => {
  it("carries the topics and the approved samples as tone reference", () => {
    const prompt = buildSuggestPrompt({
      topics: ["agentic coding", "model releases"],
      samples: ["An approved one."],
      language: "pt-PT",
    });

    expect(prompt).toContain("agentic coding");
    expect(prompt).toContain("model releases");
    expect(prompt).toContain("An approved one.");
    expect(prompt).toContain("pt-PT");
  });

  it("asks for five, one per line, and no numbering", () => {
    const prompt = buildSuggestPrompt({ topics: [], samples: [], language: "pt-PT" });

    expect(prompt).toContain(String(SUGGESTION_COUNT));
    expect(prompt.toLowerCase()).toContain("one per line");
    expect(prompt.toLowerCase()).toContain("no numbering");
  });

  it("works with no samples, which is the state of a fresh library", () => {
    const prompt = buildSuggestPrompt({ topics: [], samples: [], language: "pt-PT" });

    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).not.toContain("undefined");
  });

  it("states the character cap the parser enforces, so fewer lines are wasted", () => {
    const prompt = buildSuggestPrompt({ topics: [], samples: [], language: "pt-PT" });

    expect(prompt).toContain("500");
  });
});

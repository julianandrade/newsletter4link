import { describe, expect, it } from "vitest";
import {
  AI_MODELS,
  LEGACY_AI_MODELS,
  DEFAULT_AI_MODEL,
  structuredOutputTuning,
  supportsEffort,
  thinksByDefault,
} from "@/lib/ai-models";

/**
 * Which request fields each model will accept, and why the extractor sends them.
 *
 * Getting this wrong is a 400 rather than a worse answer, and the two directions fail
 * differently: sending `output_config.effort` to Haiku 4.5 rejects the call outright,
 * while omitting `thinking` on a 5-family model lets adaptive thinking spend the whole
 * `max_tokens` allowance before a character of reply is emitted. That second failure is
 * what lost two newsletters on 6 August 2026.
 */

describe("thinksByDefault", () => {
  it("is true for the 5 family, which thinks unless told not to", () => {
    expect(thinksByDefault("claude-sonnet-5")).toBe(true);
    expect(thinksByDefault("claude-opus-5")).toBe(true);
  });

  it("is false for everything older, which never thought unless asked", () => {
    expect(thinksByDefault("claude-haiku-4-5")).toBe(false);
    expect(thinksByDefault("claude-opus-4-8")).toBe(false);
    expect(thinksByDefault("claude-sonnet-4-6")).toBe(false);
    expect(thinksByDefault("claude-sonnet-4-20250514")).toBe(false);
    expect(thinksByDefault("claude-3-5-haiku-20241022")).toBe(false);
  });

  it("is not fooled by a 4-5 version number containing a five", () => {
    // `claude-haiku-4-5` ends in 5 and is not a 5-family model. A looser pattern would
    // send it a thinking field and an effort it rejects.
    expect(thinksByDefault("claude-haiku-4-5")).toBe(false);
    expect(thinksByDefault("claude-opus-4-5")).toBe(false);
  });
});

describe("supportsEffort", () => {
  it("accepts the models that take an effort level", () => {
    expect(supportsEffort("claude-sonnet-5")).toBe(true);
    expect(supportsEffort("claude-opus-5")).toBe(true);
    expect(supportsEffort("claude-opus-4-8")).toBe(true);
    expect(supportsEffort("claude-sonnet-4-6")).toBe(true);
  });

  it("refuses the models where effort is a 400", () => {
    // The cheap option this product offers, and the two Claude 4 models an organization
    // may still have stored.
    expect(supportsEffort("claude-haiku-4-5")).toBe(false);
    expect(supportsEffort("claude-sonnet-4-20250514")).toBe(false);
    expect(supportsEffort("claude-opus-4-20250514")).toBe(false);
    expect(supportsEffort("claude-3-5-haiku-20241022")).toBe(false);
  });
});

describe("structuredOutputTuning", () => {
  it("turns thinking off and asks for the lowest effort on the default model", () => {
    expect(structuredOutputTuning("claude-sonnet-5")).toEqual({
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
    });
  });

  it("sends nothing to a model that never thought by default", () => {
    // Empty rather than `thinking: disabled`: the field is unnecessary there, and an
    // unnecessary field on an older model is a risk taken for no gain.
    expect(structuredOutputTuning("claude-haiku-4-5")).toEqual({});
    expect(structuredOutputTuning("claude-sonnet-4-20250514")).toEqual({});
  });

  it("never sends effort without also disabling thinking", () => {
    // Opus 5 rejects disabled thinking above `high` effort, so the pair must travel
    // together and the effort must stay low.
    for (const { value } of [...AI_MODELS, ...LEGACY_AI_MODELS]) {
      const tuning = structuredOutputTuning(value);
      if ("output_config" in tuning) {
        expect(tuning).toHaveProperty("thinking");
        expect(tuning.output_config).toEqual({ effort: "low" });
      }
    }
  });

  it("produces a valid shape for every model the product offers", () => {
    for (const { value } of [...AI_MODELS, ...LEGACY_AI_MODELS]) {
      const tuning = structuredOutputTuning(value);
      const keys = Object.keys(tuning);
      expect(keys.every((key) => key === "thinking" || key === "output_config")).toBe(true);
    }
  });

  it("covers the default model, which is the one that actually runs", () => {
    expect(structuredOutputTuning(DEFAULT_AI_MODEL)).toHaveProperty("thinking");
  });
});

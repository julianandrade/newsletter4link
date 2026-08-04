import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_MODEL, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai-models";

/**
 * RQ-002. The defect these cover: the model an organization selected was stored,
 * shown back on the Settings screen, and then ignored by every AI call.
 */

const getSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", () => ({ getSettings }));

const { resolveAiModels, isModelRejection, UnusableModelError, rethrowIfModelRejected } =
  await import("@/lib/ai/model");

beforeEach(() => {
  getSettings.mockReset();
});

describe("resolveAiModels", () => {
  it("returns the ids the organization stored", async () => {
    getSettings.mockResolvedValue({
      aiModel: "claude-opus-5",
      embeddingModel: "text-embedding-3-large",
    });

    await expect(resolveAiModels("org_1")).resolves.toEqual({
      model: "claude-opus-5",
      embeddingModel: "text-embedding-3-large",
    });
    expect(getSettings).toHaveBeenCalledWith("org_1");
  });

  it("falls back to the documented defaults with no organization", async () => {
    await expect(resolveAiModels(undefined)).resolves.toEqual({
      model: DEFAULT_AI_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
    // No point reading settings for nobody.
    expect(getSettings).not.toHaveBeenCalled();
  });

  it("falls back rather than throwing when the settings read fails", async () => {
    // BR-005: an unreadable settings row must not take a curation run down.
    getSettings.mockRejectedValue(new Error("connection reset"));

    await expect(resolveAiModels("org_1")).resolves.toEqual({
      model: DEFAULT_AI_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
  });

  it("falls back per field when a stored value is empty", async () => {
    getSettings.mockResolvedValue({ aiModel: "", embeddingModel: null });

    await expect(resolveAiModels("org_1")).resolves.toEqual({
      model: DEFAULT_AI_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });
  });

  it("honours a legacy stored id rather than quietly upgrading it", async () => {
    // Q2(a): the stored choice is honoured and the screen warns; it is not
    // rewritten on the way through.
    getSettings.mockResolvedValue({
      aiModel: "claude-sonnet-4-20250514",
      embeddingModel: "text-embedding-ada-002",
    });

    const resolved = await resolveAiModels("org_1");
    expect(resolved.model).toBe("claude-sonnet-4-20250514");
  });
});

describe("isModelRejection", () => {
  it("recognises the provider's answer for an unknown model", () => {
    expect(isModelRejection({ error: { type: "not_found_error" } })).toBe(true);
    expect(
      isModelRejection({ error: { error: { type: "not_found_error" } } })
    ).toBe(true);
  });

  it("recognises a 404 or 403 that faults the model", () => {
    expect(
      isModelRejection({ status: 404, message: 'model "claude-x" not found' })
    ).toBe(true);
    expect(
      isModelRejection({
        status: 403,
        message: "your account cannot use this model",
      })
    ).toBe(true);
  });

  it("recognises a 400 that faults the model field specifically", () => {
    expect(
      isModelRejection({
        status: 400,
        message: "model: unsupported model identifier",
      })
    ).toBe(true);
  });

  it("leaves transient failures alone", () => {
    // These must keep their existing handling: treating a timeout as a bad
    // model would take a whole run down over one slow response.
    expect(isModelRejection({ status: 429, message: "rate limit exceeded" })).toBe(
      false
    );
    expect(isModelRejection({ status: 500, message: "internal error" })).toBe(false);
    expect(isModelRejection({ status: 529, message: "overloaded" })).toBe(false);
    expect(isModelRejection(new Error("socket hang up"))).toBe(false);
    expect(isModelRejection({ status: 400, message: "prompt is too long" })).toBe(
      false
    );
  });

  it("is false for nothing at all", () => {
    expect(isModelRejection(null)).toBe(false);
    expect(isModelRejection(undefined)).toBe(false);
    expect(isModelRejection("a string")).toBe(false);
  });
});

describe("UnusableModelError", () => {
  it("names the model it was refused for", () => {
    const error = new UnusableModelError("claude-withdrawn-1");
    expect(error.model).toBe("claude-withdrawn-1");
    expect(error.message).toContain("claude-withdrawn-1");
    expect(error.name).toBe("UnusableModelError");
    expect(error).toBeInstanceOf(Error);
  });

  it("keeps the original failure as the cause", () => {
    const cause = { status: 404, message: "model not found" };
    expect(new UnusableModelError("m", cause).cause).toBe(cause);
  });
});

describe("rethrowIfModelRejected", () => {
  it("throws for a rejected model, naming it", () => {
    expect(() =>
      rethrowIfModelRejected({ error: { type: "not_found_error" } }, "claude-x")
    ).toThrow(UnusableModelError);
    expect(() =>
      rethrowIfModelRejected({ error: { type: "not_found_error" } }, "claude-x")
    ).toThrow(/claude-x/);
  });

  it("returns quietly for anything else, so existing handling still runs", () => {
    expect(() =>
      rethrowIfModelRejected({ status: 429 }, "claude-x")
    ).not.toThrow();
  });
});

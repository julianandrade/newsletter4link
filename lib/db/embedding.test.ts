import { describe, it, expect } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  toVectorLiteral,
  isStorableEmbedding,
} from "./embedding";

describe("toVectorLiteral", () => {
  it("formats a number array as a pgvector literal", () => {
    expect(toVectorLiteral([1, 2, 3])).toBe("[1,2,3]");
  });

  it("handles floats and negatives", () => {
    expect(toVectorLiteral([0.5, -1.25, 0])).toBe("[0.5,-1.25,0]");
  });
});

describe("isStorableEmbedding", () => {
  it("accepts arrays of the supported dimension", () => {
    expect(isStorableEmbedding(new Array(EMBEDDING_DIMENSIONS).fill(0))).toBe(true);
  });

  it("rejects empty, wrong-length, and non-array inputs", () => {
    expect(isStorableEmbedding([])).toBe(false);
    expect(isStorableEmbedding([1, 2, 3])).toBe(false);
    expect(isStorableEmbedding(null)).toBe(false);
    expect(isStorableEmbedding("nope")).toBe(false);
  });
});

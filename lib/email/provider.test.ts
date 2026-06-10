import { describe, it, expect } from "vitest";
import { buildIdempotencyKey } from "./provider";

describe("buildIdempotencyKey", () => {
  it("is deterministic for the same edition + recipient", () => {
    expect(buildIdempotencyKey("ed_1", "sub_1")).toBe(
      buildIdempotencyKey("ed_1", "sub_1")
    );
  });

  it("differs across recipients in the same edition", () => {
    expect(buildIdempotencyKey("ed_1", "sub_1")).not.toBe(
      buildIdempotencyKey("ed_1", "sub_2")
    );
  });

  it("differs across editions for the same recipient", () => {
    expect(buildIdempotencyKey("ed_1", "sub_1")).not.toBe(
      buildIdempotencyKey("ed_2", "sub_1")
    );
  });

  it("works with an email address as the recipient (ad-hoc sends)", () => {
    expect(buildIdempotencyKey("ed_1", "a@b.co")).toBe("nl_ed_1_a@b.co");
  });
});

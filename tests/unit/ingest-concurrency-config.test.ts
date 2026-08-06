import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";

/**
 * The two limits multiply into outbound calls in flight, so the product is the number
 * that matters, not either one alone.
 */
describe("the ingest concurrency limits", () => {
  it("are set", () => {
    expect(config.emailIngest.emailConcurrency).toBeGreaterThan(1);
    expect(config.emailIngest.itemConcurrency).toBeGreaterThan(1);
  });

  it("keep the worst case in flight modest, because two providers are rate limited", () => {
    const worstCase =
      config.emailIngest.emailConcurrency * config.emailIngest.itemConcurrency;
    expect(worstCase).toBeLessThanOrEqual(16);
  });
});

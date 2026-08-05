import { describe, expect, it } from "vitest";
import {
  healthWarning,
  SILENCE_CADENCE_MULTIPLIER,
  sourceHealth,
} from "@/lib/inbound/health";

const NOW = new Date("2026-08-05T12:00:00.000Z");

/** Days before NOW, as a Date. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("sourceHealth", () => {
  it("is ok when the last email is inside the cadence window", () => {
    const health = sourceHealth(
      { lastReceivedAt: daysAgo(5), expectedCadenceDays: 7 },
      NOW
    );
    expect(health.state).toBe("ok");
    expect(health.daysSince).toBe(5);
  });

  it("is ok exactly at the boundary, and silent one day past it", () => {
    const boundary = 7 * SILENCE_CADENCE_MULTIPLIER; // 21

    expect(
      sourceHealth({ lastReceivedAt: daysAgo(boundary), expectedCadenceDays: 7 }, NOW).state
    ).toBe("ok");

    expect(
      sourceHealth({ lastReceivedAt: daysAgo(boundary + 1), expectedCadenceDays: 7 }, NOW)
        .state
    ).toBe("silent");
  });

  it("reports how late a silent source is, and what it was allowed", () => {
    const health = sourceHealth(
      { lastReceivedAt: daysAgo(30), expectedCadenceDays: 7 },
      NOW
    );

    expect(health).toEqual({ state: "silent", daysSince: 30, expectedWithinDays: 21 });
  });

  it("scales the window with the declared cadence", () => {
    // A daily newsletter silent for 5 days is late; a monthly one is not.
    expect(
      sourceHealth({ lastReceivedAt: daysAgo(5), expectedCadenceDays: 1 }, NOW).state
    ).toBe("silent");

    expect(
      sourceHealth({ lastReceivedAt: daysAgo(5), expectedCadenceDays: 30 }, NOW).state
    ).toBe("ok");
  });

  it("cannot judge silence without a declared cadence", () => {
    const health = sourceHealth(
      { lastReceivedAt: daysAgo(400), expectedCadenceDays: null },
      NOW
    );

    expect(health).toEqual({ state: "unknown-cadence", daysSince: 400 });
    expect(healthWarning(health, "Anything")).toBeNull();
  });

  it("treats a non-positive cadence as no cadence rather than dividing by it", () => {
    expect(
      sourceHealth({ lastReceivedAt: daysAgo(10), expectedCadenceDays: 0 }, NOW).state
    ).toBe("unknown-cadence");
  });

  describe("a source that has never received", () => {
    it("is given a grace period rather than flagged the moment it is saved", () => {
      const health = sourceHealth(
        { lastReceivedAt: null, expectedCadenceDays: 7, createdAt: daysAgo(2) },
        NOW
      );

      // Creating the source comes before confirming the subscription. Flagging it red
      // immediately would train people to ignore the flag.
      expect(health.state).toBe("ok");
    });

    it("is flagged once the grace period has passed", () => {
      const health = sourceHealth(
        { lastReceivedAt: null, expectedCadenceDays: 7, createdAt: daysAgo(22) },
        NOW
      );

      expect(health.state).toBe("never");
      expect(healthWarning(health, "TLDR AI")).toContain("never received");
    });

    it("is flagged when there is no createdAt to grant grace from", () => {
      expect(
        sourceHealth({ lastReceivedAt: null, expectedCadenceDays: 7 }, NOW).state
      ).toBe("never");
    });

    it("uses a weekly default grace when no cadence was declared", () => {
      expect(
        sourceHealth({ lastReceivedAt: null, expectedCadenceDays: null, createdAt: daysAgo(10) }, NOW)
          .state
      ).toBe("ok");

      expect(
        sourceHealth({ lastReceivedAt: null, expectedCadenceDays: null, createdAt: daysAgo(25) }, NOW)
          .state
      ).toBe("never");
    });
  });

  it("accepts ISO strings, which is what arrives over the wire", () => {
    const health = sourceHealth(
      { lastReceivedAt: daysAgo(30).toISOString(), expectedCadenceDays: 7 },
      NOW
    );
    expect(health.state).toBe("silent");
  });

  it("does not report negative days for a clock skewed into the future", () => {
    const health = sourceHealth(
      { lastReceivedAt: new Date(NOW.getTime() + 86_400_000), expectedCadenceDays: 7 },
      NOW
    );
    expect(health.daysSince).toBe(0);
    expect(health.state).toBe("ok");
  });

  it("ignores an unparseable date rather than throwing", () => {
    const health = sourceHealth(
      { lastReceivedAt: "not a date", expectedCadenceDays: 7, createdAt: daysAgo(100) },
      NOW
    );
    expect(health.state).toBe("never");
  });
});

describe("healthWarning", () => {
  it("says nothing when the source is healthy", () => {
    expect(healthWarning({ state: "ok", daysSince: 3 }, "TLDR")).toBeNull();
  });

  it("names the source, so a warning is actionable without cross-referencing", () => {
    const warning = healthWarning(
      { state: "silent", daysSince: 30, expectedWithinDays: 21 },
      "The Pragmatic Engineer"
    );

    expect(warning).toContain("The Pragmatic Engineer");
    expect(warning).toContain("30");
    expect(warning).toContain("21");
  });
});

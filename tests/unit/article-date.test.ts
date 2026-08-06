import { describe, expect, it } from "vitest";
import { bestKnownDate, bestKnownDateIso, describeDate } from "@/lib/articles/date";

/**
 * Finding C1. `publishedAt` is nullable now, so every caller that orders, buckets or
 * renders a date has to say what an unknown one means, and these two functions are that
 * decision made once.
 *
 * The pair exists because ordering by a fallback is honest and displaying one is not.
 * `bestKnownDate` is for sorting; `describeDate` refuses to let a screen call a capture
 * time a publication date, which is exactly what the queue's PUBLISHED column did.
 */

const PUBLISHED = new Date("2026-08-01T07:00:00.000Z");
const CAPTURED = new Date("2026-08-06T09:00:00.000Z");

describe("bestKnownDate", () => {
  it("prefers the publication date when there is one", () => {
    expect(bestKnownDate({ publishedAt: PUBLISHED, capturedAt: CAPTURED })).toBe(
      PUBLISHED
    );
  });

  it("falls back to the capture time when there is none", () => {
    expect(bestKnownDate({ publishedAt: null, capturedAt: CAPTURED })).toBe(CAPTURED);
  });

  /**
   * The fallback is later than a real publication date would be, which affects ordering.
   * Stated as a test so the consequence is deliberate: an article with no publication date
   * sorts as if it were published when we found it, which is the closest true thing.
   */
  it("makes an undated article sort by when it was found", () => {
    const dated = { publishedAt: PUBLISHED, capturedAt: CAPTURED };
    const undated = { publishedAt: null, capturedAt: CAPTURED };

    expect(bestKnownDate(undated).getTime()).toBeGreaterThan(
      bestKnownDate(dated).getTime()
    );
  });
});

describe("bestKnownDateIso", () => {
  it("prefers the publication date", () => {
    expect(
      bestKnownDateIso({
        publishedAt: "2026-08-01T07:00:00.000Z",
        capturedAt: "2026-08-06T09:00:00.000Z",
      })
    ).toBe("2026-08-01T07:00:00.000Z");
  });

  it("falls back to the capture time", () => {
    expect(
      bestKnownDateIso({ publishedAt: null, capturedAt: "2026-08-06T09:00:00.000Z" })
    ).toBe("2026-08-06T09:00:00.000Z");
  });
});

describe("describeDate", () => {
  it("calls a publication date published, and says it is not a capture", () => {
    expect(
      describeDate({
        publishedAt: "2026-08-01T07:00:00.000Z",
        capturedAt: "2026-08-06T09:00:00.000Z",
      })
    ).toEqual({
      value: "2026-08-01T07:00:00.000Z",
      isCapture: false,
      label: "published",
    });
  });

  it("calls a capture time captured, and never published", () => {
    const described = describeDate({
      publishedAt: null,
      capturedAt: "2026-08-06T09:00:00.000Z",
    });

    expect(described).toEqual({
      value: "2026-08-06T09:00:00.000Z",
      isCapture: true,
      label: "captured",
    });
    expect(described.label).not.toBe("published");
  });

  /**
   * The regression this guards. A screen that reads `.value` and hardcodes "published"
   * beside it is back to the original defect, so the label travels with the value and the
   * flag makes the difference impossible to overlook.
   */
  it("never returns the published label without a publication date", () => {
    for (const publishedAt of [null, ""]) {
      const described = describeDate({
        publishedAt: publishedAt as string | null,
        capturedAt: "2026-08-06T09:00:00.000Z",
      });

      expect(described.isCapture).toBe(true);
      expect(described.label).toBe("captured");
    }
  });
});

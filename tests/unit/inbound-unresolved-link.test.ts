import { describe, expect, it } from "vitest";
import { classifyUnwrap } from "@/lib/inbound/link-outcome";

/**
 * Finding D4 of 6 August 2026: an unwrap that failed was indistinguishable from one that
 * succeeded.
 *
 * `ingestForSource` only dropped an item when the note mentioned a private address or a
 * disallowed target. Every other failure, a redirect loop, five hops exhausted, a five
 * second timeout against a slow publisher, fell through and created the article with the
 * newsletter's tracking URL as its source. Nothing recorded it, so an edition could go
 * out linking to link.mail.beehiiv.com with "Beehiiv" named as the publisher.
 *
 * Three outcomes now, because there are three different decisions to take.
 */

describe("classifyUnwrap", () => {
  it("calls a followed chain resolved", () => {
    expect(classifyUnwrap({ unwrapped: true, note: null })).toBe("resolved");
  });

  /**
   * unwrapUrl returns unwrapped: true with hops: 0 for a URL that was never a wrapper,
   * which is the same fact: this is where it points.
   */
  it("calls a URL that was never a wrapper resolved", () => {
    expect(classifyUnwrap({ unwrapped: true, note: null })).toBe("resolved");
  });

  it("refuses a target the safety check rejected as private", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped: not a public address" })
    ).toBe("refused");
  });

  it("refuses a target the safety check said was not allowed", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped: the scheme is not allowed" })
    ).toBe("refused");
  });

  it("marks an exhausted hop budget unresolved rather than refusing it", () => {
    expect(classifyUnwrap({ unwrapped: false, note: "stopped after 5 hops" })).toBe(
      "unresolved"
    );
  });

  it("marks a redirect loop unresolved", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped: the redirects loop" })
    ).toBe("unresolved");
  });

  it("marks a network failure unresolved, which is the timeout case", () => {
    expect(
      classifyUnwrap({
        unwrapped: false,
        note: "stopped: The operation was aborted due to timeout",
      })
    ).toBe("unresolved");
  });

  it("marks a non-URL redirect target unresolved", () => {
    expect(
      classifyUnwrap({
        unwrapped: false,
        note: "stopped: the redirect target was not a URL",
      })
    ).toBe("unresolved");
  });

  it("marks an unwrapped-false result with no note unresolved", () => {
    expect(classifyUnwrap({ unwrapped: false, note: null })).toBe("unresolved");
  });

  /**
   * The refusal check reads the note, so it must not fire on a note that merely
   * contains the words in another sense. This is the case the narrow match protects.
   */
  it("does not treat a resolved chain as refused whatever its note says", () => {
    expect(
      classifyUnwrap({ unwrapped: true, note: "stopped: not a public address" })
    ).toBe("resolved");
  });
});

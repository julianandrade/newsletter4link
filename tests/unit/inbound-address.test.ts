import { describe, expect, it } from "vitest";
import {
  bareAddress,
  sameAddress,
  subaddressTag,
  withoutTag,
} from "@/lib/inbound/address";

describe("subaddressTag", () => {
  it("reads the tag subscriptions use", () => {
    expect(subaddressTag("radar+tldr@julianandrade.net")).toBe("tldr");
    expect(subaddressTag("radar+benedict@julianandrade.net")).toBe("benedict");
  });

  it("is null when the address carries no tag", () => {
    expect(subaddressTag("radar@julianandrade.net")).toBeNull();
    expect(subaddressTag("alias@kroniiquau.resend.app")).toBeNull();
  });

  it("lowercases, because a match key that depends on casing is not one", () => {
    expect(subaddressTag("Radar+TLDR@JulianAndrade.net")).toBe("tldr");
  });

  it("takes everything after the first plus", () => {
    // The transport delivers to `radar`; everything after the first plus is the tag.
    expect(subaddressTag("radar+tldr+extra@x.com")).toBe("tldr+extra");
  });

  it("is null for a trailing plus with nothing after it", () => {
    expect(subaddressTag("radar+@x.com")).toBeNull();
  });

  it("reads a tag out of a full header", () => {
    expect(subaddressTag("Radar <radar+tldr@x.com>")).toBe("tldr");
  });

  it("is null for malformed input rather than throwing", () => {
    for (const value of ["", "   ", "not an address", "@x.com", "radar@", "radar@nodot"]) {
      expect(subaddressTag(value)).toBeNull();
    }
  });
});

describe("bareAddress", () => {
  it("strips a display name", () => {
    expect(bareAddress("TLDR Newsletter <dan@tldrnewsletter.com>")).toBe(
      "dan@tldrnewsletter.com"
    );
  });

  it("handles angle brackets with no name", () => {
    expect(bareAddress("<dan@tldrnewsletter.com>")).toBe("dan@tldrnewsletter.com");
  });

  it("handles a bare address", () => {
    expect(bareAddress("dan@tldrnewsletter.com")).toBe("dan@tldrnewsletter.com");
  });

  it("lowercases", () => {
    expect(bareAddress("Dan@TLDRNewsletter.COM")).toBe("dan@tldrnewsletter.com");
  });

  it("keeps a plus tag, since that is part of the address", () => {
    expect(bareAddress("radar+tldr@x.com")).toBe("radar+tldr@x.com");
  });

  it("is null for nonsense", () => {
    expect(bareAddress("Just A Name")).toBeNull();
    expect(bareAddress("")).toBeNull();
  });

  it("takes the last at sign, for a local part containing one", () => {
    expect(bareAddress('"odd@local"@example.com')).toBe('"odd@local"@example.com');
  });
});

describe("withoutTag", () => {
  it("removes the tag", () => {
    expect(withoutTag("radar+tldr@x.com")).toBe("radar@x.com");
  });

  it("leaves an untagged address alone", () => {
    expect(withoutTag("radar@x.com")).toBe("radar@x.com");
  });
});

describe("sameAddress", () => {
  it("matches on the address, not the display name", () => {
    // A newsletter changes its display name whenever its marketing team feels like it.
    expect(
      sameAddress("TLDR <dan@tldrnewsletter.com>", "TLDR AI <dan@tldrnewsletter.com>")
    ).toBe(true);
  });

  it("ignores casing", () => {
    expect(sameAddress("Dan@X.com", "dan@x.com")).toBe(true);
  });

  it("does not match different addresses", () => {
    expect(sameAddress("a@x.com", "b@x.com")).toBe(false);
  });

  it("does not match when either side is missing", () => {
    expect(sameAddress(null, "a@x.com")).toBe(false);
    expect(sameAddress("a@x.com", null)).toBe(false);
    expect(sameAddress("nonsense", "a@x.com")).toBe(false);
  });
});

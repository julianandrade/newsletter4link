import { describe, expect, it } from "vitest";
import { handoverAccepted, selfOrigin } from "@/lib/inbound/handover";

/**
 * The first handover fired into nothing, and this file is the two reasons.
 *
 * It called `VERCEL_URL`, the deployment's own hostname, which sits behind Vercel's
 * deployment protection and answered 302 to an SSO page. And it treated any response that
 * did not throw as success, so that 302 was indistinguishable from a child accepting the
 * work. Eight emails sat untouched for four minutes with nothing logged.
 */

describe("selfOrigin", () => {
  it("prefers Vercel's production domain, which is not protected", () => {
    expect(
      selfOrigin({
        VERCEL_PROJECT_PRODUCTION_URL: "newsletter4link.vercel.app",
        NEXT_PUBLIC_APP_URL: "https://example.com",
      })
    ).toBe("https://newsletter4link.vercel.app");
  });

  it("falls back to the configured public address", () => {
    expect(
      selfOrigin({
        NEXT_PUBLIC_APP_URL: "https://newsletter4link.vercel.app",
      })
    ).toBe("https://newsletter4link.vercel.app");
  });

  it("never uses VERCEL_URL, because a deployment URL answers 302 to an SSO page", () => {
    // The whole reason this module exists. A deployment hostname is not reachable without
    // a protection bypass, so choosing it produces a handover that cannot arrive.
    expect(
      selfOrigin({
        VERCEL_URL: "newsletter4link-r9mt16oui-julianandrades-projects.vercel.app",
      })
    ).toBeNull();
  });

  it("trims a trailing slash, so the path is not doubled", () => {
    expect(
      selfOrigin({
        NEXT_PUBLIC_APP_URL: "https://newsletter4link.vercel.app/",
      })
    ).toBe("https://newsletter4link.vercel.app");
  });

  it("is null when nothing usable is configured, so no handover is attempted", () => {
    expect(selfOrigin({})).toBeNull();
    expect(selfOrigin({ NEXT_PUBLIC_APP_URL: "   " })).toBeNull();
  });
});

describe("handoverAccepted", () => {
  it("accepts a 2xx, which is the child answering that it took the work", () => {
    expect(handoverAccepted(200)).toBe(true);
    expect(handoverAccepted(202)).toBe(true);
  });

  it("refuses a redirect, which is what deployment protection answers", () => {
    expect(handoverAccepted(302)).toBe(false);
    expect(handoverAccepted(307)).toBe(false);
  });

  it("refuses an auth failure, which is a wrong or missing cron secret", () => {
    expect(handoverAccepted(401)).toBe(false);
    expect(handoverAccepted(403)).toBe(false);
  });

  it("refuses a server error, so a broken child is visible rather than assumed", () => {
    expect(handoverAccepted(500)).toBe(false);
    expect(handoverAccepted(503)).toBe(false);
  });
});

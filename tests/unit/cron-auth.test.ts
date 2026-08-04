import { beforeEach, describe, expect, it, vi } from "vitest";

// `config` reads process.env once at import time, so the secret is swapped through
// a mock the guard shares by reference and reads on every call.
const cronConfig = vi.hoisted(() => ({ secret: undefined as string | undefined }));

vi.mock("@/lib/config", () => ({ config: { cron: cronConfig } }));

import { authorizeCron } from "@/lib/auth/cron";

const requestWith = (authorization?: string) =>
  new Request("https://example.test/api/cron/daily-collection", {
    headers: authorization ? { authorization } : {},
  });

describe("authorizeCron", () => {
  beforeEach(() => {
    cronConfig.secret = undefined;
  });

  describe("when no secret is configured", () => {
    // This is the regression the module exists for. Every cron route used to wrap
    // its check in `if (config.cron.secret)`, and CRON_SECRET was not set in
    // production, so the check never ran. One of those routes finalized an edition
    // and sent the newsletter to every subscriber.
    it("refuses an unauthenticated request rather than allowing it", () => {
      const result = authorizeCron(requestWith());

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ status: 503 });
    });

    it("refuses even a request carrying a plausible bearer token", () => {
      expect(authorizeCron(requestWith("Bearer anything")).ok).toBe(false);
    });

    it("says the deployment is misconfigured, not that the caller is unauthorized", () => {
      const result = authorizeCron(requestWith());

      // 503 over 401: no credential would help, and a 401 sends whoever is
      // debugging it looking for the wrong problem.
      expect(result).toEqual({
        ok: false,
        status: 503,
        error: expect.stringContaining("CRON_SECRET"),
      });
    });

    it("treats an empty secret as absent", () => {
      cronConfig.secret = "";

      expect(authorizeCron(requestWith("Bearer "))).toMatchObject({
        status: 503,
      });
    });
  });

  describe("when a secret is configured", () => {
    beforeEach(() => {
      cronConfig.secret = "s3cret-value";
    });

    it("accepts the matching bearer token", () => {
      expect(authorizeCron(requestWith("Bearer s3cret-value"))).toEqual({
        ok: true,
      });
    });

    it("rejects a missing header", () => {
      expect(authorizeCron(requestWith())).toEqual({
        ok: false,
        status: 401,
        error: "Unauthorized",
      });
    });

    it("rejects a wrong token", () => {
      expect(authorizeCron(requestWith("Bearer wrong"))).toMatchObject({
        status: 401,
      });
    });

    it("rejects the bare secret without the Bearer scheme", () => {
      expect(authorizeCron(requestWith("s3cret-value"))).toMatchObject({
        status: 401,
      });
    });

    it("rejects a different scheme carrying the right value", () => {
      expect(authorizeCron(requestWith("Basic s3cret-value"))).toMatchObject({
        status: 401,
      });
    });

    it("is case sensitive on the token", () => {
      expect(authorizeCron(requestWith("Bearer S3CRET-VALUE"))).toMatchObject({
        status: 401,
      });
    });

    it("does not accept a prefix of the secret", () => {
      expect(authorizeCron(requestWith("Bearer s3cret"))).toMatchObject({
        status: 401,
      });
    });

    it("accepts surrounding whitespace, which the platform strips before we see it", () => {
      // Not laxity on our side: the Fetch specification trims leading and trailing
      // HTTP whitespace from a header value when it is set, so the guard is handed
      // an already-normalized string. Asserted so a future reader does not add a
      // trim and assume it changed something.
      expect(authorizeCron(requestWith("Bearer s3cret-value "))).toEqual({
        ok: true,
      });
      // Interior whitespace is not touched, and is still a mismatch.
      expect(authorizeCron(requestWith("Bearer  s3cret-value"))).toMatchObject({
        status: 401,
      });
    });

    it("never puts the secret in the error it returns", () => {
      const result = authorizeCron(requestWith("Bearer wrong"));

      expect(JSON.stringify(result)).not.toContain("s3cret-value");
    });
  });
});

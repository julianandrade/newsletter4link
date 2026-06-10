import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "./unsubscribe-token";

const SUBSCRIBER_ID = "clx1234567890abcdefghijk";

describe("unsubscribe-token", () => {
  const originalEnv = {
    UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  };

  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = "test-secret-for-unit-tests";
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (originalEnv.UNSUBSCRIBE_SECRET === undefined) {
      delete process.env.UNSUBSCRIBE_SECRET;
    } else {
      process.env.UNSUBSCRIBE_SECRET = originalEnv.UNSUBSCRIBE_SECRET;
    }
    if (originalEnv.CRON_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv.CRON_SECRET;
    }
  });

  describe("generateUnsubscribeToken", () => {
    it("generates a two-part token", () => {
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      expect(token.split(".")).toHaveLength(2);
    });

    it("is deterministic for the same subscriber and secret", () => {
      expect(generateUnsubscribeToken(SUBSCRIBER_ID)).toBe(
        generateUnsubscribeToken(SUBSCRIBER_ID)
      );
    });

    it("does not expose the raw subscriber ID in the token", () => {
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      expect(token).not.toContain(SUBSCRIBER_ID);
    });

    it("throws when no signing secret is configured", () => {
      delete process.env.UNSUBSCRIBE_SECRET;
      expect(() => generateUnsubscribeToken(SUBSCRIBER_ID)).toThrow(
        /UNSUBSCRIBE_SECRET/
      );
    });

    it("falls back to CRON_SECRET when UNSUBSCRIBE_SECRET is unset", () => {
      delete process.env.UNSUBSCRIBE_SECRET;
      process.env.CRON_SECRET = "cron-secret-fallback";
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      expect(verifyUnsubscribeToken(token)).toBe(SUBSCRIBER_ID);
    });
  });

  describe("verifyUnsubscribeToken", () => {
    it("round-trips a valid token back to the subscriber ID", () => {
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      expect(verifyUnsubscribeToken(token)).toBe(SUBSCRIBER_ID);
    });

    it("rejects a raw subscriber ID (the old link format)", () => {
      expect(verifyUnsubscribeToken(SUBSCRIBER_ID)).toBeNull();
    });

    it("rejects a token with a tampered payload", () => {
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      const [, signature] = token.split(".");
      const forgedPayload = Buffer.from("someone-elses-id").toString(
        "base64url"
      );
      expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`)).toBeNull();
    });

    it("rejects a token with a tampered signature", () => {
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      const [payload] = token.split(".");
      expect(verifyUnsubscribeToken(`${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
    });

    it("rejects a token signed with a different secret", () => {
      const token = generateUnsubscribeToken(SUBSCRIBER_ID);
      process.env.UNSUBSCRIBE_SECRET = "a-different-secret";
      expect(verifyUnsubscribeToken(token)).toBeNull();
    });

    it("rejects malformed tokens", () => {
      expect(verifyUnsubscribeToken("")).toBeNull();
      expect(verifyUnsubscribeToken(".")).toBeNull();
      expect(verifyUnsubscribeToken("only-one-part")).toBeNull();
      expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
    });
  });

  describe("buildUnsubscribeUrl", () => {
    it("embeds a token, not the subscriber ID", () => {
      const url = buildUnsubscribeUrl(SUBSCRIBER_ID);
      expect(url).toContain("/unsubscribe?token=");
      expect(url).not.toContain(`id=${SUBSCRIBER_ID}`);
      const token = new URL(url).searchParams.get("token");
      expect(verifyUnsubscribeToken(token!)).toBe(SUBSCRIBER_ID);
    });

    it("returns the generic page when no subscriber ID is given", () => {
      const url = buildUnsubscribeUrl();
      expect(url.endsWith("/unsubscribe")).toBe(true);
    });
  });
});

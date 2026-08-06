import { beforeAll, describe, expect, it } from "vitest";
import {
  generateToken,
  generateUnsubscribeToken,
  verifyToken,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-not-a-real-one";
});

/**
 * The archive page reuses the HMAC that signs unsubscribe links. Reusing the same *token*
 * would be token confusion: a link leaked in one context would grant the other, so an
 * unsubscribe link would open someone's archive and an archive link would unsubscribe them.
 */
describe("purpose scoping", () => {
  it("round-trips an archive token", () => {
    const token = generateToken("archive", "sub_123");
    expect(verifyToken("archive", token)).toBe("sub_123");
  });

  it("does not let an unsubscribe token open the archive", () => {
    const token = generateUnsubscribeToken("sub_123");
    expect(verifyToken("archive", token)).toBeNull();
  });

  it("does not let an archive token unsubscribe", () => {
    const token = generateToken("archive", "sub_123");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("keeps signing the unsubscribe purpose over the bare id, so delivered links still work", () => {
    // Every email already sent carries a token signed over the subscriber id alone. An
    // unsubscribe link that stops working is a compliance problem, not a bug, so this shape
    // is frozen forever and only new purposes get a prefix.
    const legacy = generateUnsubscribeToken("sub_123");
    expect(verifyUnsubscribeToken(legacy)).toBe("sub_123");
    expect(verifyToken("unsubscribe", legacy)).toBe("sub_123");
  });

  it("issues a different token per purpose for the same subscriber", () => {
    expect(generateToken("archive", "sub_123")).not.toBe(
      generateToken("unsubscribe", "sub_123")
    );
  });

  it("issues a different token per subscriber for the same purpose", () => {
    expect(generateToken("archive", "sub_a")).not.toBe(generateToken("archive", "sub_b"));
  });
});

describe("rejection", () => {
  it("rejects a malformed token", () => {
    expect(verifyToken("archive", "not-a-token")).toBeNull();
    expect(verifyToken("archive", "")).toBeNull();
    expect(verifyToken("archive", "a.b.c")).toBeNull();
    expect(verifyToken("archive", ".")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = generateToken("archive", "sub_123");
    const [payload] = token.split(".");
    expect(verifyToken("archive", `${payload}.tampered`)).toBeNull();
  });

  it("rejects a token whose payload was swapped for another subscriber", () => {
    // The signature covers the id, so re-pointing the payload at someone else fails.
    const token = generateToken("archive", "sub_123");
    const signature = token.split(".")[1];
    const other = Buffer.from("sub_456", "utf8").toString("base64url");
    expect(verifyToken("archive", `${other}.${signature}`)).toBeNull();
  });
});

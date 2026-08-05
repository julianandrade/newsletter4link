import { describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { verifyResendWebhook } from "@/lib/webhooks/verify";

/**
 * The secret shape Svix uses. Any base64 body works; the prefix is what the library reads.
 */
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

const signed = (body: string, secret = SECRET, id = "msg_1") => {
  const timestamp = new Date("2026-08-05T10:00:00Z");
  const signature = new Webhook(secret).sign(id, timestamp, body);

  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
  });
};

describe("verifyResendWebhook", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ type: "email.opened" });
    // Signed just now, because the library enforces a timestamp tolerance.
    const now = new Date();
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": new Webhook(SECRET).sign("msg_1", now, body),
    });

    const result = verifyResendWebhook(body, headers, SECRET);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({ type: "email.opened" });
  });

  it("rejects a forged signature", () => {
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,Zm9yZ2VkIHNpZ25hdHVyZQ==",
    });

    const result = verifyResendWebhook("{}", headers, SECRET);

    expect(result).toEqual({ ok: false, status: 401, error: "Invalid signature" });
  });

  it("rejects the shape the old code accepted", () => {
    // The previous implementation split the header on "," and then looked for a part
    // starting with "v1,", which never matched, so it skipped verification entirely and
    // accepted this request.
    const headers = new Headers({
      "svix-id": "x",
      "svix-timestamp": "1",
      "svix-signature": "v1,fake",
    });

    expect(verifyResendWebhook("{}", headers, SECRET).ok).toBe(false);
  });

  it("rejects a body that was altered after signing", () => {
    const body = JSON.stringify({ type: "email.opened", data: { email_id: "a" } });
    const now = new Date();
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": new Webhook(SECRET).sign("msg_1", now, body),
    });

    const tampered = JSON.stringify({ type: "email.opened", data: { email_id: "b" } });

    expect(verifyResendWebhook(tampered, headers, SECRET).ok).toBe(false);
  });

  it("rejects a replay from outside the timestamp tolerance", () => {
    // Signed for a fixed date in the past, which is what a captured payload is.
    const body = "{}";

    expect(verifyResendWebhook(body, signed(body), SECRET).ok).toBe(false);
  });

  it("refuses when no secret is configured, rather than passing everything", () => {
    const result = verifyResendWebhook("{}", new Headers(), undefined);

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "This webhook is not configured: its signing secret is missing",
    });
  });

  it("names the missing headers", () => {
    const result = verifyResendWebhook("{}", new Headers({ "svix-id": "x" }), SECRET);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(result.error).toContain("svix-timestamp");
    expect(result.error).toContain("svix-signature");
  });

  it("rejects a payload signed with a different secret", () => {
    const body = "{}";
    const other = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const now = new Date();
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": new Webhook(other).sign("msg_1", now, body),
    });

    expect(verifyResendWebhook(body, headers, SECRET).ok).toBe(false);
  });
});

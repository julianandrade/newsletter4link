import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifySvixSignature, type SvixHeaders } from "./resend-webhook";

const RAW_KEY = crypto.randomBytes(24);
const SECRET = `whsec_${RAW_KEY.toString("base64")}`;
const PAYLOAD = JSON.stringify({ type: "email.opened", data: { email_id: "msg_1" } });

function signedHeaders(
  overrides: Partial<SvixHeaders> = {},
  timestampSeconds = Math.floor(Date.now() / 1000)
): SvixHeaders {
  const svixId = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";
  const svixTimestamp = String(timestampSeconds);
  const signature = crypto
    .createHmac("sha256", RAW_KEY)
    .update(`${svixId}.${svixTimestamp}.${PAYLOAD}`)
    .digest("base64");

  return {
    svixId,
    svixTimestamp,
    svixSignature: `v1,${signature}`,
    ...overrides,
  };
}

describe("verifySvixSignature", () => {
  it("accepts a correctly signed payload", () => {
    expect(verifySvixSignature(signedHeaders(), PAYLOAD, SECRET)).toBe(true);
  });

  it("accepts when one of multiple space-delimited signatures matches", () => {
    const headers = signedHeaders();
    headers.svixSignature = `v1,${"A".repeat(44)} ${headers.svixSignature}`;
    expect(verifySvixSignature(headers, PAYLOAD, SECRET)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    expect(
      verifySvixSignature(signedHeaders(), PAYLOAD + "x", SECRET)
    ).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const otherSecret = `whsec_${crypto.randomBytes(24).toString("base64")}`;
    expect(verifySvixSignature(signedHeaders(), PAYLOAD, otherSecret)).toBe(
      false
    );
  });

  it("rejects missing headers", () => {
    expect(
      verifySvixSignature(signedHeaders({ svixId: null }), PAYLOAD, SECRET)
    ).toBe(false);
    expect(
      verifySvixSignature(
        signedHeaders({ svixTimestamp: null }),
        PAYLOAD,
        SECRET
      )
    ).toBe(false);
    expect(
      verifySvixSignature(
        signedHeaders({ svixSignature: null }),
        PAYLOAD,
        SECRET
      )
    ).toBe(false);
  });

  it("rejects stale timestamps (replay protection)", () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    expect(
      verifySvixSignature(signedHeaders({}, tenMinutesAgo), PAYLOAD, SECRET)
    ).toBe(false);
  });

  it("rejects non-v1 signature schemes", () => {
    const headers = signedHeaders();
    headers.svixSignature = headers.svixSignature!.replace("v1,", "v2,");
    expect(verifySvixSignature(headers, PAYLOAD, SECRET)).toBe(false);
  });

  it("rejects garbage signature headers", () => {
    const headers = signedHeaders({ svixSignature: "not-a-signature" });
    expect(verifySvixSignature(headers, PAYLOAD, SECRET)).toBe(false);
  });
});

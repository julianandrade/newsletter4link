import crypto from "crypto";

// Maximum allowed age of a webhook timestamp (replay protection)
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}

/**
 * Verify a Resend (Svix) webhook signature.
 *
 * Svix signs `${svix-id}.${svix-timestamp}.${payload}` with HMAC-SHA256,
 * keyed by the base64-decoded portion of the "whsec_..." secret, and sends
 * the base64 digest in svix-signature as space-delimited "v1,<sig>" entries.
 */
export function verifySvixSignature(
  headers: SvixHeaders,
  payload: string,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  const { svixId, svixTimestamp, svixSignature } = headers;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  const timestamp = parseInt(svixTimestamp, 10);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(nowMs / 1000 - timestamp) > TIMESTAMP_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${svixId}.${svixTimestamp}.${payload}`)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return svixSignature.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const signatureBuffer = Buffer.from(signature, "utf8");
    return (
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    );
  });
}

import { Webhook, WebhookVerificationError } from "svix";

/**
 * Verify a Resend webhook, which is a Svix webhook.
 *
 * This exists because the hand-rolled verification it replaces did not verify anything.
 * The header `svix-signature` looks like `v1,<base64> v1,<base64>`, space separated. The
 * old code split it on the comma and then looked for a part starting with `"v1,"`, which
 * can never match after the comma has been consumed as the delimiter, so the signature
 * came out undefined and the whole check sat inside `if (v1Signature)` and was skipped.
 * Two smaller errors were behind it: the HMAC was compared as hex where Svix uses base64,
 * and the `whsec_` secret was used as raw text rather than base64 decoded.
 *
 * The result was a public endpoint that accepted any request carrying any signature
 * header. It survived because the middleware happened to redirect the route to the login
 * page, so nothing reached it at all, which also meant Resend never delivered a single
 * event and email tracking has never worked.
 *
 * Using the library rather than fixing the arithmetic: it handles the timestamp tolerance
 * that stops a captured payload being replayed a day later, and multiple signatures during
 * a secret rotation. Neither is worth reimplementing, and both are easy to get wrong in a
 * way that only shows up as a security property nobody tests.
 */

export type VerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Fails closed, in both directions.
 *
 * No secret configured means refusal, not a bypass: a webhook that accepts everything
 * because it was not configured is worse than one that accepts nothing, because the first
 * looks like it is working.
 */
export function verifyResendWebhook(
  body: string,
  headers: Headers,
  secret: string | undefined
): VerifyResult {
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "This webhook is not configured: its signing secret is missing",
    };
  }

  const required = {
    "svix-id": headers.get("svix-id"),
    "svix-timestamp": headers.get("svix-timestamp"),
    "svix-signature": headers.get("svix-signature"),
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    return {
      ok: false,
      status: 401,
      error: `Missing signature headers: ${missing.join(", ")}`,
    };
  }

  try {
    const payload = new Webhook(secret).verify(body, {
      "svix-id": required["svix-id"] as string,
      "svix-timestamp": required["svix-timestamp"] as string,
      "svix-signature": required["svix-signature"] as string,
    });

    return { ok: true, payload };
  } catch (error) {
    // The reason is logged, not returned: telling a caller which part of its forgery was
    // wrong is help it does not need.
    console.warn(
      "Webhook signature rejected:",
      error instanceof WebhookVerificationError ? error.message : error
    );

    return { ok: false, status: 401, error: "Invalid signature" };
  }
}

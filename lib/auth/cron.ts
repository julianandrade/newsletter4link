import crypto from "crypto";
import { config } from "@/lib/config";

/**
 * Verify the Authorization header on cron endpoints.
 *
 * Fails closed in production: if CRON_SECRET is not configured, all
 * requests are rejected (cron routes are public in the middleware, so
 * the bearer token is their only protection). In development, requests
 * are allowed when no secret is set to ease local testing.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = config.cron.secret;

  if (!secret) {
    if (config.app.env === "production") {
      console.error(
        "CRON_SECRET is not configured; rejecting cron request. Set CRON_SECRET in the environment."
      );
      return false;
    }
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const provided = Buffer.from(authHeader, "utf8");

  return (
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided)
  );
}

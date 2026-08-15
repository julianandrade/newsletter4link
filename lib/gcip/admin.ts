/**
 * Server-side Identity Platform: verifying that a request carries a real session.
 *
 * Identity Platform speaks the Firebase Auth protocol, so `firebase-admin` is the server SDK.
 * It authenticates with Application Default Credentials, which on Cloud Run is the runtime
 * service account, so there is no service account key to hold anywhere.
 *
 * The session model differs from Supabase's and this is the part worth understanding. Supabase
 * keeps its own cookies and `@supabase/ssr` reads them. Identity Platform hands the BROWSER a
 * short-lived ID token and nothing else; a server that wants an httpOnly cookie has to mint
 * one. So the flow is:
 *
 *   1. the client signs in with Microsoft and receives an ID token
 *   2. it POSTs that token to /api/auth/session
 *   3. this module verifies it and exchanges it for a session cookie
 *   4. every later request is authenticated by that cookie alone
 *
 * The cookie is httpOnly, which the ID token in browser storage is not. That is the security
 * reason for the exchange, beyond making server components work.
 */

import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

/** How long a session cookie lasts before the user signs in again. */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

/** The cookie name. Distinct from Supabase's so both can exist during the changeover. */
export const SESSION_COOKIE = "n4l_session";

let app: App | null = null;

function adminApp(): App {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  const projectId =
    process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_GCIP_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      "Missing GCP_PROJECT_ID. Terraform sets it on Cloud Run; locally, set it to the " +
        "Identity Platform project."
    );
  }

  // A JSON key is supported but not expected: it exists for a workstation with no ADC.
  // Cloud Run uses the runtime service account and needs no credential material at all.
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  app = initializeApp({
    projectId,
    credential: json ? cert(JSON.parse(json)) : applicationDefault(),
  });

  return app;
}

/**
 * Exchange a freshly minted ID token for a session cookie.
 *
 * `checkRevoked` is deliberately on: without it a token issued before an account was disabled
 * still verifies until it expires, which is exactly the window that matters when someone
 * leaves the company.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  const auth = getAuth(adminApp());
  await auth.verifyIdToken(idToken, true);
  return auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
}

/**
 * Verify a session cookie. Returns null rather than throwing: an expired or absent session is
 * the ordinary logged-out case, not an error, and every caller already handles null.
 */
export async function verifySessionCookie(
  cookie: string | undefined
): Promise<DecodedIdToken | null> {
  if (!cookie) return null;

  try {
    return await getAuth(adminApp()).verifySessionCookie(cookie, true);
  } catch {
    return null;
  }
}

/** Revoke every session for a subject, which is what signing out everywhere means. */
export async function revokeSessions(uid: string): Promise<void> {
  await getAuth(adminApp()).revokeRefreshTokens(uid);
}

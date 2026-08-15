/**
 * Exchanges an Identity Platform ID token for an httpOnly session cookie, and clears it.
 *
 * This is the one route that has to exist for Identity Platform that did not for Supabase.
 * The client SDK holds an ID token in browser storage, which server components and middleware
 * cannot read and which JavaScript on the page can. Trading it for an httpOnly cookie fixes
 * both: the server can authenticate a request, and a cross-site script cannot lift the
 * credential.
 *
 * The domain allowlist is enforced here as well as in middleware. This route is the moment an
 * identity first becomes a session, so it is the cheapest place to refuse one, and refusing
 * before the cookie exists is better than issuing one and rejecting every later request.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSessionCookie,
} from "@/lib/gcip/admin";
import { DOMAIN_REJECTED_MESSAGE, isAllowedEmail } from "@/lib/auth/allowed-domains";
import { getAuth } from "firebase-admin/auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // Verified before the exchange so the email can be checked against the allowlist. A
    // token that fails verification throws and is answered as 401 below, never as a 500.
    const decoded = await getAuth().verifyIdToken(idToken, true);

    if (!isAllowedEmail(decoded.email ?? null)) {
      return NextResponse.json({ error: DOMAIN_REJECTED_MESSAGE }, { status: 403 });
    }

    const cookie = await createSessionCookie(idToken);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      // Off in development only, where the dev server is plain http.
      secure: process.env.NODE_ENV === "production",
      // Lax rather than Strict: the sign-in returns from Microsoft as a top-level navigation,
      // and Strict would withhold the cookie on exactly that request, so the user would land
      // back on the login page having just signed in successfully.
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });

    return response;
  } catch (error) {
    // Deliberately not echoed to the client: the reason a token failed is information about
    // the token. Logged server-side, where it is useful and not disclosed.
    console.error("Session exchange failed", error);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}

/** Sign out. Clearing the cookie is the whole job; the client SDK drops its own token. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

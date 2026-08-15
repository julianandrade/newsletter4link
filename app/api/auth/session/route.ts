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
  verifyIdToken,
} from "@/lib/gcip/admin";
import { DOMAIN_REJECTED_MESSAGE, isAllowedEmail } from "@/lib/auth/allowed-domains";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    // Verified before the exchange so the email can be checked against the allowlist. A token
    // that fails verification throws and is answered as 401 below, never as a 500.
    //
    // Through the helper, not `getAuth()` directly: the bare call resolves the DEFAULT Firebase
    // app, which does not exist until something initialises it, and nothing had at this point.
    // Every real sign-in failed with "The default Firebase app does not exist", reported to the
    // user as "Invalid credentials" because the catch below cannot tell the two apart.
    const decoded = await verifyIdToken(idToken);

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
    // Never echoed to the client: why a token failed is information about the token. Logged
    // server-side, where it is useful and not disclosed.
    console.error("Session exchange failed", error);

    /**
     * Not everything caught here is a bad token, and conflating the two cost a debugging round
     * trip. A missing Firebase app, absent credentials or an unreachable Google endpoint are
     * OUR faults, and answering 401 tells the user their perfectly good Microsoft sign-in was
     * refused, which sends them to check their password while the server is misconfigured.
     *
     * Firebase's token failures carry a code beginning `auth/`. Anything without one is
     * infrastructure, and 500 is the honest answer.
     */
    const code = (error as { code?: string })?.code ?? "";
    const isTokenProblem = code.startsWith("auth/");

    if (!isTokenProblem) {
      return NextResponse.json(
        { error: "Sign-in is temporarily unavailable. This is a server problem, not your account." },
        { status: 500 }
      );
    }

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

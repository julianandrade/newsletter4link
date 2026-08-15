import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowed-domains";
import { MFA_PATH, resolveMfaRequirement } from "@/lib/auth/mfa";

export async function middleware(request: NextRequest) {
  /**
   * Routes that never need a session at all.
   *
   * /login is deliberately not here. It used to be, which made the
   * "authenticated user visiting /login goes to the dashboard" branch below
   * unreachable: the early return fired first. Both /login and the MFA step-up
   * page need the session read, since what to do with them depends on it.
   */
  /**
   * `/api/webhooks` is here because a webhook caller has no session and never will.
   *
   * It was not, so both Resend webhooks answered 307 to the login page and Resend never
   * delivered an event to either of them. That is why email tracking has never worked:
   * the endpoint was written, deployed, configured on Resend's side, and unreachable.
   *
   * Being public means the signature is the whole authorization, so this line is only safe
   * next to `lib/webhooks/verify.ts`, which fails closed on a missing secret and on a bad
   * signature. Before that existed, the verification here was skipped by a bug and adding
   * this path would have opened an unauthenticated write endpoint.
   */
  /**
   * `/editions` is here because the link arrives in an email and its reader has no session.
   *
   * The email's accent call to action pointed at `/dashboard`, which the branches below guard
   * with a session, a domain allowlist and a second factor. For a subscriber who reads the
   * newsletter and does not administer the app that was a dead end, and for an internal
   * newsletter citing paid sources a login wall with MFA is not the gate that belongs on it.
   *
   * Being listed here means the HMAC signature is the whole authorization, so this line is only
   * safe next to a page that verifies an `archive`-purpose token, confirms the subscriber
   * actually received that edition, scopes the read to that subscriber's organization, and
   * answers the same 404 for every one of those failures. `app/editions/[id]/page.tsx` does all
   * four, and `lib/email/unsubscribe-token.ts` binds the purpose into the signature so an
   * unsubscribe link cannot be replayed here.
   */
  const publicPaths = [
    "/unsubscribe",
    "/api/unsubscribe",
    "/api/cron",
    "/api/webhooks",
    "/editions",
    /**
     * `/api/auth/session` is the route that CREATES a session, so requiring one to reach it is
     * circular. Without this line the middleware redirected the POST to `/login`, which does
     * not accept POST, and the browser got a 405 in the middle of signing in. Sign-in could
     * never have completed.
     *
     * Found by calling the route on the deployed service rather than by reading the code: the
     * status was 405, which reads like a missing handler and is actually a redirect landing on
     * a page that has none.
     *
     * Being public is safe because this route authenticates its own caller. It verifies the
     * Identity Platform ID token, with revocation checked, and enforces the domain allowlist
     * before issuing anything. That is strictly more than the middleware could do for it,
     * since the middleware runs in the Edge runtime and cannot verify the token at all.
     */
    "/api/auth/session",
  ];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isPublicPath) {
    return NextResponse.next();
  }

  const isMfaPath = request.nextUrl.pathname.startsWith(MFA_PATH);
  const isLoginPath = request.nextUrl.pathname === "/login";
  const isProtectedPath =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/api/");

  /**
   * Identity Platform path, taken when GCIP is configured. Vercel has no such variable and
   * falls through to the Supabase block below, so both deployments work from one file.
   *
   * Middleware runs in the Edge runtime, where `firebase-admin` cannot run: it needs Node
   * APIs. So this branch checks only that a session cookie is PRESENT and does not verify its
   * signature. That is deliberate, and worth being exact about, because "the middleware checks
   * the cookie" is the kind of sentence that hides a hole.
   *
   * Middleware here is a redirect optimiser, not the authorization boundary. It reads no data
   * and decides nothing about what a request may touch. Three things in the Node runtime do:
   *
   *  - `POST /api/auth/session` verifies the ID token and enforces the domain allowlist BEFORE
   *    any cookie exists, so a disallowed address never gets a session. That is stronger than
   *    the Supabase branch below, which has to sign out an address that already holds one,
   *    because Supabase's signup endpoint is reachable by anyone with the anon key.
   *  - `getCurrentIdentity()` verifies the cookie's signature, with revocation checked, on
   *    every server-side read.
   *  - `getAuthContext()` re-checks the allowlist and resolves organization membership.
   *
   * So a forged cookie gets past this redirect and then fails at the first thing that matters.
   *
   * MFA is absent here on purpose. Identity Platform accepts Microsoft sign-in only, and Entra
   * applies the tenant's MFA and Conditional Access before we ever see the identity;
   * `lib/auth/mfa.ts` only ever guarded password accounts, and there are none.
   */
  if (process.env.NEXT_PUBLIC_GCIP_API_KEY) {
    const hasSession = Boolean(request.cookies.get("n4l_session")?.value);
    const url = request.nextUrl.clone();
    url.search = "";

    if (!hasSession) {
      if (isProtectedPath || isMfaPath) {
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    /**
     * A cookie that EXISTS is not a session that WORKS, and the difference is an infinite
     * loop.
     *
     * This used to redirect /login to /dashboard whenever a cookie was present. Middleware
     * cannot verify the cookie (Edge runtime, no firebase-admin), so any cookie that fails
     * verification server-side produced: /login -> /dashboard -> the layout finds no identity
     * -> /login, forever, with nothing in the logs. That happened for real, from a cookie that
     * was genuinely valid but whose verification was failing for a different reason.
     *
     * The nicety it provided, an already-signed-in visitor skipping the login page, is not
     * worth a bounce with no exit. The real sign-in path does not rely on it either: the
     * client navigates to /dashboard itself once the session exchange returns.
     *
     * The MFA page still redirects away, since it has no meaning under Identity Platform:
     * Microsoft is the only sign-in and Entra applies the tenant's MFA before we see anything.
     */
    if (isMfaPath) {
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /**
   * Redirect that carries the auth cookies with it.
   *
   * Everything above writes cookies onto `response`: getUser refreshes expiring
   * tokens, and signOut clears them. Returning a bare NextResponse.redirect
   * throws those away. For signOut that is not cosmetic, it is a redirect loop:
   * the cookie survives, the next request is authenticated again, and it lands
   * right back here.
   */
  const redirectTo = (pathname: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The login page is exactly where an unauthenticated visitor belongs.
    if (isLoginPath) {
      return response;
    }
    if (isProtectedPath || isMfaPath) {
      return redirectTo("/login");
    }
  }

  if (user) {
    /**
     * Domain allowlist, enforced server-side.
     *
     * Supabase's signup endpoint is reachable by anyone holding the public anon
     * key, so an address outside the allowlist can end up with a valid session
     * no matter what the login form does. This is the check that keeps it out
     * of the product: the session is destroyed rather than merely redirected,
     * so a stale cookie cannot be replayed against another route.
     */
    if (!isAllowedEmail(user.email)) {
      await supabase.auth.signOut();
      return redirectTo("/login", "?error=domain_not_allowed");
    }

    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const requirement = resolveMfaRequirement(user, aal);

    // A password account that has not completed its second factor may reach
    // the step-up page and nothing else.
    if (requirement.kind !== "satisfied") {
      if (isMfaPath) {
        return response;
      }
      if (isProtectedPath) {
        return redirectTo(MFA_PATH);
      }
    }

    // Nothing outstanding: the step-up page and /login both belong behind us.
    if (requirement.kind === "satisfied" && (isMfaPath || isLoginPath)) {
      return redirectTo("/dashboard");
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

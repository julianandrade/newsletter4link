import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowed-domains";

/**
 * OAuth and email-confirmation landing point.
 *
 * Every failure path carries its reason through to the login page. The previous
 * version redirected to a bare `?error=auth_failed`, which the page did not
 * render at all, so a provider misconfiguration looked identical to a dead
 * button and had to be diagnosed from server logs.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const fail = (reason: string, description?: string | null) => {
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", reason);
    if (description) url.searchParams.set("error_description", description);
    return NextResponse.redirect(url);
  };

  // The provider refused, or Supabase could not exchange the code. An expired
  // client secret lands here as "Unable to exchange external code": the
  // identity provider returned a code but the server-to-server token request
  // was rejected, which is provider configuration rather than app code.
  const providerError = searchParams.get("error");
  if (providerError) {
    console.error("OAuth callback returned an error", {
      error: providerError,
      code: searchParams.get("error_code"),
      description: searchParams.get("error_description"),
    });
    return fail(
      "auth_failed",
      searchParams.get("error_description") ?? searchParams.get("error_code")
    );
  }

  if (!code) {
    return fail("auth_failed", "No authorization code was returned.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Failed to exchange code for session", error.message);
    return fail("auth_failed", error.message);
  }

  // Domain allowlist, checked at the door as well as in the middleware: an
  // identity from outside the tenant should never hold a session at all, not
  // even the one it would take to be redirected away.
  const email = data.user?.email;
  if (!isAllowedEmail(email)) {
    console.warn("Rejected sign-in from a disallowed domain", {
      domain: email?.split("@")[1] ?? "unknown",
    });
    await supabase.auth.signOut();
    return fail("domain_not_allowed");
  }

  // Relative paths only: an absolute `next` would make this an open redirect.
  const target = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(`${origin}${target}`);
}

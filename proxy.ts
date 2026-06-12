import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe Auth.js instance. Uses ONLY the DB-free authConfig (no Prisma), so
// it is valid in the middleware/edge runtime. The full config (auth.ts) adds the
// jwt/session DB callbacks and only runs in the Node runtime.
const { auth } = NextAuth(authConfig);

export async function proxy(request: NextRequest) {
  // Public routes that don't need auth.
  // /api/auth/* are the Auth.js handlers themselves (sign-in/callback/session).
  // /api/cron and /api/webhooks authenticate via secrets/signatures in the
  // route handlers.
  const publicPaths = [
    "/login",
    "/unsubscribe",
    "/api/auth",
    "/api/unsubscribe",
    "/api/cron",
    "/api/webhooks",
  ];
  const { pathname } = request.nextUrl;
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // Resolve the session (reads the Auth.js JWT cookie; no DB access).
  const session = await auth();
  const isAuthenticated = !!session?.user;

  // Authenticated user hitting /login -> send to dashboard.
  if (isAuthenticated && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Unauthenticated user on a protected route -> redirect to /login, preserving
  // the originally requested path as ?redirect= (matches prior behavior used by
  // the invite flow).
  if (
    !isAuthenticated &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/api/"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const target = pathname + request.nextUrl.search;
    if (target && target !== "/login") {
      url.search = `?redirect=${encodeURIComponent(target)}`;
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
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

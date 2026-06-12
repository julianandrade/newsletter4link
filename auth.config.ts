import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/**
 * Edge-safe Auth.js config (NO Prisma, NO Node-only APIs).
 *
 * This subset is what the middleware (proxy.ts) imports so the auth check can
 * run in the edge runtime. The full config in auth.ts spreads this and adds the
 * jwt callback that touches the database (which only runs in the Node runtime).
 *
 * The Credentials provider for e2e is intentionally NOT defined here — it lives
 * in auth.ts so credential verification never executes in the edge layer.
 */
export const authConfig = {
  // Trust the deployment host header (required behind Cloud Run / proxies).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    // Microsoft Entra ID (Azure AD) — primary production sign-in.
    // Env: AUTH_MICROSOFT_ENTRA_ID_ID / _SECRET / _ISSUER are picked up by
    // Auth.js automatically; we pass them explicitly for clarity and so a
    // placeholder issuer at build time does not crash provider construction.
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: "openid profile email" } },
      // Override the default profile() so we don't call Microsoft Graph for the
      // profile photo on every sign-in (avoids an extra network round-trip and
      // tolerates placeholder credentials in CI/build). We forward `oid` so the
      // jwt callback (auth.ts) can remap the user to their OrgUser row.
      profile(profile) {
        return {
          id: profile.oid ?? profile.sub,
          oid: profile.oid,
          name: profile.name,
          email: profile.email ?? profile.preferred_username,
        };
      },
    }),
  ],
  callbacks: {
    // Edge-safe authorization gate used by middleware. Route-level redirect
    // logic lives in proxy.ts; this just reports whether a session exists.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;

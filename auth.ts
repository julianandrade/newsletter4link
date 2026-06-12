import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";

/**
 * Full (Node-runtime) Auth.js configuration.
 *
 * Spreads the edge-safe `authConfig` and adds:
 *  - the E2E-only Credentials provider (registered ONLY behind E2E_TEST_MODE)
 *  - the `jwt` callback that does the lazy Supabase->Entra remap against Prisma
 *  - the `session` callback that exposes a stable identity to the app
 *
 * Prisma is imported HERE (never in auth.config.ts) so it stays out of the edge
 * runtime / middleware. The handlers exported here back app/api/auth/[...nextauth].
 *
 * Auth migration: docs/MIGRATION-GCP.md Phase 2.
 */

// =============================================================================
// SECURITY: The Credentials provider is for E2E/CI ONLY. It is added to the
// providers array *only* when E2E_TEST_MODE === "true", and validates the
// submitted email/password against E2E_TEST_EMAIL / E2E_TEST_PASSWORD by exact
// match. It is IMPOSSIBLE to enable without that env flag — never set
// E2E_TEST_MODE in production. With the flag unset, no password sign-in exists.
// =============================================================================
const e2eCredentialsProvider =
  process.env.E2E_TEST_MODE === "true"
    ? [
        Credentials({
          id: "credentials",
          name: "E2E Test Login",
          credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
          },
          authorize(credentials) {
            const expectedEmail = process.env.E2E_TEST_EMAIL;
            const expectedPassword = process.env.E2E_TEST_PASSWORD;
            if (!expectedEmail || !expectedPassword) return null;

            const email = String(credentials?.email ?? "");
            const password = String(credentials?.password ?? "");
            if (email === expectedEmail && password === expectedPassword) {
              // `id` becomes the JWT `sub`; the org membership is resolved by
              // email in lib/auth/context.ts.
              return { id: `e2e:${email}`, email };
            }
            return null;
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...e2eCredentialsProvider],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Runs in the Node runtime. On Entra sign-in we receive `profile`; we use
     * the stable `oid` claim and the email to lazily remap the existing
     * Supabase-linked OrgUser to Entra (§2.2): look up by entraOid, else by
     * email (case-insensitive); if matched by email with a null entraOid,
     * persist entraOid = oid. The JWT stores only a stable identity.
     */
    async jwt({ token, account, profile, user }) {
      // Only do work on initial sign-in (account is present then).
      if (account && account.provider === "microsoft-entra-id") {
        const oid =
          (profile?.oid as string | undefined) ??
          (user?.id as string | undefined);
        const email = (
          (profile?.email as string | undefined) ??
          (profile?.preferred_username as string | undefined) ??
          (user?.email as string | undefined) ??
          ""
        ).toLowerCase();

        if (oid) {
          try {
            // Look up by entraOid first.
            let membership = await prisma.orgUser.findFirst({
              where: { entraOid: oid },
            });

            // Transition fallback: match by email, then backfill entraOid.
            if (!membership && email) {
              membership = await prisma.orgUser.findFirst({
                where: { email: { equals: email, mode: "insensitive" } },
              });
              if (membership && membership.entraOid == null) {
                await prisma.orgUser.updateMany({
                  where: { email: { equals: email, mode: "insensitive" }, entraOid: null },
                  data: { entraOid: oid },
                });
              }
            }
          } catch (error) {
            // Fail secure: don't block token issuance on a transient DB error,
            // but log it. Membership is re-resolved per request in context.ts.
            console.error("Auth jwt remap error:", error);
          }
        }

        token.sub = oid ?? token.sub;
        if (email) token.email = email;
      } else if (account && account.provider === "credentials") {
        // E2E test user: stable identity straight from the credentials result.
        token.sub = (user?.id as string | undefined) ?? token.sub;
        if (user?.email) token.email = user.email.toLowerCase();
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // Expose the stable oid (or credentials id) as the user id, plus email.
        session.user.id = (token.sub as string) ?? session.user.id;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
});

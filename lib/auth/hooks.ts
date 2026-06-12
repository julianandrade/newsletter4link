"use client";

import { useCallback, useMemo } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

/**
 * Client auth hook backed by Auth.js (next-auth/react).
 *
 * Replaces the previous Supabase-based hook. Requires a <SessionProvider>
 * ancestor — mounted in app/providers.tsx via the root layout.
 *
 * Auth migration: docs/MIGRATION-GCP.md Phase 2.
 */
export function useAuth() {
  const { data: session, status } = useSession();

  const signInWithMicrosoft = useCallback(
    (callbackUrl: string = "/dashboard") =>
      signIn("microsoft-entra-id", { callbackUrl }),
    []
  );

  // E2E/CI only: password sign-in via the credentials provider. Returns an
  // object with an optional `error` so callers can surface failures.
  const signInWithCredentials = useCallback(
    async (
      email: string,
      password: string,
      callbackUrl: string = "/dashboard"
    ) => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      return { error: result?.error ?? null, callbackUrl };
    },
    []
  );

  const handleSignOut = useCallback(
    (callbackUrl: string = "/login") => signOut({ callbackUrl }),
    []
  );

  return useMemo(
    () => ({
      user: session?.user ?? null,
      session: session ?? null,
      loading: status === "loading",
      signInWithMicrosoft,
      signInWithCredentials,
      signOut: handleSignOut,
    }),
    [session, status, signInWithMicrosoft, signInWithCredentials, handleSignOut]
  );
}

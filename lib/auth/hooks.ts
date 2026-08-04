"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session, SupabaseClient, AuthChangeEvent } from "@supabase/supabase-js";
import { DOMAIN_REJECTED_MESSAGE, isAllowedEmail } from "./allowed-domains";
import { isValidTotpCode, resolveMfaRequirement, type MfaRequirement } from "./mfa";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  // Initialize client only on mount (client-side)
  useEffect(() => {
    const client = createClient();
    setSupabase(client);

    // Get initial session
    const initSession = async () => {
      const { data } = await client.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };
    initSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithAzure = useCallback(async () => {
    if (!supabase) return { error: new Error("Client not initialized") };
    return supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // offline_access is what makes Microsoft issue a refresh token; without
        // it the session cannot be renewed silently and the user is bounced
        // back to the login page once the access token expires.
        scopes: "email openid profile offline_access",
      },
    });
  }, [supabase]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Client not initialized") };
      // Checked here only so the user hears about it without a round trip; the
      // middleware is what actually enforces this.
      if (!isAllowedEmail(email)) {
        return { error: new Error(DOMAIN_REJECTED_MESSAGE) };
      }
      return supabase.auth.signInWithPassword({ email, password });
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Client not initialized") };
      if (!isAllowedEmail(email)) {
        return { error: new Error(DOMAIN_REJECTED_MESSAGE) };
      }
      return supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    },
    [supabase]
  );

  /** What, if anything, this session still owes before it can be used. */
  const getMfaRequirement =
    useCallback(async (): Promise<MfaRequirement> => {
      if (!supabase) return { kind: "satisfied" };
      const [{ data: userData }, { data: aal }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      return resolveMfaRequirement(userData?.user, aal);
    }, [supabase]);

  /**
   * Start a TOTP enrollment. Returns the QR code and the secret so the user can
   * add it to an authenticator app; it only becomes a real factor once a code
   * from it is verified.
   */
  const enrollTotp = useCallback(async () => {
    if (!supabase) {
      return { data: null, error: new Error("Client not initialized") };
    }

    // A previous attempt that was never verified would block a new enrollment
    // with "factor already exists", so clear those out first.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const stale = (factors?.all ?? []).filter(
      (factor) => factor.factor_type === "totp" && factor.status === "unverified"
    );
    for (const factor of stale) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    return supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
  }, [supabase]);

  /**
   * Verify a six-digit code, which both completes an enrollment and steps the
   * session up to aal2.
   */
  const verifyTotp = useCallback(
    async (factorId: string, code: string) => {
      if (!supabase) return { error: new Error("Client not initialized") };
      if (!isValidTotpCode(code)) {
        return { error: new Error("Enter the six digits from your authenticator app.") };
      }

      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) return { error: challengeError };

      return supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
    },
    [supabase]
  );

  /** The verified factor to challenge on a returning sign-in. */
  const getTotpFactor = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.mfa.listFactors();
    return data?.totp?.[0] ?? null;
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return { error: new Error("Client not initialized") };
    return supabase.auth.signOut();
  }, [supabase]);

  return useMemo(
    () => ({
      user,
      session,
      loading,
      signInWithAzure,
      signInWithPassword,
      signUp,
      signOut,
      getMfaRequirement,
      enrollTotp,
      verifyTotp,
      getTotpFactor,
    }),
    [
      user,
      session,
      loading,
      signInWithAzure,
      signInWithPassword,
      signUp,
      signOut,
      getMfaRequirement,
      enrollTotp,
      verifyTotp,
      getTotpFactor,
    ]
  );
}

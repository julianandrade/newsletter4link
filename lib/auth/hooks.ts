"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session, SupabaseClient, AuthChangeEvent } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Create the (singleton) browser client lazily during render so we don't need a
  // synchronous setState inside the effect to initialize it.
  const [supabase] = useState<SupabaseClient>(() => createClient());

  // Subscribe to auth state on mount. All setState happens after an await
  // (getSession) or inside the auth-change callback, never synchronously in the
  // effect body.
  useEffect(() => {
    // Get initial session
    const initSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };
    initSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signInWithAzure = useCallback(async () => {
    if (!supabase) return { error: new Error("Client not initialized") };
    return supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "email openid profile",
      },
    });
  }, [supabase]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Client not initialized") };
      return supabase.auth.signInWithPassword({ email, password });
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: new Error("Client not initialized") };
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
    }),
    [user, session, loading, signInWithAzure, signInWithPassword, signUp, signOut]
  );
}

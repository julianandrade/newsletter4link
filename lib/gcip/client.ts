"use client";

/**
 * Browser-side Identity Platform.
 *
 * Identity Platform speaks the Firebase Auth protocol, so the client SDK is `firebase/auth`
 * pointed at this project. Three values configure it, all public and all inlined into the
 * bundle at build time, which is why they are `NEXT_PUBLIC_` and why the Docker build takes
 * them as build arguments rather than reading them at runtime.
 *
 * The API key is not a secret. It ships to every visitor exactly as the Supabase anon key
 * does. What protects it is the referrer restriction in `infra/terraform/identity.tf`, which
 * is verified: the same request without an allowed Referer is refused.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  OAuthProvider,
  type Auth,
  type UserCredential,
} from "firebase/auth";

let app: FirebaseApp | null = null;

export function gcipConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GCIP_API_KEY);
}

function gcipApp(): FirebaseApp {
  if (app) return app;

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }

  app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_GCIP_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_GCIP_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_GCIP_PROJECT_ID!,
  });

  return app;
}

export function gcipAuth(): Auth {
  return getAuth(gcipApp());
}

/**
 * Sign in with Microsoft, then trade the ID token for an httpOnly session cookie.
 *
 * A popup rather than a redirect. The redirect flow returns through
 * `<project>.firebaseapp.com/__/auth/handler` and then back to the app, which works but loses
 * the page's state on the way and is markedly harder to reason about when it goes wrong. The
 * popup uses the same handler and the same registered redirect URI, so Entra needs no
 * additional configuration either way.
 *
 * The exchange is not optional. Without it the browser holds a token the server cannot read,
 * so every server component would see an anonymous request while the client thought it was
 * signed in, which presents as an endless bounce back to the login page.
 */
export async function signInWithMicrosoft(): Promise<
  { ok: true; credential: UserCredential } | { ok: false; error: string }
> {
  try {
    const provider = new OAuthProvider("microsoft.com");

    // The tenant, so this is a Link Consulting sign-in rather than any Microsoft account.
    // Without it the provider accepts personal accounts, which would then be refused later by
    // the domain allowlist, after the user had already consented.
    provider.setCustomParameters({
      tenant: process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ?? "organizations",
    });

    const credential = await signInWithPopup(gcipAuth(), provider);
    const idToken = await credential.user.getIdToken();

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      // The session was refused, most likely by the domain allowlist. Sign the client out too,
      // or it keeps a token the server will not honour and the UI disagrees with itself.
      await gcipAuth().signOut();
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: data?.error ?? "Sign-in was refused." };
    }

    return { ok: true, credential };
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      return { ok: false, error: "" }; // Deliberate cancellation: not worth an error message.
    }
    if (code === "auth/popup-blocked") {
      return { ok: false, error: "The sign-in popup was blocked. Allow popups and try again." };
    }
    return { ok: false, error: (error as Error)?.message ?? "Sign-in failed." };
  }
}

/** Sign out of both halves: the client SDK's token and the server's cookie. */
export async function signOutEverywhere(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  await gcipAuth().signOut();
}

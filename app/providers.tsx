"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client-side providers mounted in the root layout. Hosts the Auth.js
 * <SessionProvider> so client components (e.g. lib/auth/hooks.ts useAuth) can
 * read the session. (docs/MIGRATION-GCP.md Phase 2)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

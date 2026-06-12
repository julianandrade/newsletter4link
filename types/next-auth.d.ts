import type { DefaultSession } from "next-auth";

/**
 * Module augmentation for Auth.js (next-auth v5).
 *
 * - `Session.user.id` exposes the stable Entra `oid` (or the e2e credentials
 *   user id), set in the `session` callback (auth.ts).
 * - `Profile.oid` is the Microsoft Entra ID object id claim, read in the `jwt`
 *   callback for the Supabase->Entra remap.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface Profile {
    oid?: string;
    preferred_username?: string;
  }
}

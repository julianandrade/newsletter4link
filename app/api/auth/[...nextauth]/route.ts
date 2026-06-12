// Auth.js (next-auth v5) catch-all route. Backs sign-in/callback/session/csrf
// for both the Microsoft Entra ID provider and the E2E-only credentials
// provider. See auth.ts. (docs/MIGRATION-GCP.md Phase 2)
import { handlers } from "@/auth";

export const { GET, POST } = handlers;

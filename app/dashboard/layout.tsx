import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthContext } from "@/lib/auth/context";
import { getCurrentIdentity } from "@/lib/auth/identity";
import { isSuperAdmin } from "@/lib/auth/superadmin";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * Through the identity seam, not `supabase.auth.getUser()` directly.
   *
   * This one line produced an infinite redirect the first time Identity Platform was switched
   * on. The session cookie was valid and the middleware let the request through; then this
   * asked SUPABASE who the user was, Supabase Auth was answering 402, and it redirected to
   * /login, where the middleware saw the same valid cookie and sent it straight back here.
   *
   * Nothing was logged, because neither side believed anything had failed. The seam already
   * existed and this file simply did not use it, which is the lesson worth keeping: a seam
   * only helps where it is actually the way through.
   */
  const user = await getCurrentIdentity();

  if (!user) {
    redirect("/login");
  }

  // Check if user has an organization
  const auth = await getAuthContext();

  // If no organizations, redirect to onboarding
  if (!auth || auth.organizations.length === 0) {
    redirect("/onboarding");
  }

  /**
   * Resolved here, on the server, because `SUPERADMIN_EMAILS` is server-only: making it
   * readable in the browser would publish the list of platform administrators. Only the
   * boolean crosses, and it controls a nav link rather than access, which is gated
   * independently in the platform layout and every platform route.
   */
  return (
    <DashboardShell user={user} isSuperAdmin={isSuperAdmin(user.email)}>
      {children}
    </DashboardShell>
  );
}

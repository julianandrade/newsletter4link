import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthContext } from "@/lib/auth/context";
import { isSuperAdmin } from "@/lib/auth/superadmin";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
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

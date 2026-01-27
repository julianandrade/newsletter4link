import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthContext } from "@/lib/auth/context";

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

  return <DashboardShell user={user}>{children}</DashboardShell>;
}

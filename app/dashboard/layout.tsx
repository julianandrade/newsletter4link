import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthContext } from "@/lib/auth/context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  // If no organizations, redirect to onboarding
  if (auth.organizations.length === 0) {
    redirect("/onboarding");
  }

  return <DashboardShell userEmail={auth.email}>{children}</DashboardShell>;
}

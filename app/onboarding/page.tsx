import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { getCurrentIdentity } from "@/lib/auth/identity";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  // Through the seam. Asking Supabase directly here is what made the dashboard loop between
  // itself and /login once Identity Platform was switched on.
  const user = await getCurrentIdentity();

  if (!user) {
    redirect("/login");
  }

  // Check if user already has organizations
  const auth = await getAuthContext();
  if (auth && auth.organizations.length > 0) {
    // User already has orgs, redirect to dashboard
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-radar-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Welcome to Newsletter</h1>
          <p className="text-radar-ink2 mt-2">
            Let&apos;s set up your organization to get started
          </p>
        </div>

        <OnboardingForm userEmail={user.email || ""} />
      </div>
    </div>
  );
}

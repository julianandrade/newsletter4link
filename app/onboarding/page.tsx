import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Check if user already has organizations
  const auth = await getAuthContext();
  if (auth && auth.organizations.length > 0) {
    // User already has orgs, redirect to dashboard
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Welcome to Newsletter</h1>
          <p className="text-muted-foreground mt-2">
            Let's set up your organization to get started
          </p>
        </div>

        <OnboardingForm userEmail={user.email || ""} />
      </div>
    </div>
  );
}

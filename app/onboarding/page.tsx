import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const auth = await getAuthContext();

  if (!auth) {
    redirect("/login");
  }

  // Check if user already has organizations
  if (auth.organizations.length > 0) {
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

        <OnboardingForm userEmail={auth.email || ""} />
      </div>
    </div>
  );
}

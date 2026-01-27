"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ArrowRight,
  Loader2,
  Briefcase,
  Landmark,
  Shield,
  Heart,
  ShoppingCart,
  Zap,
  Factory,
  Users,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OnboardingFormProps {
  userEmail: string;
}

const industries = [
  { value: "TECHNOLOGY", label: "Technology", icon: Briefcase },
  { value: "FINANCE", label: "Finance & Banking", icon: Landmark },
  { value: "INSURANCE", label: "Insurance", icon: Shield },
  { value: "HEALTHCARE", label: "Healthcare", icon: Heart },
  { value: "RETAIL", label: "Retail & E-commerce", icon: ShoppingCart },
  { value: "UTILITIES", label: "Utilities", icon: Zap },
  { value: "MANUFACTURING", label: "Manufacturing", icon: Factory },
  { value: "PROFESSIONAL_SERVICES", label: "Professional Services", icon: Users },
  { value: "OTHER", label: "Other", icon: HelpCircle },
];

export function OnboardingForm({ userEmail }: OnboardingFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [joiningDefault, setJoiningDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [industry, setIndustry] = useState("TECHNOLOGY");

  // Join the default organization (for existing users during migration)
  const handleJoinDefault = async () => {
    setJoiningDefault(true);
    setError(null);

    try {
      const res = await fetch("/api/organizations/join-default", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to join organization");
        setJoiningDefault(false);
        return;
      }

      // Success! Redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setJoiningDefault(false);
    }
  };

  // Generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  };

  const handleNameChange = (name: string) => {
    setOrgName(name);
    // Auto-generate slug if user hasn't manually edited it
    if (!orgSlug || orgSlug === generateSlug(orgName)) {
      setOrgSlug(generateSlug(name));
    }
  };

  const handleSubmit = async () => {
    if (!orgName.trim() || !orgSlug.trim()) {
      setError("Organization name and URL are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName.trim(),
          slug: orgSlug.trim(),
          industry,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create organization");
        setLoading(false);
        return;
      }

      // Success! Redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span className={cn(step >= 1 && "text-primary font-medium")}>1. Details</span>
          <ArrowRight className="h-3 w-3" />
          <span className={cn(step >= 2 && "text-primary font-medium")}>2. Industry</span>
        </div>
        <CardTitle>
          {step === 1 ? "Create your organization" : "Select your industry"}
        </CardTitle>
        <CardDescription>
          {step === 1
            ? "This will be the name of your newsletter workspace"
            : "This helps us customize your experience"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="orgName"
                  placeholder="My Company"
                  value={orgName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgSlug">Organization URL</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">newsletter.app/</span>
                <Input
                  id="orgSlug"
                  placeholder="my-company"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers, and hyphens
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-3 gap-2">
            {industries.map((ind) => {
              const Icon = ind.icon;
              const isSelected = industry === ind.value;

              return (
                <button
                  key={ind.value}
                  type="button"
                  onClick={() => setIndustry(ind.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted"
                  )}
                >
                  <Icon className={cn("h-5 w-5", isSelected && "text-primary")} />
                  <span className="text-xs text-center leading-tight">{ind.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
            {error}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={loading}>
            Back
          </Button>
        ) : (
          <div />
        )}

        {step === 1 ? (
          <Button
            onClick={() => setStep(2)}
            disabled={!orgName.trim() || !orgSlug.trim()}
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Organization"
            )}
          </Button>
        )}
      </CardFooter>

      {/* Join existing organization option */}
      <div className="px-6 pb-6 pt-2 border-t">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Already have an existing account?
          </p>
          <Button
            variant="outline"
            onClick={handleJoinDefault}
            disabled={joiningDefault}
            className="w-full"
          >
            {joiningDefault ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              "Join Link Consulting Organization"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

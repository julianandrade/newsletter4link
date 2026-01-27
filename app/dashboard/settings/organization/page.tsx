"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Building2, ArrowLeft, Globe, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ApiKeysCard } from "@/components/api-keys-card";
import { hasFeature } from "@/lib/plans/features";
import { Plan } from "@prisma/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: string;
  plan: string;
  customDomain: string | null;
  createdAt: string;
}

const INDUSTRIES = [
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "FINANCE", label: "Finance & Banking" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "RETAIL", label: "Retail & E-commerce" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "PROFESSIONAL_SERVICES", label: "Professional Services" },
  { value: "OTHER", label: "Other" },
];

const PLANS = [
  { value: "FREE", label: "Free", description: "Up to 1,000 subscribers" },
  { value: "STARTER", label: "Starter", description: "Up to 5,000 subscribers" },
  { value: "PROFESSIONAL", label: "Professional", description: "Up to 25,000 subscribers" },
  { value: "ENTERPRISE", label: "Enterprise", description: "Unlimited subscribers" },
];

export default function OrganizationSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    industry: "",
  });
  const [customDomain, setCustomDomain] = useState("");
  const [isSavingDomain, setIsSavingDomain] = useState(false);
  const [domainMessage, setDomainMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchOrganization();
  }, []);

  async function fetchOrganization() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/organizations/current");
      if (!res.ok) throw new Error("Failed to fetch organization");
      const data = await res.json();
      setOrganization(data.organization);
      setFormData({
        name: data.organization.name,
        industry: data.organization.industry,
      });
      setCustomDomain(data.organization.customDomain || "");
    } catch (error) {
      console.error("Failed to fetch organization:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!organization) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save organization");
      }

      const json = await res.json();
      setOrganization(json.data);
      setSaveMessage({ type: "success", text: "Organization updated successfully" });
    } catch (error) {
      setSaveMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save",
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  async function handleSaveDomain() {
    if (!organization) return;

    setIsSavingDomain(true);
    setDomainMessage(null);

    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDomain: customDomain.trim() || null
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save domain");
      }

      const json = await res.json();
      setOrganization({ ...organization, customDomain: json.data.customDomain });
      setDomainMessage({ type: "success", text: "Custom domain saved successfully" });
    } catch (error) {
      setDomainMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save",
      });
    } finally {
      setIsSavingDomain(false);
      setTimeout(() => setDomainMessage(null), 3000);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Organization Settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const currentPlan = PLANS.find((p) => p.value === organization?.plan);

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Organization Settings" />

      <div className="flex-1 p-6 space-y-6">
        {/* Back Link */}
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Settings
        </Link>

        {/* Organization Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>
                  Manage your organization information
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Your Organization"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  value={organization?.slug || ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Slug cannot be changed after creation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select
                  value={formData.industry}
                  onValueChange={(value) =>
                    setFormData({ ...formData, industry: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((industry) => (
                      <SelectItem key={industry.value} value={industry.value}>
                        {industry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Industry affects AI scoring prompts and recommended sources
                </p>
              </div>

              <div className="space-y-2">
                <Label>Created</Label>
                <Input
                  value={
                    organization?.createdAt
                      ? new Date(organization.createdAt).toLocaleDateString()
                      : ""
                  }
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            {saveMessage && (
              <p
                className={`text-sm ${
                  saveMessage.type === "success"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {saveMessage.text}
              </p>
            )}

            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Plan Information */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>
              Your subscription and feature access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">
                    {currentPlan?.label || organization?.plan}
                  </h3>
                  <Badge variant="secondary">{organization?.plan}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentPlan?.description}
                </p>
              </div>
              <Button variant="outline" disabled>
                Upgrade Plan
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.value}
                  className={`p-3 rounded-lg border text-center ${
                    plan.value === organization?.plan
                      ? "border-primary bg-primary/5"
                      : "opacity-50"
                  }`}
                >
                  <div className="font-medium">{plan.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.description}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Custom Domain - Enterprise only */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Custom Domain
                  {organization?.plan !== "ENTERPRISE" && (
                    <Badge variant="outline" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      Enterprise
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Use your own domain for newsletter links and landing pages
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {organization?.plan === "ENTERPRISE" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="customDomain">Domain</Label>
                  <div className="flex gap-2">
                    <Input
                      id="customDomain"
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="newsletter.yourcompany.com"
                    />
                    <Button
                      onClick={handleSaveDomain}
                      disabled={isSavingDomain}
                    >
                      {isSavingDomain && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>

                {organization.customDomain && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      Your custom domain <strong>{organization.customDomain}</strong> is configured.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    DNS Setup Instructions
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Add the following DNS record to your domain:
                  </p>
                  <div className="bg-muted rounded p-3 font-mono text-sm">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-muted-foreground">Type</span>
                        <div>CNAME</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Name</span>
                        <div>newsletter (or @)</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Value</span>
                        <div>newsletter4link.vercel.app</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    DNS changes may take up to 48 hours to propagate.
                  </p>
                </div>

                {domainMessage && (
                  <p
                    className={`text-sm ${
                      domainMessage.type === "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {domainMessage.text}
                  </p>
                )}
              </>
            ) : (
              <div className="text-center py-6 space-y-3">
                <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="font-medium">Enterprise Feature</p>
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Enterprise to use your own custom domain for newsletters.
                  </p>
                </div>
                <Button variant="outline" disabled>
                  Upgrade to Enterprise
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Keys */}
        <ApiKeysCard
          plan={organization?.plan || "FREE"}
          hasAccess={hasFeature((organization?.plan || "FREE") as Plan, "apiAccess")}
        />

        {/* Organization ID */}
        <Card>
          <CardHeader>
            <CardTitle>Organization ID</CardTitle>
            <CardDescription>
              Use this ID for API integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block p-3 bg-muted rounded-lg text-sm font-mono">
              {organization?.id}
            </code>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

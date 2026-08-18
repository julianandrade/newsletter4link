"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import {
  Callout,
  RadarField,
  RadarInput,
  RadarPanel,
  RadarSelect,
  SkeletonRows,
} from "@/components/radar/controls";
import { ApiKeysCard } from "@/components/api-keys-card";
import { hasFeature } from "@/lib/plans/features";
import { Plan } from "@prisma/client";
import { cn } from "@/lib/utils";

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
  { value: "FINANCE", label: "Finance and banking" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "RETAIL", label: "Retail and e-commerce" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "PROFESSIONAL_SERVICES", label: "Professional services" },
  { value: "OTHER", label: "Other" },
];

const PLANS = [
  { value: "FREE", label: "Free", description: "up to 1,000 subscribers" },
  { value: "STARTER", label: "Starter", description: "up to 5,000 subscribers" },
  {
    value: "PROFESSIONAL",
    label: "Professional",
    description: "up to 25,000 subscribers",
  },
  { value: "ENTERPRISE", label: "Enterprise", description: "no subscriber cap" },
];

export default function OrganizationSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({ name: "", industry: "" });
  const [customDomain, setCustomDomain] = useState("");
  const [isSavingDomain, setIsSavingDomain] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

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
      toast.error("Could not load the organization");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!organization || isSaving) return;

    setIsSaving(true);

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
      toast.success("Organization updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the organization"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDomain() {
    if (!organization || isSavingDomain) return;

    setIsSavingDomain(true);

    try {
      const res = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customDomain: customDomain.trim() || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save domain");
      }

      const json = await res.json();
      setOrganization({ ...organization, customDomain: json.data.customDomain });
      toast.success(
        json.data.customDomain ? "Domain saved" : "Custom domain removed"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the domain"
      );
    } finally {
      setIsSavingDomain(false);
    }
  }

  const copyId = () => {
    if (!organization) return;
    navigator.clipboard.writeText(organization.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const currentPlan = PLANS.find((p) => p.value === organization?.plan);
  const isEnterprise = organization?.plan === "ENTERPRISE";
  const isDirty =
    organization !== null &&
    (formData.name !== organization.name ||
      formData.industry !== organization.industry);

  if (isLoading) {
    return (
      <>
        <AppHeader />
        <RadarMain width="form">
          <PageHeading eyebrow="Settings · organization" title="Organization" />
          <SkeletonRows rows={4} />
        </RadarMain>
      </>
    );
  }

  return (
    <>
      <AppHeader />

      <RadarMain width="form">
        <PageHeading
          eyebrow="Settings · organization"
          title={organization?.name || "Organization"}
          subtitle={
            <>
              On the <strong>{currentPlan?.label || organization?.plan}</strong> plan,{" "}
              {currentPlan?.description}. Created{" "}
              {organization?.createdAt
                ? new Date(organization.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "recently"}
              .
            </>
          }
          actions={
            <Link href="/dashboard/settings" className={radarButtonClass()}>
              All settings
            </Link>
          }
        />

        <div className="flex flex-col gap-5">
          <RadarPanel
            title="Details"
            note="The industry shapes the scoring prompt and the sources we suggest."
            footer={
              <>
                <span className="text-[11.5px] text-radar-ink3">
                  {isDirty ? "Unsaved changes" : "Everything saved"}
                </span>
                <RadarButton
                  variant="accent"
                  onClick={handleSave}
                  disabled={isSaving || !isDirty || !formData.name.trim()}
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </RadarButton>
              </>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <RadarField label="Name" htmlFor="org-name" required>
                <RadarInput
                  id="org-name"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  placeholder="Link Consulting"
                />
              </RadarField>

              <RadarField
                label="URL slug"
                htmlFor="org-slug"
                hint="Fixed at creation; it appears in invite and unsubscribe links."
              >
                <RadarInput
                  id="org-slug"
                  value={organization?.slug || ""}
                  readOnly
                  disabled
                />
              </RadarField>

              <RadarField label="Industry" htmlFor="org-industry">
                <RadarSelect
                  id="org-industry"
                  value={formData.industry}
                  onChange={(event) =>
                    setFormData({ ...formData, industry: event.target.value })
                  }
                >
                  {INDUSTRIES.map((industry) => (
                    <option key={industry.value} value={industry.value}>
                      {industry.label}
                    </option>
                  ))}
                </RadarSelect>
              </RadarField>

              <RadarField
                label="Organization id"
                htmlFor="org-id"
                hint="Needed for API integrations."
              >
                <div className="flex gap-2">
                  <RadarInput
                    id="org-id"
                    value={organization?.id || ""}
                    readOnly
                    className="font-num text-[12px]"
                  />
                  <RadarButton onClick={copyId}>
                    {copiedId ? "Copied" : "Copy"}
                  </RadarButton>
                </div>
              </RadarField>
            </div>
          </RadarPanel>

          <RadarPanel
            title="Plan"
            note="Plans change what the engine will do, not just how many people it will send to."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => {
                const active = plan.value === organization?.plan;

                return (
                  <div
                    key={plan.value}
                    className={cn(
                      "rounded-lg border px-3.5 py-3",
                      active
                        ? "border-radar-accent bg-radar-surface2"
                        : "border-radar-line2"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[12.5px] font-semibold",
                          active ? "text-radar-ink" : "text-radar-ink2"
                        )}
                      >
                        {plan.label}
                      </span>
                      {active && <StatusChip tone="ok">Current</StatusChip>}
                    </div>
                    <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3">
                      {plan.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 mb-0 text-[12px] text-radar-ink3">
              Plan changes are handled by your account contact rather than in the
              app.
            </p>
          </RadarPanel>

          <RadarPanel
            title="Sending domain"
            note={
              isEnterprise
                ? "Links in the newsletter and the unsubscribe page use this domain instead of ours."
                : "Available on the Enterprise plan."
            }
            actions={
              !isEnterprise ? (
                <StatusChip tone="neutral">Enterprise</StatusChip>
              ) : undefined
            }
          >
            {isEnterprise ? (
              <div className="flex flex-col gap-4">
                <RadarField
                  label="Domain"
                  htmlFor="org-domain"
                  hint="Leave it empty to go back to the default domain."
                >
                  <div className="flex gap-2">
                    <RadarInput
                      id="org-domain"
                      value={customDomain}
                      onChange={(event) => setCustomDomain(event.target.value)}
                      placeholder="newsletter.yourcompany.com"
                    />
                    <RadarButton
                      variant="accent"
                      onClick={handleSaveDomain}
                      disabled={isSavingDomain}
                    >
                      {isSavingDomain ? "Saving…" : "Save"}
                    </RadarButton>
                  </div>
                </RadarField>

                {organization?.customDomain && (
                  <Callout tone="ok" title="Domain configured">
                    Links now point at{" "}
                    <strong>{organization.customDomain}</strong>.
                  </Callout>
                )}

                <div className="rounded-lg border border-radar-line2 bg-radar-surface2 p-3.5">
                  <SectionLabel className="mb-2.5">DNS record to add</SectionLabel>
                  <dl className="font-num m-0 grid grid-cols-3 gap-4 text-[12px]">
                    {[
                      ["Type", "CNAME"],
                      ["Name", "newsletter"],
                      ["Value", "ghs.googlehosted.com"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-radar-ink3">
                          {label}
                        </dt>
                        <dd className="m-0 mt-0.5 truncate text-radar-ink">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2.5 mb-0 text-[11px] text-radar-ink3">
                    DNS can take up to <Num>48</Num> hours to propagate.
                  </p>
                </div>
              </div>
            ) : (
              <p className="m-0 text-[12.5px] text-radar-ink2 text-pretty">
                On Enterprise, newsletter links and the unsubscribe page can run on
                your own domain, which improves deliverability and keeps the branding
                consistent. Speak to your account contact to enable it.
              </p>
            )}
          </RadarPanel>

          <ApiKeysCard
            plan={organization?.plan || "FREE"}
            hasAccess={hasFeature(
              (organization?.plan || "FREE") as Plan,
              "apiAccess"
            )}
          />
        </div>
      </RadarMain>
    </>
  );
}

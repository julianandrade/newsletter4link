"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  StatusChip,
} from "@/components/radar/primitives";
import { SkeletonRows } from "@/components/radar/controls";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "linkroad-dark", name: "Linkroad Dark", swatches: ["#0e1517", "#2d4449", "#397b94", "#ff7901"] },
  { id: "linkroad-slate", name: "Linkroad Slate", swatches: ["#2c3335", "#2d4449", "#397b94", "#ff7901"] },
  { id: "linkroad-ocean", name: "Linkroad Ocean", swatches: ["#2d4449", "#406369", "#397b94", "#ff7901"] },
  { id: "linkroad-ember", name: "Linkroad Ember", swatches: ["#0e1517", "#2c3335", "#397b94", "#ff7901"] },
  { id: "linkroad-print", name: "Linkroad Print", swatches: ["#0b1214", "#1f2a2d", "#397b94", "#ff7901"] },
  { id: "linkroad-print-graphite", name: "Print Graphite", swatches: ["#10181a", "#2a3537", "#397b94", "#ff7901"] },
  { id: "linkroad-print-carbon", name: "Print Carbon", swatches: ["#0d1416", "#1a2426", "#397b94", "#ff7901"] },
  { id: "linkroad-light", name: "Linkroad Light", swatches: ["#fcfcfc", "#f2f5f6", "#397b94", "#ff7901"] },
  { id: "linkroad-light-sand", name: "Light Sand", swatches: ["#f8f6f2", "#efeae2", "#397b94", "#ff7901"] },
  { id: "linkroad-light-mist", name: "Light Mist", swatches: ["#f4f7f8", "#e7eef0", "#397b94", "#ff7901"] },
  { id: "linkroad-light-azure", name: "Light Azure", swatches: ["#f2f8fb", "#e3f0f6", "#397b94", "#ff7901"] },
  { id: "linkroad-light-citrus", name: "Light Citrus", swatches: ["#fff8f1", "#f7ede2", "#397b94", "#ff7901"] },
  { id: "linkroad-mix-slate", name: "Mix Slate", swatches: ["#0e1517", "#2d4449", "#397b94", "#ff7901"] },
  { id: "linkroad-mix-ocean", name: "Mix Ocean", swatches: ["#0e1517", "#397b94", "#2d4449", "#ff7901"] },
  { id: "linkroad-mix-ember", name: "Mix Ember", swatches: ["#0e1517", "#ff7901", "#2c3335", "#397b94"] },
  { id: "linkroad-mix-sand", name: "Mix Sand", swatches: ["#f4f7f8", "#2d4449", "#397b94", "#ff7901"] },
];

export default function ThemeSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [orgTheme, setOrgTheme] = useState<string>("linkroad-dark");
  const [role, setRole] = useState<string>("VIEWER");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/theme")
      .then((res) => res.json())
      .then((data) => {
        setOrgTheme(data.orgTheme || "linkroad-dark");
        setRole(data.role || "VIEWER");
      })
      .finally(() => setLoading(false));
  }, []);

  const canSetOrgTheme = role === "ADMIN" || role === "OWNER";

  const handleSetUserTheme = async (value: string) => {
    setTheme(value);
    setSaving(value);
    try {
      await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", theme: value }),
      });
    } catch {
      toast.error("The theme changed here, but it could not be remembered");
    } finally {
      setSaving(null);
    }
  };

  const handleSetOrgTheme = async (value: string) => {
    setSaving(value);
    try {
      const res = await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "org", theme: value }),
      });
      if (!res.ok) throw new Error();
      setOrgTheme(value);
      toast.success("Everyone new to the organization starts on this theme");
    } catch {
      toast.error("Could not set the organization default");
    } finally {
      setSaving(null);
    }
  };

  const activeName = THEMES.find((item) => item.id === theme)?.name;

  return (
    <>
      <AppHeader />

      <RadarMain width="list">
        <PageHeading
          eyebrow="Settings · theme"
          title={activeName ? `You are on ${activeName}` : "Pick a theme"}
          subtitle={
            canSetOrgTheme
              ? "Your choice is yours alone. The organization default is what a new colleague sees on their first sign-in."
              : "Your choice is yours alone and does not affect anyone else. Only owners and admins can change the organization default."
          }
          actions={
            <Link href="/dashboard/settings" className={radarButtonClass()}>
              All settings
            </Link>
          }
        />

        {loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {THEMES.map((item) => {
              const isMine = theme === item.id;
              const isOrgDefault = orgTheme === item.id;

              return (
                <article
                  key={item.id}
                  className={cn(
                    "flex flex-col rounded-xl border bg-radar-surface p-4 shadow-radar transition-colors",
                    isMine
                      ? "border-radar-accent"
                      : "border-radar-line hover:border-radar-ink3"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="m-0 flex-1 text-[13.5px] font-semibold text-radar-ink">
                      {item.name}
                    </h2>
                    {isMine && <StatusChip tone="ok">Yours</StatusChip>}
                    {isOrgDefault && <StatusChip tone="info">Default</StatusChip>}
                  </div>

                  <div
                    className="mt-3 flex overflow-hidden rounded-lg border border-radar-line2"
                    role="img"
                    aria-label={`${item.name} palette`}
                  >
                    {item.swatches.map((color) => (
                      <span
                        key={color}
                        className="h-10 flex-1"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <RadarButton
                      size="sm"
                      variant={isMine ? "ghost" : "accent"}
                      onClick={() => handleSetUserTheme(item.id)}
                      disabled={saving !== null || isMine}
                    >
                      {isMine ? "In use" : "Use this"}
                    </RadarButton>
                    {canSetOrgTheme && (
                      <RadarButton
                        size="sm"
                        onClick={() => handleSetOrgTheme(item.id)}
                        disabled={saving !== null || isOrgDefault}
                      >
                        {isOrgDefault ? "Is the default" : "Make it the default"}
                      </RadarButton>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </RadarMain>
    </>
  );
}

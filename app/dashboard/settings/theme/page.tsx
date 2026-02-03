"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

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
];

export default function ThemeSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [orgTheme, setOrgTheme] = useState<string>("linkroad-dark");
  const [role, setRole] = useState<string>("VIEWER");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
      await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", theme: value }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSetOrgTheme = async (value: string) => {
    setSaving(true);
    try {
      await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "org", theme: value }),
      });
      setOrgTheme(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Theme Gallery" />
      <div className="flex-1 p-6 overflow-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Theme Preferences</CardTitle>
            <CardDescription>
              Pick your personal theme or set the organization default.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading theme settings...
              </span>
            ) : (
              <>
                <p>Organization default: <strong>{orgTheme}</strong></p>
                <p>Your theme: <strong>{theme}</strong></p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {THEMES.map((item) => (
            <Card key={item.id} className={theme === item.id ? "ring-2 ring-primary" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  {orgTheme === item.id && <Badge variant="secondary">Org default</Badge>}
                </div>
                <div className="flex gap-2 mt-2">
                  {item.swatches.map((color) => (
                    <span
                      key={color}
                      className="h-6 w-6 rounded-full border"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSetUserTheme(item.id)}
                  disabled={saving}
                >
                  Use this theme
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSetOrgTheme(item.id)}
                  disabled={!canSetOrgTheme || saving}
                >
                  Set org default
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

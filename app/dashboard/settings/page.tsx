"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Image, ChevronRight, Building2 } from "lucide-react";
import { UsageCard } from "@/components/usage-card";
import Link from "next/link";

interface Settings {
  relevanceThreshold: number;
  maxArticlesPerEdition: number;
  vectorSimilarityThreshold: number;
  articleMaxAgeDays: number;
  aiModel: string;
  embeddingModel: string;
  brandVoicePrompt: string | null;
}

const AI_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Fast)" },
];

const EMBEDDING_MODELS = [
  { value: "text-embedding-ada-002", label: "Ada 002 (Recommended)" },
  { value: "text-embedding-3-small", label: "Embedding 3 Small" },
  { value: "text-embedding-3-large", label: "Embedding 3 Large" },
];

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save settings");
      }

      const updated = await response.json();
      setSettings(updated);
      setSaveMessage({ type: "success", text: "Settings saved successfully" });
    } catch (error) {
      setSaveMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to save settings" });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Settings" />

      <div className="flex-1 p-6">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ai">AI Settings</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="usage">Usage & Plan</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Curation Settings</CardTitle>
                <CardDescription>
                  Configure how articles are curated and filtered
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="relevanceThreshold">Relevance Threshold (0-10)</Label>
                    <Input
                      id="relevanceThreshold"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={settings?.relevanceThreshold ?? 6}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, relevanceThreshold: parseFloat(e.target.value) } : prev
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum score for articles to be curated (recommended: 6.0)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxArticles">Max Articles per Edition</Label>
                    <Input
                      id="maxArticles"
                      type="number"
                      min="1"
                      max="100"
                      value={settings?.maxArticlesPerEdition ?? 10}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, maxArticlesPerEdition: parseInt(e.target.value) } : prev
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum number of articles to include in each newsletter
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="articleMaxAge">Article Max Age (days)</Label>
                    <Input
                      id="articleMaxAge"
                      type="number"
                      min="1"
                      max="365"
                      value={settings?.articleMaxAgeDays ?? 7}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, articleMaxAgeDays: parseInt(e.target.value) } : prev
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Only collect articles published within this many days
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="similarityThreshold">Similarity Threshold (0-1)</Label>
                    <Input
                      id="similarityThreshold"
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings?.vectorSimilarityThreshold ?? 0.85}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, vectorSimilarityThreshold: parseFloat(e.target.value) } : prev
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Threshold for duplicate detection (higher = stricter)
                    </p>
                  </div>
                </div>

                {saveMessage && (
                  <p className={`text-sm ${saveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {saveMessage.text}
                  </p>
                )}

                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Settings */}
          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <CardTitle>AI Configuration</CardTitle>
                <CardDescription>
                  Configure the AI models used for scoring and embeddings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="aiModel">AI Model (Claude)</Label>
                    <Select
                      value={settings?.aiModel}
                      onValueChange={(value) =>
                        setSettings((prev) => (prev ? { ...prev, aiModel: value } : prev))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select AI model" />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Model used for relevance scoring and summarization
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="embeddingModel">Embedding Model (OpenAI)</Label>
                    <Select
                      value={settings?.embeddingModel}
                      onValueChange={(value) =>
                        setSettings((prev) => (prev ? { ...prev, embeddingModel: value } : prev))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select embedding model" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMBEDDING_MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Model used for generating article embeddings
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brandVoicePrompt">Brand Voice Prompt</Label>
                  <Textarea
                    id="brandVoicePrompt"
                    rows={5}
                    maxLength={500}
                    value={settings?.brandVoicePrompt ?? ""}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, brandVoicePrompt: e.target.value || null } : prev
                      )
                    }
                    placeholder='Ex: "We focus on digital transformation for the financial sector. Professional but accessible tone. We value articles about practical AI applications, especially in compliance and automation. Avoid hype, focus on concrete results."'
                  />
                  <p className="text-xs text-muted-foreground">
                    Define your brand&apos;s voice and focus areas. This influences how the AI scores,
                    summarizes, and categorizes articles during curation. Max 500 characters.
                  </p>
                </div>

                {saveMessage && (
                  <p className={`text-sm ${saveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                    {saveMessage.text}
                  </p>
                )}

                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Settings */}
          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>Branding</CardTitle>
                <CardDescription>
                  Customize the appearance of your newsletters with logos and banners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/dashboard/settings/branding"
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Image className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Logo & Banner Settings</h3>
                      <p className="text-sm text-muted-foreground">
                        Upload and manage your newsletter branding images
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Usage & Plan */}
          <TabsContent value="usage" className="space-y-6">
            <UsageCard />

            <Card>
              <CardHeader>
                <CardTitle>Organization</CardTitle>
                <CardDescription>
                  Manage your organization settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/dashboard/settings/organization"
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Organization Settings</h3>
                      <p className="text-sm text-muted-foreground">
                        View and update organization details, industry, and plan
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

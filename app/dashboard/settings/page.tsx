"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";

interface Settings {
  relevanceThreshold: number;
  maxArticlesPerEdition: number;
  vectorSimilarityThreshold: number;
  articleMaxAgeDays: number;
  aiModel: string;
  embeddingModel: string;
}

interface RSSSource {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
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
  const [rssSources, setRssSources] = useState<RSSSource[]>([]);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // RSS Source dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<RSSSource | null>(null);
  const [sourceForm, setSourceForm] = useState({ name: "", url: "", category: "" });

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/rss-sources").then((r) => r.json()),
    ])
      .then(([settingsData, sourcesData]) => {
        setSettings(settingsData);
        setRssSources(sourcesData);
      })
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

  const handleToggleSource = async (source: RSSSource) => {
    try {
      const response = await fetch(`/api/rss-sources/${source.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !source.active }),
      });

      if (!response.ok) throw new Error("Failed to update source");

      setRssSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, active: !s.active } : s))
      );
    } catch (error) {
      console.error("Error toggling source:", error);
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!confirm("Are you sure you want to delete this RSS source?")) return;

    try {
      const response = await fetch(`/api/rss-sources/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete source");

      setRssSources((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Error deleting source:", error);
    }
  };

  const handleOpenDialog = (source?: RSSSource) => {
    if (source) {
      setEditingSource(source);
      setSourceForm({ name: source.name, url: source.url, category: source.category });
    } else {
      setEditingSource(null);
      setSourceForm({ name: "", url: "", category: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSaveSource = async () => {
    try {
      const method = editingSource ? "PUT" : "POST";
      const url = editingSource ? `/api/rss-sources/${editingSource.id}` : "/api/rss-sources";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceForm),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save source");
      }

      const saved = await response.json();

      if (editingSource) {
        setRssSources((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      } else {
        setRssSources((prev) => [saved, ...prev]);
      }

      setIsDialogOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save source");
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
            <TabsTrigger value="rss">RSS Feeds</TabsTrigger>
            <TabsTrigger value="ai">AI Settings</TabsTrigger>
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

          {/* RSS Feeds */}
          <TabsContent value="rss">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>RSS Sources</CardTitle>
                  <CardDescription>Manage RSS feeds for article curation</CardDescription>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Source
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingSource ? "Edit RSS Source" : "Add RSS Source"}</DialogTitle>
                      <DialogDescription>
                        {editingSource ? "Update the RSS feed details" : "Add a new RSS feed to curate articles from"}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="source-name">Name</Label>
                        <Input
                          id="source-name"
                          value={sourceForm.name}
                          onChange={(e) => setSourceForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="TechCrunch AI"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="source-url">URL</Label>
                        <Input
                          id="source-url"
                          type="url"
                          value={sourceForm.url}
                          onChange={(e) => setSourceForm((prev) => ({ ...prev, url: e.target.value }))}
                          placeholder="https://example.com/feed.xml"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="source-category">Category</Label>
                        <Input
                          id="source-category"
                          value={sourceForm.category}
                          onChange={(e) => setSourceForm((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder="AI News"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveSource}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {rssSources.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No RSS sources configured. Add one to get started.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {rssSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{source.name}</h3>
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">
                              {source.category}
                            </span>
                          </div>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground hover:underline flex items-center gap-1"
                          >
                            {source.url.substring(0, 50)}...
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {source.lastError && (
                            <p className="text-xs text-red-500 mt-1">{source.lastError}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <Switch
                            checked={source.active}
                            onCheckedChange={() => handleToggleSource(source)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(source)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSource(source.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
        </Tabs>
      </div>
    </div>
  );
}

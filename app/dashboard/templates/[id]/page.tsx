"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Save, ArrowLeft, Eye, CheckCircle, Info, Code, Copy, Check, X } from "lucide-react";
import Link from "next/link";
import type { EditorRef, EmailEditorProps } from "react-email-editor";

// Dynamically import the email editor to avoid SSR issues
const EmailEditor = dynamic(() => import("react-email-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] bg-muted rounded-lg">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

// Unlayer options
const editorOptions: EmailEditorProps["options"] = {
  features: {
    textEditor: {
      spellChecker: true,
    },
  },
  mergeTags: {
    articles: {
      name: "Articles",
      value: "{{articles}}",
      sample: "[Articles will be inserted here]",
    },
    projects: {
      name: "Projects",
      value: "{{projects}}",
      sample: "[Projects will be inserted here]",
    },
    week: {
      name: "Week Number",
      value: "{{week}}",
      sample: "1",
    },
    year: {
      name: "Year",
      value: "{{year}}",
      sample: "2026",
    },
    unsubscribe_url: {
      name: "Unsubscribe URL",
      value: "{{unsubscribe_url}}",
      sample: "https://example.com/unsubscribe",
    },
  },
};

// Merge tags documentation for the info panel
const mergeTagsDocs = [
  {
    tag: "{{articles}}",
    name: "Articles",
    description: "Renders the curated articles section with titles, summaries, categories, and links",
  },
  {
    tag: "{{projects}}",
    name: "Projects",
    description: "Renders featured internal projects with images, descriptions, team info, and impact statements",
  },
  {
    tag: "{{week}}",
    name: "Week Number",
    description: "Current ISO week number (1-52)",
  },
  {
    tag: "{{year}}",
    name: "Year",
    description: "Current year (e.g., 2026)",
  },
  {
    tag: "{{unsubscribe_url}}",
    name: "Unsubscribe URL",
    description: "Personalized unsubscribe link for each subscriber",
  },
];

// Sample project data for preview
const sampleProjects = [
  {
    id: "sample-1",
    name: "AI Document Analyzer",
    description: "An intelligent document processing system that extracts key information from PDFs and images using advanced OCR and NLP techniques.",
    team: "Innovation Lab",
    impact: "Reduced document processing time by 85%",
    imageUrl: "https://placehold.co/560x200/e0f2fe/0369a1?text=AI+Document+Analyzer",
    projectDate: new Date().toISOString(),
  },
  {
    id: "sample-2",
    name: "Smart Meeting Assistant",
    description: "Real-time meeting transcription and summarization tool that generates action items and follow-up tasks automatically.",
    team: "Productivity Tools",
    impact: "Saves 2 hours per employee weekly",
    imageUrl: null,
    projectDate: new Date().toISOString(),
  },
];

interface Template {
  id: string;
  name: string;
  description: string | null;
  designJson: unknown;
  html: string;
  isActive: boolean;
}

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const emailEditorRef = useRef<EditorRef | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [designLoaded, setDesignLoaded] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    if (!templateId) return;

    fetch(`/api/templates/${templateId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setTemplate(data);
          setName(data.name);
          setDescription(data.description || "");
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [templateId]);

  // Load design when editor is ready and template is loaded
  useEffect(() => {
    if (isEditorReady && template?.designJson && !designLoaded && emailEditorRef.current?.editor) {
      // Cast to any since Prisma Json type is unknown but we know it's a valid design
      emailEditorRef.current.editor.loadDesign(template.designJson as any);
      setDesignLoaded(true);
    }
  }, [isEditorReady, template, designLoaded]);

  const handleEditorReady: EmailEditorProps["onReady"] = useCallback((unlayer: any) => {
    emailEditorRef.current = { editor: unlayer } as EditorRef;
    setIsEditorReady(true);
  }, []);

  const copyTag = useCallback((tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  }, []);

  const handlePreview = useCallback(() => {
    setIsLoadingPreview(true);

    // Determine which HTML to use: editor export or stored template
    const processHtml = (html: string) => {
      // Sample articles for preview
      const sampleArticles = [
        {
          id: "sample-art-1",
          title: "OpenAI Releases GPT-5 with Revolutionary Reasoning",
          summary: "The latest model shows unprecedented ability in complex problem-solving and multi-step reasoning tasks.",
          sourceUrl: "https://example.com/article-1",
          category: ["AI Models", "Research"],
          relevanceScore: 9.5,
        },
        {
          id: "sample-art-2",
          title: "Enterprise AI Adoption Reaches New Heights in 2026",
          summary: "Survey shows 78% of Fortune 500 companies now use AI in core business processes.",
          sourceUrl: "https://example.com/article-2",
          category: ["Industry", "Enterprise"],
          relevanceScore: 8.8,
        },
      ];

      // Render articles HTML
      const articlesHtml = sampleArticles
        .map(
          (article) => `
          <div style="margin-bottom: 24px; padding: 16px; background-color: #f9fafb; border-radius: 8px;">
            <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">
              <a href="${article.sourceUrl}" style="color: #2563eb; text-decoration: none;">${article.title}</a>
            </h3>
            <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px;">${article.summary}</p>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${article.category
                .map(
                  (cat) =>
                    `<span style="display: inline-block; padding: 2px 8px; background-color: #e5e7eb; border-radius: 4px; font-size: 12px; color: #374151;">${cat}</span>`
                )
                .join("")}
            </div>
          </div>
        `
        )
        .join("");

      // Render projects HTML with images
      const projectsHtml = sampleProjects
        .map(
          (project) => `
          <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
            ${project.imageUrl ? `<img src="${project.imageUrl}" alt="${project.name}" style="width: 100%; max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 12px; display: block;" />` : ""}
            <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #111827;">${project.name}</h3>
            <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px;">${project.description}</p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">Team: ${project.team}</p>
            ${project.impact ? `<p style="margin: 8px 0 0 0; font-style: italic; color: #059669; font-size: 14px;">"${project.impact}"</p>` : ""}
          </div>
        `
        )
        .join("");

      // Get current week and year
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      const year = now.getFullYear();

      // Replace merge tags
      let rendered = html;
      rendered = rendered.replace(/\{\{articles\}\}/g, articlesHtml);
      rendered = rendered.replace(/\{\{projects\}\}/g, projectsHtml);
      rendered = rendered.replace(/\{\{week\}\}/g, String(week));
      rendered = rendered.replace(/\{\{year\}\}/g, String(year));
      rendered = rendered.replace(/\{\{unsubscribe_url\}\}/g, "#unsubscribe-preview");

      setPreviewHtml(rendered);
      setShowPreview(true);
      setIsLoadingPreview(false);
    };

    // If template has no designJson (HTML-only template), use stored HTML
    // Otherwise, export from the Unlayer editor
    if (!template?.designJson && template?.html) {
      processHtml(template.html);
    } else if (emailEditorRef.current?.editor) {
      emailEditorRef.current.editor.exportHtml((data) => {
        processHtml(data.html);
      });
    } else {
      setIsLoadingPreview(false);
    }
  }, [template]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (!emailEditorRef.current?.editor) {
      toast.error("Editor is not ready");
      return;
    }

    setIsSaving(true);

    try {
      // Export HTML and design from editor
      emailEditorRef.current.editor.exportHtml(async (data) => {
        const { design, html } = data;

        try {
          const response = await fetch(`/api/templates/${templateId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
              designJson: design,
              html,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to save template");
          }

          // Refresh template data
          const updated = await response.json();
          setTemplate(updated);
          toast.success("Template saved successfully!");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to save template");
        } finally {
          setIsSaving(false);
        }
      });
    } catch {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Edit Template" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Edit Template" />
        <div className="flex-1 p-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground">Template not found.</p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/dashboard/templates">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Templates
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Edit Template" />

      <div className="flex-1 p-6 space-y-6">
        {/* Back Button */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href="/dashboard/templates">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Templates
            </Link>
          </Button>
          {template.isActive && (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active Template
            </Badge>
          )}
        </div>

        {/* Template Info */}
        <Card>
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
            <CardDescription>Name and describe your template</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekly Newsletter"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Main template for weekly AI newsletter"
                  rows={1}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Merge Tags Reference */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Available Merge Tags</CardTitle>
            </div>
            <CardDescription>
              Click any tag to copy it. Insert these in your template to add dynamic content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mergeTagsDocs.map((item) => (
                  <div
                    key={item.tag}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded border">
                          {item.tag}
                        </code>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyTag(item.tag)}
                            >
                              {copiedTag === item.tag ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {copiedTag === item.tag ? "Copied!" : "Copy tag"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>

        {/* Editor or HTML Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                {template?.designJson ? "Design Your Template" : "Template Preview"}
              </CardTitle>
              <CardDescription>
                {template?.designJson
                  ? "Use the drag-and-drop editor. Use merge tags for dynamic content."
                  : "This is an HTML-only template. You can preview it with sample data below."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={isLoadingPreview || (!template?.designJson && !template?.html)}
              >
                {isLoadingPreview ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Preview with Sample Data
              </Button>
              {!!template?.designJson && (
                <Button onClick={handleSave} disabled={isSaving || !isEditorReady}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Template
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {template?.designJson ? (
              <div className="border rounded-lg overflow-hidden">
                <EmailEditor
                  ref={emailEditorRef}
                  onReady={handleEditorReady}
                  options={editorOptions}
                  minHeight="600px"
                  appearance={{
                    theme: "modern_light",
                  }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        HTML-Only Template
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        This template was created as raw HTML and cannot be edited in the visual editor.
                        Click "Preview with Sample Data" to see how it looks with content.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="border rounded-lg bg-muted/30">
                  <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
                    <Code className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">HTML Source</span>
                    <span className="text-xs text-muted-foreground">({template?.html?.length || 0} characters)</span>
                  </div>
                  <pre className="p-4 text-xs overflow-auto max-h-[400px] text-muted-foreground">
                    <code>{template?.html?.substring(0, 2000)}{(template?.html?.length || 0) > 2000 ? '\n\n... (truncated)' : ''}</code>
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Template Preview
            </DialogTitle>
            <DialogDescription>
              Preview with sample articles, projects (including images), and merge tags rendered.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-white">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Template Preview"
                className="w-full h-[600px] border-0"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No preview available
              </div>
            )}
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Sample data includes 2 articles and 2 projects (one with image, one without)
            </p>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close Preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

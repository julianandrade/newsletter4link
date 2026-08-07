"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  EmptyState,
  RadarField,
  RadarInput,
  RadarTextarea,
  SkeletonRows,
} from "@/components/radar/controls";
import type { EditorRef, EmailEditorProps } from "react-email-editor";
import { RADAR_MERGE_TAGS, unlayerMergeTagOptions } from "@/lib/email/merge-tags";

// Dynamically import the email editor to avoid SSR issues
const EmailEditor = dynamic(() => import("react-email-editor"), {
  ssr: false,
  loading: () => (
    <div className="radar-skeleton flex h-[600px] items-center justify-center rounded-xl border border-radar-line bg-radar-surface2">
      <span className="text-[12.5px] text-radar-ink3">Loading the editor…</span>
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
  // Derived from lib/email/merge-tags.ts. This object listed five tags by hand while the sender
  // understood sixteen, so the palette offered a fraction of the vocabulary and the copy panel
  // below offered a different fraction again.
  mergeTags: unlayerMergeTagOptions({}),
};

// Merge tags for the copy panel, derived from the same table as the palette above.
const mergeTagsDocs = RADAR_MERGE_TAGS.map((tag) => ({
  tag: `{{${tag.name}}}`,
  name: tag.label,
  description: tag.description,
}));

// Sample project data for preview
const sampleProjects = [
  {
    id: "sample-1",
    name: "AI Document Analyzer",
    description:
      "An intelligent document processing system that extracts key information from PDFs and images using advanced OCR and NLP techniques.",
    team: "Innovation Lab",
    impact: "Reduced document processing time by 85%",
    imageUrl: "https://placehold.co/560x200/e0f2fe/0369a1?text=AI+Document+Analyzer",
    projectDate: new Date().toISOString(),
  },
  {
    id: "sample-2",
    name: "Smart Meeting Assistant",
    description:
      "Real-time meeting transcription and summarization tool that generates action items and follow-up tasks automatically.",
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
    if (
      isEditorReady &&
      template?.designJson &&
      !designLoaded &&
      emailEditorRef.current?.editor
    ) {
      // Cast to any since Prisma Json type is unknown but we know it's a valid design
      emailEditorRef.current.editor.loadDesign(template.designJson as any);
      setDesignLoaded(true);
    }
  }, [isEditorReady, template, designLoaded]);

  const handleEditorReady: EmailEditorProps["onReady"] = useCallback(
    (unlayer: any) => {
      emailEditorRef.current = { editor: unlayer } as EditorRef;
      setIsEditorReady(true);
    },
    []
  );

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
          summary:
            "The latest model shows unprecedented ability in complex problem-solving and multi-step reasoning tasks.",
          sourceUrl: "https://example.com/article-1",
          category: ["AI Models", "Research"],
          relevanceScore: 9.5,
        },
        {
          id: "sample-art-2",
          title: "Enterprise AI Adoption Reaches New Heights in 2026",
          summary:
            "Survey shows 78% of Fortune 500 companies now use AI in core business processes.",
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
          <div style="margin-bottom: 24px; padding: 16px; background-color: #f5f4f1; border: 1px solid #e5e2dc; border-radius: 8px;">
            ${project.imageUrl ? `<img src="${project.imageUrl}" alt="${project.name}" style="width: 100%; max-width: 100%; height: auto; border-radius: 6px; margin-bottom: 12px; display: block;" />` : ""}
            <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #0e1517;">${project.name}</h3>
            <p style="margin: 0 0 8px 0; color: #575757; font-size: 14px;">${project.description}</p>
            <p style="margin: 0; font-size: 12px; color: #676e71;">Team: ${project.team}</p>
            ${project.impact ? `<p style="margin: 8px 0 0 0; color: #2d4449; font-size: 14px; font-weight: 600;">${project.impact}</p>` : ""}
          </div>
        `
        )
        .join("");

      // Get current week and year
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const week = Math.ceil(
        ((now.getTime() - startOfYear.getTime()) / 86400000 +
          startOfYear.getDay() +
          1) /
          7
      );
      const year = now.getFullYear();

      // Replace merge tags
      let rendered = html;
      rendered = rendered.replace(/\{\{articles\}\}/g, articlesHtml);
      rendered = rendered.replace(/\{\{projects\}\}/g, projectsHtml);
      rendered = rendered.replace(/\{\{week\}\}/g, String(week));
      rendered = rendered.replace(/\{\{year\}\}/g, String(year));
      rendered = rendered.replace(
        /\{\{unsubscribe_url\}\}/g,
        "#unsubscribe-preview"
      );

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
      toast.error("Give the template a name first");
      return;
    }

    if (!emailEditorRef.current?.editor) {
      toast.error("The editor is still loading");
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
          toast.success("Template saved");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not save the template"
          );
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
      <>
        <AppHeader />
        <RadarMain width="1320px">
          <PageHeading eyebrow="Templates" title="Loading the template" />
          <SkeletonRows rows={4} />
        </RadarMain>
      </>
    );
  }

  if (!template) {
    return (
      <>
        <AppHeader />
        <RadarMain width="980px">
          <PageHeading eyebrow="Templates" title="That template is not here" />
          <EmptyState
            title="No template with that id"
            actions={
              <Link
                href="/dashboard/templates"
                className={radarButtonClass("accent")}
              >
                Back to templates
              </Link>
            }
          >
            It may have been deleted since this link was made.
          </EmptyState>
        </RadarMain>
      </>
    );
  }

  const isVisual = Boolean(template.designJson);

  return (
    <>
      <AppHeader />

      <RadarMain width="1320px">
        <PageHeading
          eyebrow="Templates"
          title={template.name}
          subtitle={
            isVisual
              ? "Drag the frame into shape. Merge tags mark where each edition's content lands."
              : "This one is raw HTML, so the visual editor cannot open it. You can still preview it with sample content."
          }
          actions={
            <>
              {template.isActive && <StatusChip tone="ok">In use</StatusChip>}
              <Link href="/dashboard/templates" className={radarButtonClass()}>
                All templates
              </Link>
              <RadarButton
                onClick={handlePreview}
                disabled={isLoadingPreview || (!isVisual && !template.html)}
              >
                {isLoadingPreview ? "Rendering…" : "Preview"}
              </RadarButton>
              {isVisual && (
                <RadarButton
                  variant="accent"
                  onClick={handleSave}
                  disabled={isSaving || !isEditorReady}
                >
                  {isSaving ? "Saving…" : "Save template"}
                </RadarButton>
              )}
            </>
          }
        />

        <div className="mb-5 grid gap-4 rounded-xl border border-radar-line bg-radar-surface p-4 md:grid-cols-2">
          <RadarField label="Name" htmlFor="template-name" required>
            <RadarInput
              id="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekly newsletter"
            />
          </RadarField>
          <RadarField label="Description" htmlFor="template-description">
            <RadarTextarea
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="The standard frame for the weekly AI brief"
              rows={2}
            />
          </RadarField>
        </div>

        {/* Merge tags */}
        <div className="mb-5">
          <SectionLabel className="mb-2.5">
            Merge tags, click to copy
          </SectionLabel>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {mergeTagsDocs.map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => copyTag(item.tag)}
                className="rounded-lg border border-radar-line bg-radar-surface px-3 py-2.5 text-left transition-colors hover:border-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              >
                <span className="flex items-center gap-2">
                  <code className="font-num rounded border border-radar-line2 bg-radar-surface2 px-1.5 py-0.5 text-[11px] text-radar-ink">
                    {item.tag}
                  </code>
                  <span className="text-[10.5px] text-radar-ink3">
                    {copiedTag === item.tag ? "copied" : "copy"}
                  </span>
                </span>
                <span className="mt-1.5 block text-[11.5px] leading-[1.45] text-radar-ink2 text-pretty">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isVisual ? (
          <div className="overflow-hidden rounded-xl border border-radar-line">
            <EmailEditor
              ref={emailEditorRef}
              onReady={handleEditorReady}
              options={editorOptions}
              minHeight="640px"
              appearance={{
                theme: "modern_light",
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Callout tone="warn" title="Raw HTML template">
              This template was saved as HTML rather than a drag-and-drop design, so
              it cannot be edited here. Preview it with sample content, or create a
              new visual template to replace it.
            </Callout>

            <div className="rounded-xl border border-radar-line">
              <div className="flex items-center gap-2.5 border-b border-radar-line2 bg-radar-surface2 px-4 py-2.5">
                <SectionLabel>HTML source</SectionLabel>
                <span className="text-[11px] text-radar-ink3">
                  <Num>{template.html?.length || 0}</Num> characters
                </span>
              </div>
              <pre className="font-num m-0 max-h-[400px] overflow-auto p-4 text-[11px] leading-[1.6] text-radar-ink2">
                <code>
                  {template.html?.substring(0, 2000)}
                  {(template.html?.length || 0) > 2000
                    ? "\n\n… truncated"
                    : ""}
                </code>
              </pre>
            </div>
          </div>
        )}
      </RadarMain>

      {/* Preview */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Preview with sample content</DialogTitle>
            <DialogDescription>
              Two sample stories and two projects, one with an image, with every
              merge tag resolved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-xl border border-radar-line bg-white">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="Template preview"
                className="h-[600px] w-full border-0"
                sandbox="allow-same-origin"
              />
            ) : (
              <p className="m-0 py-16 text-center text-[12.5px] text-radar-ink3">
                Nothing to preview yet.
              </p>
            )}
          </div>
          <div className="flex items-center justify-end pt-3">
            <RadarButton onClick={() => setShowPreview(false)}>Close</RadarButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

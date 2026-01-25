"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ArrowLeft } from "lucide-react";
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

export default function NewTemplatePage() {
  const router = useRouter();
  const emailEditorRef = useRef<EditorRef | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const handleEditorReady: EmailEditorProps["onReady"] = useCallback((unlayer: any) => {
    emailEditorRef.current = { editor: unlayer } as EditorRef;
    setIsEditorReady(true);
  }, []);

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
          const response = await fetch("/api/templates", {
            method: "POST",
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

          toast.success("Template created successfully!");
          router.push("/dashboard/templates");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to save template");
          setIsSaving(false);
        }
      });
    } catch {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="New Template" />

      <div className="flex-1 p-6 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" asChild>
          <Link href="/dashboard/templates">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Link>
        </Button>

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

        {/* Editor */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Design Your Template</CardTitle>
              <CardDescription>
                Use the drag-and-drop editor. Use merge tags for dynamic content.
              </CardDescription>
            </div>
            <Button onClick={handleSave} disabled={isSaving || !isEditorReady}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Template
            </Button>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

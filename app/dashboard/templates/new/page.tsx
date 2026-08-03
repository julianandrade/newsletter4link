"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  SectionLabel,
} from "@/components/radar/primitives";
import { RadarField, RadarInput, RadarTextarea } from "@/components/radar/controls";
import type { EditorRef, EmailEditorProps } from "react-email-editor";

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

const MERGE_TAGS = [
  "{{articles}}",
  "{{projects}}",
  "{{week}}",
  "{{year}}",
  "{{unsubscribe_url}}",
];

export default function NewTemplatePage() {
  const router = useRouter();
  const emailEditorRef = useRef<EditorRef | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const handleEditorReady: EmailEditorProps["onReady"] = useCallback(
    (unlayer: any) => {
      emailEditorRef.current = { editor: unlayer } as EditorRef;
      setIsEditorReady(true);
    },
    []
  );

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

          toast.success("Template created");
          router.push("/dashboard/templates");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not save the template"
          );
          setIsSaving(false);
        }
      });
    } catch {
      setIsSaving(false);
    }
  };

  return (
    <>
      <AppHeader />

      <RadarMain width="1320px">
        <PageHeading
          eyebrow="Templates"
          title="Build a template"
          subtitle="Drag the frame into shape, then drop in merge tags where the edition's content should land."
          actions={
            <>
              <Link href="/dashboard/templates" className={radarButtonClass()}>
                Cancel
              </Link>
              <RadarButton
                variant="accent"
                onClick={handleSave}
                disabled={isSaving || !isEditorReady || !name.trim()}
              >
                {isSaving ? "Saving…" : "Save template"}
              </RadarButton>
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
          <RadarField
            label="Description"
            htmlFor="template-description"
            hint="For your own reference in the template list."
          >
            <RadarTextarea
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="The standard frame for the weekly AI brief"
              rows={2}
            />
          </RadarField>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SectionLabel>Merge tags</SectionLabel>
          {MERGE_TAGS.map((tag) => (
            <code
              key={tag}
              className="font-num rounded border border-radar-line bg-radar-surface2 px-1.5 py-0.5 text-[11px] text-radar-ink2"
            >
              {tag}
            </code>
          ))}
        </div>

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
      </RadarMain>
    </>
  );
}

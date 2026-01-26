"use client";

import { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import dynamic from "next/dynamic";
import type { EditorRef, EmailEditorProps } from "react-email-editor";
import { generateMergeTagSamples, type Article, type Project } from "@/lib/email/content-renderer";

// Dynamically import react-email-editor to avoid SSR issues
const EmailEditor = dynamic(() => import("react-email-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span>Loading editor...</span>
      </div>
    </div>
  ),
});

export interface EditionUnlayerEditorProps {
  /** Initial design JSON to load */
  design?: object | null;
  /** Articles for merge tag samples */
  articles: Article[];
  /** Projects for merge tag samples */
  projects: Project[];
  /** Edition week number */
  week: number;
  /** Edition year */
  year: number;
  /** Called when editor is ready */
  onReady?: () => void;
  /** Called when design changes */
  onDesignChange?: () => void;
}

export interface EditionUnlayerEditorRef {
  /** Load a design into the editor */
  loadDesign: (design: object) => void;
  /** Export HTML and design JSON */
  exportHtml: () => Promise<{ design: object; html: string }>;
  /** Save current design without HTML */
  saveDesign: () => Promise<object>;
  /** Check if editor is ready */
  isReady: () => boolean;
}

/**
 * Unlayer-based email editor for editions
 * Provides visual email editing with merge tags for articles/projects
 */
export const EditionUnlayerEditor = forwardRef<
  EditionUnlayerEditorRef,
  EditionUnlayerEditorProps
>(function EditionUnlayerEditor(
  { design, articles, projects, week, year, onReady, onDesignChange },
  ref
) {
  const emailEditorRef = useRef<EditorRef | null>(null);
  const isEditorReady = useRef(false);
  const pendingDesign = useRef<object | null>(null);

  // Generate merge tag samples based on current content
  const mergeTagSamples = generateMergeTagSamples(articles, projects, week, year);

  // Unlayer appearance options - match template editor
  const appearance: EmailEditorProps["appearance"] = {
    theme: "modern_light",
    panels: {
      tools: {
        dock: "left",
      },
    },
  };

  // Unlayer options with dynamic merge tags
  const options: EmailEditorProps["options"] = {
    features: {
      textEditor: {
        spellChecker: true,
      },
    },
    tools: {
      text: { enabled: true },
      image: { enabled: true },
      button: { enabled: true },
      divider: { enabled: true },
      html: { enabled: true },
      heading: { enabled: true },
      menu: { enabled: true },
      social: { enabled: true },
    },
    mergeTags: {
      articles: {
        name: "Articles",
        value: "{{articles}}",
        sample: mergeTagSamples.articles,
      },
      projects: {
        name: "Projects",
        value: "{{projects}}",
        sample: mergeTagSamples.projects,
      },
      week: {
        name: "Week Number",
        value: "{{week}}",
        sample: mergeTagSamples.week,
      },
      year: {
        name: "Year",
        value: "{{year}}",
        sample: mergeTagSamples.year,
      },
      unsubscribe_url: {
        name: "Unsubscribe URL",
        value: "{{unsubscribe_url}}",
        sample: mergeTagSamples.unsubscribe_url,
      },
    },
  };

  // Load design when editor becomes ready
  const loadDesignIntoEditor = useCallback((designToLoad: object) => {
    if (emailEditorRef.current?.editor && isEditorReady.current) {
      emailEditorRef.current.editor.loadDesign(designToLoad as any);
    } else {
      // Queue for when editor is ready
      pendingDesign.current = designToLoad;
    }
  }, []);

  // Handle editor ready event
  const handleReady: EmailEditorProps["onReady"] = useCallback(
    (unlayer: any) => {
      emailEditorRef.current = { editor: unlayer } as EditorRef;
      isEditorReady.current = true;

      // Load pending design if any
      if (pendingDesign.current) {
        unlayer.loadDesign(pendingDesign.current);
        pendingDesign.current = null;
      }

      // Register design change listener
      unlayer.addEventListener("design:updated", () => {
        onDesignChange?.();
      });

      onReady?.();
    },
    [onReady, onDesignChange]
  );

  // Load initial design when provided
  useEffect(() => {
    if (design) {
      loadDesignIntoEditor(design);
    }
  }, [design, loadDesignIntoEditor]);

  // Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      loadDesign: (designToLoad: object) => {
        loadDesignIntoEditor(designToLoad);
      },

      exportHtml: (): Promise<{ design: object; html: string }> => {
        return new Promise((resolve, reject) => {
          if (!emailEditorRef.current?.editor || !isEditorReady.current) {
            reject(new Error("Editor not ready"));
            return;
          }

          emailEditorRef.current.editor.exportHtml((data) => {
            const { design: exportedDesign, html } = data;
            resolve({ design: exportedDesign, html });
          });
        });
      },

      saveDesign: (): Promise<object> => {
        return new Promise((resolve, reject) => {
          if (!emailEditorRef.current?.editor || !isEditorReady.current) {
            reject(new Error("Editor not ready"));
            return;
          }

          emailEditorRef.current.editor.saveDesign((savedDesign: any) => {
            resolve(savedDesign);
          });
        });
      },

      isReady: () => isEditorReady.current,
    }),
    [loadDesignIntoEditor]
  );

  return (
    <div className="h-full w-full">
      <EmailEditor
        ref={emailEditorRef}
        onReady={handleReady}
        appearance={appearance}
        options={options}
        minHeight="600px"
      />
    </div>
  );
});

export default EditionUnlayerEditor;

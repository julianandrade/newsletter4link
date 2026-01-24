"use client";

import { useRef, useCallback } from "react";
import EmailEditor, { EditorRef, EmailEditorProps } from "react-email-editor";

export interface TemplateEditorProps {
  onReady?: () => void;
  onDesignLoad?: () => void;
}

export interface TemplateEditorRef {
  loadDesign: (design: object) => void;
  exportHtml: () => Promise<{ design: object; html: string }>;
}

// Unlayer appearance options
const appearance: EmailEditorProps["appearance"] = {
  theme: "modern_light",
  panels: {
    tools: {
      dock: "left",
    },
  },
};

// Unlayer options
const options: EmailEditorProps["options"] = {
  features: {
    textEditor: {
      spellChecker: true,
    },
  },
  tools: {
    // Enable common tools
    text: { enabled: true },
    image: { enabled: true },
    button: { enabled: true },
    divider: { enabled: true },
    html: { enabled: true },
    heading: { enabled: true },
    menu: { enabled: true },
    social: { enabled: true },
  },
  // Merge tags for variable substitution
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

export function TemplateEditor({
  onReady,
  onDesignLoad,
}: TemplateEditorProps) {
  const emailEditorRef = useRef<EditorRef | null>(null);

  const handleReady: EmailEditorProps["onReady"] = useCallback(
    (unlayer: any) => {
      // Store reference to the editor
      emailEditorRef.current = { editor: unlayer } as EditorRef;
      onReady?.();
    },
    [onReady]
  );

  const handleLoad: EmailEditorProps["onLoad"] = useCallback(() => {
    onDesignLoad?.();
  }, [onDesignLoad]);

  return (
    <div className="h-full w-full">
      <EmailEditor
        ref={emailEditorRef}
        onReady={handleReady}
        onLoad={handleLoad}
        appearance={appearance}
        options={options}
        minHeight="600px"
      />
    </div>
  );
}

// Helper hook to control the editor
export function useTemplateEditor() {
  const editorRef = useRef<EditorRef | null>(null);

  const setEditorRef = useCallback((ref: EditorRef | null) => {
    editorRef.current = ref;
  }, []);

  const loadDesign = useCallback((design: any) => {
    if (editorRef.current?.editor) {
      editorRef.current.editor.loadDesign(design);
    }
  }, []);

  const exportHtml = useCallback((): Promise<{ design: object; html: string }> => {
    return new Promise((resolve, reject) => {
      if (!editorRef.current?.editor) {
        reject(new Error("Editor not ready"));
        return;
      }

      editorRef.current.editor.exportHtml((data) => {
        const { design, html } = data;
        resolve({ design, html });
      });
    });
  }, []);

  const saveDesign = useCallback((): Promise<object> => {
    return new Promise((resolve, reject) => {
      if (!editorRef.current?.editor) {
        reject(new Error("Editor not ready"));
        return;
      }

      editorRef.current.editor.saveDesign((design: any) => {
        resolve(design);
      });
    });
  }, []);

  return {
    editorRef,
    setEditorRef,
    loadDesign,
    exportHtml,
    saveDesign,
  };
}

"use client";

/**
 * Making a meme by hand.
 *
 * The counterpart to "Suggest memes", and the reason the feature does not depend on a model
 * at all: the same twenty-seven formats, the same renderer, an editor typing the lines.
 *
 * Two things here are load-bearing rather than decorative.
 *
 * Each field is labelled with its zone's `role` rather than "Caption 1". A format is not a
 * pair of empty boxes, and "what is being rejected" over the top field is the difference
 * between a Drake meme and two unrelated sentences stacked on a photograph.
 *
 * The alt text is required, and it is the aside's own `text`. A reader whose client blocks
 * images gets that sentence and nothing else, so a meme with no alt text arrives as an empty
 * space where the joke was.
 */

import { useCallback, useState } from "react";
import { RadarButton, SectionLabel, StatusChip } from "@/components/radar/primitives";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MEME_CAPTION } from "@/lib/memes/caption";
import { MAX_ASIDE_TEXT } from "@/lib/asides/input";
import { MEME_TEMPLATES, type MemeTemplate } from "@/lib/memes/templates";

export interface MemeMakerProps {
  /** Called with the stored image URL and the alt text, once the editor saves. */
  onSave: (draft: { imageUrl: string; text: string }) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Above this a caption still renders, because autofit always fits. It just renders small
 * enough that nobody reads it, which is why the counter turns rather than the button locking.
 */
function captionTone(length: number): "ok" | "warn" {
  return length > MAX_MEME_CAPTION ? "warn" : "ok";
}

export function MemeMaker({ onSave, onCancel }: MemeMakerProps) {
  const [template, setTemplate] = useState<MemeTemplate | null>(null);
  const [captions, setCaptions] = useState<string[]>([]);
  const [alt, setAlt] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback((chosen: MemeTemplate) => {
    setTemplate(chosen);
    setCaptions(chosen.zones.map(() => ""));
    setPreview(null);
    setError(null);
  }, []);

  const setCaption = useCallback((index: number, value: string) => {
    setCaptions((current) => current.map((caption, at) => (at === index ? value : caption)));
    // The preview belongs to the text that produced it. Leaving it up while the words change
    // is how somebody saves the version they were looking at two edits ago.
    setPreview(null);
  }, []);

  const filled = captions.every((caption) => caption.trim().length > 0);

  async function render() {
    if (!template || !filled) return;

    setRendering(true);
    setError(null);

    try {
      const response = await fetch("/api/memes/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, captions }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not render.");
      }

      setPreview(payload.dataUrl);
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Could not render.");
    } finally {
      setRendering(false);
    }
  }

  async function save() {
    if (!template || !filled || !alt.trim() || !preview) return;

    setSaving(true);
    setError(null);

    try {
      // Rendered again rather than uploading the preview's bytes: the render is
      // deterministic, so this stores exactly what is on screen, and the preview never has
      // to travel back up the wire.
      const response = await fetch("/api/memes/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, captions, store: true }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not save the image.");
      }

      await onSave({ imageUrl: payload.url, text: alt.trim() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!template) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <SectionLabel className="mb-1">Pick a format</SectionLabel>
          <p className="m-0 text-[12px] text-radar-ink2">
            {MEME_TEMPLATES.length} formats. What each one means decides what the captions
            should say, so the fields are labelled once you choose.
          </p>
        </div>

        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
          {MEME_TEMPLATES.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => choose(option)}
                title={option.format}
                className="w-full rounded-lg border border-radar-line bg-radar-surface2 p-1.5 text-left transition-colors hover:border-radar-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/meme-templates/${option.file}`}
                  alt=""
                  className="h-24 w-full rounded-md object-contain"
                />
                <span className="mt-1 block truncate text-[11px] text-radar-ink2">
                  {option.id.replace(/-/g, " ")}
                </span>
                <span className="block text-[10.5px] text-radar-ink3">
                  {option.zones.length} {option.zones.length === 1 ? "caption" : "captions"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {onCancel && (
          <div>
            <RadarButton type="button" onClick={onCancel}>
              Cancel
            </RadarButton>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel className="mb-1">{template.id.replace(/-/g, " ")}</SectionLabel>
          <p className="m-0 max-w-[60ch] text-[12px] leading-[19px] text-radar-ink2">
            {template.format}
          </p>
        </div>
        <RadarButton type="button" onClick={() => setTemplate(null)}>
          Pick another
        </RadarButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {template.zones.map((zone, index) => (
            <div key={`${zone.role}-${index}`}>
              <SectionLabel className="mb-1.5">
                {index + 1}. {zone.role}
              </SectionLabel>
              <Textarea
                value={captions[index] ?? ""}
                onChange={(event) => setCaption(index, event.target.value)}
                rows={2}
                aria-label={`Caption ${index + 1}: ${zone.role}`}
              />
              <p className="mt-1 text-right text-[11px] text-radar-ink2">
                <span
                  className={
                    captionTone((captions[index] ?? "").length) === "warn"
                      ? "font-semibold text-radar-err"
                      : ""
                  }
                >
                  {(captions[index] ?? "").length}/{MAX_MEME_CAPTION}
                </span>
              </p>
            </div>
          ))}

          <div>
            <SectionLabel className="mb-1.5">Alt text</SectionLabel>
            <Textarea
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              rows={2}
              placeholder="The same joke, in one sentence, for a reader who never sees the picture."
              aria-label="Alt text"
            />
            <p className="mt-1 flex items-center justify-between text-[11px] text-radar-ink2">
              <span>This is the aside&apos;s text, and what a blocked image falls back to.</span>
              <span className={alt.trim().length > MAX_ASIDE_TEXT ? "font-semibold text-radar-err" : ""}>
                {alt.trim().length}/{MAX_ASIDE_TEXT}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Preview</SectionLabel>
          <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-radar-line bg-radar-surface2 p-2">
            {preview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={preview}
                alt={alt.trim() || "Meme preview"}
                className="max-h-[420px] w-auto rounded-md object-contain"
              />
            ) : (
              <p className="m-0 px-4 text-center text-[12px] text-radar-ink2">
                {filled
                  ? "Render to see it."
                  : "Fill every caption, then render. Long lines are set smaller rather than cut off."}
              </p>
            )}
          </div>
          {preview && <StatusChip tone="ok">Rendered</StatusChip>}
        </div>
      </div>

      {error && (
        <p className="m-0 rounded-lg border border-radar-err bg-radar-surface px-3 py-2 text-[12.5px] text-radar-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <RadarButton type="button" onClick={render} disabled={!filled || rendering}>
          {rendering ? "Rendering..." : preview ? "Render again" : "Render"}
        </RadarButton>
        <RadarButton
          type="button"
          onClick={save}
          disabled={!preview || !alt.trim() || saving}
          title={!preview ? "Render it first" : !alt.trim() ? "Alt text is required" : undefined}
        >
          {saving ? "Saving..." : "Save to library"}
        </RadarButton>
        {onCancel && (
          <RadarButton type="button" onClick={onCancel}>
            Cancel
          </RadarButton>
        )}
      </div>
    </div>
  );
}

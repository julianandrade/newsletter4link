"use client";

/**
 * Writing or editing a closing aside.
 *
 * Two things here are load-bearing rather than decorative.
 *
 * The text is required even when there is an image, and the helper text says why: it is
 * also the alt text, and a corporate mail client that blocks images by default would
 * otherwise deliver an empty box where the joke was.
 *
 * The GIF warning is not a nicety. Outlook on Windows renders the first frame and nothing
 * else, so a meme whose punchline is in frame forty arrives as a setup with no payoff, and
 * no amount of code fixes that.
 */

import { useCallback, useEffect, useState } from "react";
import { MediaLibrary } from "@/components/media-library";
import { RadarButton, SectionLabel } from "@/components/radar/primitives";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { isAnimatedGif } from "@/lib/media/sniff";
import { MAX_ASIDE_TEXT } from "@/lib/asides/input";

export type AsideKind = "JOKE" | "NOTE" | "SPOTLIGHT";

export interface AsideDraft {
  id?: string;
  kind: AsideKind;
  text: string;
  imageUrl: string | null;
  attribution: string | null;
  language: string;
}

export interface AsideFormProps {
  initial?: Partial<AsideDraft>;
  submitLabel: string;
  onSubmit: (draft: AsideDraft) => Promise<void>;
  onCancel?: () => void;
}

const KINDS: Array<{ value: AsideKind; label: string; hint: string }> = [
  { value: "JOKE", label: "Joke", hint: "The usual case." },
  { value: "NOTE", label: "Editor's note", hint: "A signed word from you." },
  { value: "SPOTLIGHT", label: "Spotlight", hint: "Internal work worth naming." },
];

/** Warn above this. It reaches roughly 800 inboxes, many of them on mobile data. */
const LARGE_IMAGE_BYTES = 1024 * 1024;

export function AsideForm({ initial, submitLabel, onSubmit, onCancel }: AsideFormProps) {
  const [kind, setKind] = useState<AsideKind>(initial?.kind ?? "JOKE");
  const [text, setText] = useState(initial?.text ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [attribution, setAttribution] = useState(initial?.attribution ?? "");
  const [language, setLanguage] = useState(initial?.language ?? "pt-PT");

  const [imageWarnings, setImageWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The warnings are read from the chosen file itself rather than from its name.
   *
   * A fetch of a URL the picker just returned is cheap and it is the only way to know
   * whether the GIF loops. It fails softly: a warning that could not be produced is not a
   * reason to block a save.
   */
  const inspectImage = useCallback(async (url: string | null) => {
    if (!url) {
      setImageWarnings([]);
      return;
    }

    try {
      const response = await fetch(url);
      const buffer = new Uint8Array(await response.arrayBuffer());
      const warnings: string[] = [];

      if (isAnimatedGif(buffer)) {
        warnings.push(
          "Outlook on Windows shows the first frame and nothing else. Make sure the first frame carries the joke."
        );
      }

      if (buffer.byteLength > LARGE_IMAGE_BYTES) {
        const mb = (buffer.byteLength / 1024 / 1024).toFixed(1);
        warnings.push(
          `This is ${mb}MB. It reaches around 800 inboxes, many of them on mobile data.`
        );
      }

      setImageWarnings(warnings);
    } catch {
      setImageWarnings([]);
    }
  }, []);

  useEffect(() => {
    void inspectImage(imageUrl);
  }, [imageUrl, inspectImage]);

  const tooLong = text.trim().length > MAX_ASIDE_TEXT;
  const canSubmit = text.trim().length > 0 && !tooLong && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        ...(initial?.id ? { id: initial.id } : {}),
        kind,
        text: text.trim(),
        imageUrl,
        attribution: attribution.trim() || null,
        language,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel className="mb-2">Kind</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              title={option.hint}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                kind === option.value
                  ? "border-radar-accent bg-radar-accent/10 text-radar-ink"
                  : "border-radar-line text-radar-ink2 hover:text-radar-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel className="mb-2">Text</SectionLabel>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="One line. It has to work on its own."
          aria-label="Aside text"
        />
        <p className="mt-1.5 flex items-center justify-between text-[11.5px] text-radar-ink2">
          <span>
            This is also the image&apos;s alt text. Readers whose client blocks images see
            only this.
          </span>
          <span className={tooLong ? "font-semibold text-radar-err" : ""}>
            {text.trim().length}/{MAX_ASIDE_TEXT}
          </span>
        </p>
      </div>

      <div>
        <SectionLabel className="mb-2">Image, optional</SectionLabel>
        {imageUrl ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={text.trim() || "Selected image"}
              className="max-h-48 w-auto rounded-lg border border-radar-line object-contain"
            />
            <div className="flex gap-2">
              <MediaLibrary
                onSelect={setImageUrl}
                selectedUrl={imageUrl}
                trigger={<RadarButton type="button">Change image</RadarButton>}
              />
              <RadarButton type="button" onClick={() => setImageUrl(null)}>
                Remove image
              </RadarButton>
            </div>
          </div>
        ) : (
          <MediaLibrary
            onSelect={setImageUrl}
            trigger={<RadarButton type="button">Choose an image</RadarButton>}
          />
        )}

        {imageWarnings.map((warning) => (
          <p
            key={warning}
            className="mt-2 rounded-lg border border-radar-line bg-radar-surface px-3 py-2 text-[12px] text-radar-ink2"
          >
            {warning}
          </p>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <SectionLabel className="mb-2">Attribution, optional</SectionLabel>
          <Input
            value={attribution}
            onChange={(event) => setAttribution(event.target.value)}
            placeholder="Who said it"
            aria-label="Attribution"
          />
        </div>
        <div>
          <SectionLabel className="mb-2">Language</SectionLabel>
          <Input
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="pt-PT"
            aria-label="Language"
          />
          <p className="mt-1.5 text-[11.5px] text-radar-ink2">
            A translated joke is not a joke. Write another language as its own entry.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-radar-err bg-radar-surface px-3 py-2 text-[12.5px] text-radar-ink">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <RadarButton type="button" onClick={handleSubmit} disabled={!canSubmit}>
          {saving ? "Saving..." : submitLabel}
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

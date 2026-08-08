"use client";

/**
 * Choosing what an edition closes on, on the send screen.
 *
 * Choosing does not mark anything used. `lastUsedAt` and `useCount` are written when the
 * send happens, so browsing this list never reshuffles the ordering under whoever is
 * browsing it. See lib/asides/mark-used.ts.
 *
 * The free-text field writes a real row with `reusable: false` rather than taking a second
 * path into the email. One code path means "what did edition 32 send" has one answer, and
 * a one-off note never comes back in this list next week.
 */

import { useCallback, useEffect, useState } from "react";
import { RadarButton, SectionLabel, StatusChip } from "@/components/radar/primitives";
import { Textarea } from "@/components/ui/textarea";

type Kind = "JOKE" | "NOTE" | "SPOTLIGHT";

interface Aside {
  id: string;
  kind: Kind;
  text: string;
  imageUrl: string | null;
  attribution: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

export interface AsidePickerProps {
  editionId: string;
  /** What the edition currently points at, if anything. */
  selectedId: string | null;
  language?: string;
  onChange?: (asideId: string | null) => void;
  /** A sent edition cannot be changed, and this says so rather than failing on submit. */
  readOnly?: boolean;
}

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: "JOKE", label: "Joke" },
  { value: "NOTE", label: "Editor's note" },
  { value: "SPOTLIGHT", label: "Spotlight" },
];

export function AsidePicker({
  editionId,
  selectedId,
  language = "pt-PT",
  onChange,
  readOnly = false,
}: AsidePickerProps) {
  const [kind, setKind] = useState<Kind>("JOKE");
  const [options, setOptions] = useState<Aside[]>([]);
  const [chosen, setChosen] = useState<string | null>(selectedId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/asides?offerable=true&kind=${kind}&language=${encodeURIComponent(language)}`
      );
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not load the library.");
      }

      setOptions(Array.isArray(payload.data) ? payload.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load.");
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [kind, language]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setChosen(selectedId);
  }, [selectedId]);

  async function attach(asideId: string | null) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asideId }),
      });
      const payload = await response.json();

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Could not attach it.");
      }

      setChosen(asideId);
      onChange?.(asideId);
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : "Could not attach it.");
    } finally {
      setSaving(false);
    }
  }

  async function writeOne() {
    const text = freeText.trim();
    if (!text) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/asides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          kind,
          language,
          // A one-off. It goes out this week and never returns to this list.
          reusable: false,
          status: "APPROVED",
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not save it.");
      }

      setFreeText("");
      setWriting(false);
      await attach(payload.data.id);
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not save it.");
    } finally {
      setSaving(false);
    }
  }

  const selected = options.find((option) => option.id === chosen);

  return (
    <section className="rounded-xl border border-radar-line bg-radar-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>One more thing</SectionLabel>
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
                  kind === option.value
                    ? "border-radar-accent bg-radar-accent/10 text-radar-ink"
                    : "border-radar-line text-radar-ink2 hover:text-radar-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {chosen && selected ? (
        <div className="mb-4 rounded-lg border-l-[3px] border-radar-accent bg-radar-bg px-4 py-3">
          {selected.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={selected.imageUrl}
              alt={selected.text}
              className="mb-2 max-h-40 w-auto rounded object-contain"
            />
          )}
          <p className="m-0 text-[14px] leading-[22px] text-radar-ink">{selected.text}</p>
          {selected.attribution && (
            <p className="mt-1 text-[12px] text-radar-ink2">{selected.attribution}</p>
          )}
        </div>
      ) : (
        <p className="mb-4 text-[12.5px] text-radar-ink2">
          {chosen
            ? "This edition carries a closing block that is not in the list above."
            : "This edition will send without a closing block."}
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-lg border border-radar-err px-3 py-2 text-[12.5px] text-radar-ink">
          {error}
        </p>
      )}

      {!readOnly && (
        <>
          {isLoading ? (
            <p className="text-[12.5px] text-radar-ink2">Loading the library...</p>
          ) : options.length === 0 ? (
            <p className="text-[12.5px] text-radar-ink2">
              Nothing approved in this kind and language yet. Write one below, or approve
              something under One more thing.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {options.slice(0, 8).map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => attach(option.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      option.id === chosen
                        ? "border-radar-accent bg-radar-accent/5"
                        : "border-radar-line hover:border-radar-ink2"
                    }`}
                  >
                    <span className="block text-[13px] leading-[20px] text-radar-ink">
                      {option.text}
                    </span>
                    <span className="mt-1 block text-[11px] text-radar-ink2">
                      {option.lastUsedAt
                        ? `sent ${option.useCount}x`
                        : "never sent"}
                      {option.imageUrl ? " · has an image" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <RadarButton onClick={() => setWriting((open) => !open)}>
              {writing ? "Cancel" : "Write one now"}
            </RadarButton>
            {chosen && (
              <RadarButton onClick={() => attach(null)} disabled={saving}>
                Send without one
              </RadarButton>
            )}
          </div>

          {writing && (
            <div className="mt-3">
              <Textarea
                value={freeText}
                onChange={(event) => setFreeText(event.target.value)}
                rows={2}
                placeholder="One line, for this edition only."
                aria-label="Write a closing line"
              />
              <p className="mt-1.5 text-[11.5px] text-radar-ink2">
                Saved as a one-off: it goes out this week and never comes back in this
                list.
              </p>
              <RadarButton
                className="mt-2"
                onClick={writeOne}
                disabled={saving || !freeText.trim()}
              >
                {saving ? "Saving..." : "Use this"}
              </RadarButton>
            </div>
          )}
        </>
      )}

      {readOnly && (
        <StatusChip tone="warn">This edition has been sent and cannot change.</StatusChip>
      )}
    </section>
  );
}

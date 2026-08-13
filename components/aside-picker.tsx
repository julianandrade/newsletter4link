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
 *
 * The list shows a page of the library and says so. It used to show the first eight rows
 * silently, and the cut landed on the worst row available: the route orders never-used
 * first and then oldest first, so a line written today sorts last of the never-used ones.
 * The row hidden by the cap was reliably the one somebody had just created and come here to
 * attach, and with nothing on screen counting the rest it read as a row that never saved.
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
  language: string;
  lastUsedAt: string | null;
  useCount: number;
}

export interface AsidePickerProps {
  editionId: string;
  /** What the edition currently points at, if anything. */
  selectedId: string | null;
  /**
   * Narrows the offered rows to one language. Left unset by the send screen on purpose: an
   * aside goes into an edition whatever language it is written in, and defaulting this to
   * "pt-PT" is what used to make a stored English joke unofferable and unexplained.
   */
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

/**
 * How many rows the closed list shows.
 *
 * A page rather than the whole library, because this sits inside the send screen beside the
 * articles and the projects and a long list here pushes the readiness checklist off screen.
 * The count line below and the expander are what make it a page instead of a cap.
 */
const PREVIEW_ROWS = 8;

export function AsidePicker({
  editionId,
  selectedId,
  language,
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
  const [showAll, setShowAll] = useState(false);
  /** The row `chosen` points at, whether or not the library is offering it. */
  const [attached, setAttached] = useState<Aside | null>(null);
  /** The id points at nothing readable: deleted, or another organization's. */
  const [attachedMissing, setAttachedMissing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ offerable: "true", kind });
      if (language) params.set("language", language);

      const response = await fetch(`/api/asides?${params.toString()}`);
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

  /**
   * What the edition is carrying, resolved by id.
   *
   * Not by searching `options`, which is what this used to do. That list answers "what may
   * still be chosen", and three attachments are never in it: a one-off, written
   * `reusable: false` so it cannot come back next week; a line retired after an edition had
   * already picked it; and anything whose kind is not the tab, which always opens on Joke.
   * On all three the panel went blank and reported an edition carrying something it could
   * not show, which is what made a freshly written line look like a line that never saved.
   *
   * The library copy is preferred when it has one, so choosing a row from the list below
   * renders it without a request. Only the rest reach the route.
   */
  useEffect(() => {
    if (!chosen) {
      setAttached(null);
      setAttachedMissing(false);
      return;
    }

    const inLibrary = options.find((option) => option.id === chosen);
    if (inLibrary) {
      setAttached(inLibrary);
      setAttachedMissing(false);
      return;
    }

    // Already resolved: the write below hands the row over in full, so there is nothing to
    // go and read.
    if (attached?.id === chosen) return;

    let abandoned = false;

    void (async () => {
      try {
        const response = await fetch(`/api/asides/${chosen}`);
        const payload = await response.json();

        if (abandoned) return;

        if (!response.ok || !payload.success) {
          // A deleted row, or one in another organization. Not surfaced through `error`,
          // which is for actions the editor just took.
          setAttached(null);
          setAttachedMissing(true);
          return;
        }

        setAttached(payload.data);
        setAttachedMissing(false);
      } catch {
        if (!abandoned) {
          setAttached(null);
          setAttachedMissing(true);
        }
      }
    })();

    return () => {
      abandoned = true;
    };
  }, [chosen, options, attached]);

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
      // Kept, rather than re-read by id a moment later. The route just handed back the whole
      // row, and a one-off is never in the library for the effect above to find.
      setAttached(payload.data);
      setAttachedMissing(false);
      await attach(payload.data.id);
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not save it.");
    } finally {
      setSaving(false);
    }
  }

  const shown = showAll ? options : options.slice(0, PREVIEW_ROWS);
  const capped = options.length > PREVIEW_ROWS;

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

      {chosen && attached ? (
        <div className="mb-4 rounded-lg border-l-[3px] border-radar-accent bg-radar-bg px-4 py-3">
          {attached.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={attached.imageUrl}
              alt={attached.text}
              className="mb-2 max-h-40 w-auto rounded object-contain"
            />
          )}
          <p className="m-0 text-[14px] leading-[22px] text-radar-ink">{attached.text}</p>
          {attached.attribution && (
            <p className="mt-1 text-[12px] text-radar-ink2">{attached.attribution}</p>
          )}
        </div>
      ) : (
        <p className="mb-4 text-[12.5px] text-radar-ink2">
          {!chosen
            ? "This edition will send without a closing block."
            : attachedMissing
              ? /*
                  The one case left, and now it means what it says: the id points at nothing
                  readable. It used to be shown for every attachment the library did not
                  happen to be offering, which is most of them.
                */
                "The closing block this edition points at could not be loaded. It may have been deleted. Pick another below, or send without one."
              : "Loading the closing block this edition carries..."}
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
              Nothing approved in this kind yet. Write one below, or approve something under
              One more thing.
            </p>
          ) : (
            <>
              {/*
                The page, said out loud, and a way to the rest of it. Only when there is a
                rest: on a library that fits, a count and an expander are two controls
                explaining nothing.
              */}
              {capped && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] text-radar-ink3">
                    Showing {shown.length} of {options.length}, never sent first
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAll((open) => !open)}
                    className="rounded-lg border border-radar-line px-2.5 py-1 text-[11.5px] text-radar-ink2 transition-colors hover:border-radar-ink3 hover:text-radar-ink"
                  >
                    {showAll ? `Show the first ${PREVIEW_ROWS}` : `Show all ${options.length}`}
                  </button>
                </div>
              )}
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {shown.map((option) => (
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
                      {/* Shown because the list is no longer filtered to one language, so
                          which one a row is written in is now the editor's call to make. */}
                      {option.language ? ` · ${option.language}` : ""}
                    </span>
                  </button>
                </li>
              ))}
              </ul>
            </>
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

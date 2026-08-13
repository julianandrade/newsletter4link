"use client";

/**
 * The closing slot's library.
 *
 * Three tabs rather than one list with a status column, because the three states are three
 * different jobs: Approved is the shelf the send screen draws from, Pending is a queue to
 * work through, and Retired is where a line goes when it has aged badly without destroying
 * the record that it was published.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { AsideForm, type AsideDraft, type AsideKind } from "@/components/aside-form";
import { MemeMaker } from "@/components/meme-maker";
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import { SearchIcon } from "@/components/radar/icons";
import { RadarInput } from "@/components/radar/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REWRITE_LANGUAGES } from "@/lib/rewrite/config";
import {
  SortSelect,
  SortAnnouncement,
  applySortParams,
  type SortOption,
  type SortState,
} from "@/components/radar/sortable";
import { relativeTime } from "@/lib/radar/source";

type Status = "APPROVED" | "PENDING" | "RETIRED";

/** Mirrors `ASIDE_SORT_FIELDS` in `app/api/asides/route.ts`. */
type AsideSortField = "createdAt" | "lastUsedAt" | "useCount" | "kind" | "language";

/**
 * The orders an editor working the closing slot actually wants.
 *
 * "Least used first" leads, because the screen's own subtitle counts how many lines have
 * never been sent and there was no way to bring them to the top. Ordering by `lastUsedAt`
 * ascending puts them there: never-sent sorts last in the column, so the ascending end is
 * the ones sent longest ago and the never-sent block sits at the far end of both.
 */
const ASIDE_SORT_OPTIONS: SortOption<AsideSortField>[] = [
  { field: "createdAt", direction: "desc", label: "Newest first" },
  { field: "createdAt", direction: "asc", label: "Oldest first" },
  { field: "useCount", direction: "asc", label: "Least used first" },
  { field: "useCount", direction: "desc", label: "Most used first" },
  { field: "lastUsedAt", direction: "asc", label: "Sent longest ago first" },
  { field: "lastUsedAt", direction: "desc", label: "Sent most recently first" },
  { field: "kind", direction: "asc", label: "Grouped by kind" },
  { field: "language", direction: "asc", label: "Grouped by language" },
];

const ASIDE_SORT_LABELS: Record<AsideSortField, string> = {
  createdAt: "when it was written",
  lastUsedAt: "when it was last sent",
  useCount: "how often it has been sent",
  kind: "kind",
  language: "language",
};

interface Aside {
  id: string;
  kind: AsideKind;
  status: Status;
  source: "HUMAN" | "MODEL";
  text: string;
  imageUrl: string | null;
  attribution: string | null;
  language: string;
  reusable: boolean;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}

const STATUSES: Status[] = ["APPROVED", "PENDING", "RETIRED"];

/** The language filter's "no filter" value. Not a language, so it cannot collide with one. */
const ANY_LANGUAGE = "";

/** How many languages the counts come back for. */
interface LanguageFacet {
  language: string;
  count: number;
}

/**
 * A language tag as a person reads it, falling back to the tag itself.
 *
 * The fallback matters: the facet is grouped from the stored column, so a value that predates
 * `REWRITE_LANGUAGES` or was written by a script still gets a chip rather than an empty one.
 */
function languageLabel(tag: string): string {
  return REWRITE_LANGUAGES.find((entry) => entry.value === tag)?.label ?? tag;
}

/**
 * The tab is addressable, so /dashboard/asides?status=PENDING opens the queue.
 *
 * Read from `window.location` in an effect rather than through `useSearchParams`, matching
 * how the preview harness reads its own `?screen=`, and avoiding the Suspense boundary
 * that hook requires. Without it the heading and the selected chip disagree with the list
 * whenever anything but the component's own click changes what is shown.
 */
function statusFromUrl(): Status | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("status");
  return STATUSES.includes(param as Status) ? (param as Status) : null;
}

/**
 * Addressable for the same reason the tab is: ?language=en is a link somebody can send.
 *
 * Not validated against a list, unlike the status above. The set of real languages is
 * whatever is in the column, which the facet reports and a closed list here would
 * contradict.
 */
function languageFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("language");
}

export default function AsidesPage() {
  const [asides, setAsides] = useState<Aside[]>([]);
  const [status, setStatus] = useState<Status>("APPROVED");
  const [language, setLanguage] = useState<string>(ANY_LANGUAGE);
  const [languageFacets, setLanguageFacets] = useState<LanguageFacet[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  /** The image being looked at full size, or null. */
  const [viewing, setViewing] = useState<Aside | null>(null);
  const [sort, setSort] = useState<SortState<AsideSortField>>({
    field: "createdAt",
    direction: "desc",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState<Aside | null>(null);
  const [suggesting, setSuggesting] = useState<null | "text" | "meme">(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ status });
      if (search) params.set("search", search);
      if (language) params.set("language", language);
      applySortParams(params, sort);

      const response = await fetch(`/api/asides?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not load the library.");
      }

      setAsides(Array.isArray(payload.data) ? payload.data : []);
      // Counts come back with the list, so the chips and the rows can never disagree.
      setLanguageFacets(Array.isArray(payload.languages) ? payload.languages : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load.");
      setAsides([]);
    } finally {
      setIsLoading(false);
    }
  }, [status, search, language, sort]);

  useEffect(() => {
    const fromUrl = statusFromUrl();
    if (fromUrl) setStatus(fromUrl);
    const languageFromQuery = languageFromUrl();
    if (languageFromQuery) setLanguage(languageFromQuery);
  }, []);

  // Typing is not a query.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/asides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Could not save.");
    }

    await load();
  }

  async function create(draft: AsideDraft) {
    const response = await fetch("/api/asides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, status: "APPROVED" }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Could not save.");
    }

    setWriting(false);
    setStatus("APPROVED");
    await load();
  }

  /**
   * Both suggestion paths, which differ only in the route and land in the same queue.
   *
   * The status flips to Pending on success. Suggestions are written PENDING, so leaving the
   * Approved tab up reported "5 candidates queued" over a list that had not changed, and the
   * queue they went to was one click away with nothing pointing at it.
   */
  async function suggest(kind: "text" | "meme") {
    setSuggesting(kind);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(
        kind === "meme" ? "/api/asides/suggest-meme" : "/api/asides/suggest",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not get suggestions.");
      }

      setNotice(payload.message);
      setStatus("PENDING");
      await load();
    } catch (suggestError) {
      setError(
        suggestError instanceof Error ? suggestError.message : "Could not get suggestions."
      );
    } finally {
      setSuggesting(null);
    }
  }

  /** A made meme is an ordinary aside that happens to carry an image. */
  async function saveMeme(draft: { imageUrl: string; text: string }) {
    await create({
      kind: "JOKE",
      text: draft.text,
      imageUrl: draft.imageUrl,
      attribution: null,
      language: language || "pt-PT",
    });
    setMaking(false);
  }

  const neverUsed = useMemo(
    () => asides.filter((aside) => !aside.lastUsedAt).length,
    [asides]
  );

  const title = isLoading
    ? "One more thing"
    : `${asides.length} ${asides.length === 1 ? "line" : "lines"}, ${status.toLowerCase()}`;

  return (
    <>
      <AppHeader />

      <RadarMain width="1000px">
        <PageHeading
          eyebrow="One more thing"
          title={title}
          subtitle={
            <>
              The joke, note or spotlight an edition closes on.{" "}
              {status === "APPROVED" && !isLoading && asides.length > 0 && (
                <>
                  <Num>{neverUsed}</Num> never sent.
                </>
              )}
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <RadarButton
                onClick={() => {
                  setWriting((open) => !open);
                  setMaking(false);
                }}
              >
                {writing ? "Close" : "Write one"}
              </RadarButton>
              <RadarButton
                onClick={() => {
                  setMaking((open) => !open);
                  setWriting(false);
                }}
              >
                {making ? "Close" : "Make a meme"}
              </RadarButton>
              <RadarButton onClick={() => suggest("text")} disabled={suggesting !== null}>
                {suggesting === "text" ? "Asking..." : "Suggest five"}
              </RadarButton>
              <RadarButton onClick={() => suggest("meme")} disabled={suggesting !== null}>
                {suggesting === "meme" ? "Drawing..." : "Suggest memes"}
              </RadarButton>
            </div>
          }
        />

        {notice && (
          <p className="radar-enter mb-4 rounded-xl border border-radar-line bg-radar-surface px-4 py-3 text-[12.5px] text-radar-ink2">
            {notice}
          </p>
        )}

        {error && (
          <p className="radar-enter mb-4 rounded-xl border border-radar-err bg-radar-surface px-4 py-3 text-[12.5px] text-radar-ink">
            {error}
          </p>
        )}

        {writing && (
          <div className="radar-enter mb-6 rounded-xl border border-radar-line bg-radar-surface p-5">
            <SectionLabel className="mb-4">Write one</SectionLabel>
            <AsideForm
              submitLabel="Save as approved"
              onSubmit={create}
              onCancel={() => setWriting(false)}
            />
          </div>
        )}

        {making && (
          <div className="radar-enter mb-6 rounded-xl border border-radar-line bg-radar-surface p-5">
            <SectionLabel className="mb-4">Make a meme</SectionLabel>
            <MemeMaker onSave={saveMeme} onCancel={() => setMaking(false)} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <ChipGroup<Status>
            label="Library view"
            value={status}
            onChange={setStatus}
            options={[
              { value: "APPROVED", label: "Approved" },
              { value: "PENDING", label: "Pending" },
              { value: "RETIRED", label: "Retired" },
            ]}
          />

          {/* The library caps at 200 rows, so both of these run on the server. A search
              that narrowed 200 of 340 in the browser would answer a different question. */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
            <SearchIcon
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
            />
            <RadarInput
              type="search"
              aria-label="Search the closing lines"
              placeholder="Search the text or the attribution"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="pl-9"
            />
          </div>

          <SortSelect
            label="Sort the library"
            options={ASIDE_SORT_OPTIONS}
            sort={sort}
            onChange={setSort}
          />
        </div>

        {/*
          One chip per language actually present, plus "Any".
          Hidden when there is only one, which is the usual case: a single chip next to an
          "Any" that selects the same rows is a control that explains nothing. The counts
          come from the server with the language filter left out, so picking one does not
          zero the others.
        */}
        {languageFacets.length > 1 && (
          <div className="mt-2.5">
            <ChipGroup<string>
              label="Filter by language"
              kind="options"
              size="sm"
              value={language}
              onChange={setLanguage}
              options={[
                { value: ANY_LANGUAGE, label: "Any language" },
                ...languageFacets.map((facet) => ({
                  value: facet.language,
                  label: (
                    <>
                      {languageLabel(facet.language)} <Num>{facet.count}</Num>
                    </>
                  ),
                })),
              ]}
            />
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3">
          {isLoading && <p className="text-[13px] text-radar-ink2">Loading...</p>}

          {!isLoading && asides.length > 0 && (
            <SortAnnouncement
              sort={sort}
              labels={ASIDE_SORT_LABELS}
              count={asides.length}
              noun={asides.length === 1 ? "line" : "lines"}
            />
          )}

          {!isLoading && asides.length === 0 && (
            <p className="rounded-xl border border-radar-line bg-radar-surface px-4 py-6 text-[13px] text-radar-ink2">
              {search
                ? `Nothing in ${status.toLowerCase()} matches “${search}”.`
                : status === "PENDING"
                  ? "Nothing waiting. Suggest five, or write your own."
                  : status === "RETIRED"
                    ? "Nothing retired."
                    : "Nothing approved yet. The slot stays empty until something is."}
            </p>
          )}

          {asides.map((aside) => (
            <article
              key={aside.id}
              className="radar-enter rounded-xl border border-radar-line bg-radar-surface p-4"
            >
              {editing?.id === aside.id ? (
                <AsideForm
                  initial={aside}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (draft) => {
                    await patch(aside.id, {
                      kind: draft.kind,
                      text: draft.text,
                      imageUrl: draft.imageUrl,
                      attribution: draft.attribution,
                      language: draft.language,
                    });
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start gap-3">
                    {aside.imageUrl && (
                      /*
                        object-contain on a 4:3-ish box rather than a cropped square.
                        A meme is usually two or four panels, and centre-cropping one to
                        64x64 showed a slice of the seam: the thumbnail was there without
                        being informative. Letterboxing shows the whole thing.

                        A button, so the full image is one click and one Enter away. The
                        caption is the accessible name because it is also the image's alt
                        text, which makes the control announce what it opens.
                      */
                      <button
                        type="button"
                        onClick={() => setViewing(aside)}
                        aria-label={`See the full image: ${aside.text}`}
                        className="shrink-0 rounded-lg border border-radar-line bg-radar-surface2 p-0.5 transition-colors hover:border-radar-ink3 focus-visible:border-radar-accent"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={aside.imageUrl}
                          alt=""
                          className="h-16 w-24 rounded-md object-contain"
                        />
                      </button>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[14px] leading-[22px] text-radar-ink">
                        {aside.text}
                      </p>
                      {aside.attribution && (
                        <p className="mt-1 text-[12px] text-radar-ink2">
                          {aside.attribution}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-radar-ink2">
                        <StatusChip tone={aside.source === "MODEL" ? "warn" : "ok"}>
                          {aside.source === "MODEL" ? "AI suggested" : "Written"}
                        </StatusChip>
                        <span>{aside.kind.toLowerCase()}</span>
                        <span>·</span>
                        <span>{aside.language}</span>
                        <span>·</span>
                        <span>
                          {aside.lastUsedAt
                            ? `sent ${aside.useCount}x, last ${relativeTime(aside.lastUsedAt)}`
                            : "never sent"}
                        </span>
                        {!aside.reusable && (
                          <>
                            <span>·</span>
                            <span>one-off</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {aside.status !== "APPROVED" && (
                      <RadarButton
                        onClick={() => patch(aside.id, { status: "APPROVED" }).catch(() => {})}
                      >
                        Approve
                      </RadarButton>
                    )}
                    <RadarButton onClick={() => setEditing(aside)}>Edit</RadarButton>
                    {aside.status !== "RETIRED" && (
                      <RadarButton
                        onClick={() => patch(aside.id, { status: "RETIRED" }).catch(() => {})}
                      >
                        Retire
                      </RadarButton>
                    )}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </RadarMain>

      {/*
        The image at full size, with its caption under it.
        Both together on purpose: the caption is the alt text a reader sees when their client
        blocks images, so whether the pair works is the actual judgement being made here, and
        it cannot be made from either half alone.
      */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>The image at full size</DialogTitle>
            <DialogDescription>
              {viewing?.language} · {viewing?.kind.toLowerCase()} ·{" "}
              {viewing?.source === "MODEL" ? "AI suggested" : "written"}
            </DialogDescription>
          </DialogHeader>

          {viewing?.imageUrl && (
            <div className="flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewing.imageUrl}
                alt={viewing.text}
                className="max-h-[65vh] w-auto self-center rounded-lg border border-radar-line object-contain"
              />
              <p className="m-0 text-[13px] leading-[21px] text-radar-ink">{viewing.text}</p>
              {viewing.attribution && (
                <p className="m-0 text-[12px] text-radar-ink2">{viewing.attribution}</p>
              )}
              <p className="m-0 text-[11.5px] text-radar-ink3">
                This caption is what a reader sees when their mail client blocks images.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

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
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import { relativeTime } from "@/lib/radar/source";

type Status = "APPROVED" | "PENDING" | "RETIRED";

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

export default function AsidesPage() {
  const [asides, setAsides] = useState<Aside[]>([]);
  const [status, setStatus] = useState<Status>("APPROVED");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<Aside | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/asides?status=${status}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not load the library.");
      }

      setAsides(Array.isArray(payload.data) ? payload.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load.");
      setAsides([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const fromUrl = statusFromUrl();
    if (fromUrl) setStatus(fromUrl);
  }, []);

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

  async function suggest() {
    setSuggesting(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/asides/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not get suggestions.");
      }

      setNotice(payload.message);
      await load();
    } catch (suggestError) {
      setError(
        suggestError instanceof Error ? suggestError.message : "Could not get suggestions."
      );
    } finally {
      setSuggesting(false);
    }
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
            <div className="flex gap-2">
              <RadarButton onClick={() => setWriting((open) => !open)}>
                {writing ? "Close" : "Write one"}
              </RadarButton>
              <RadarButton onClick={suggest} disabled={suggesting}>
                {suggesting ? "Asking..." : "Suggest five"}
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

        <div className="mt-5 flex flex-col gap-3">
          {isLoading && <p className="text-[13px] text-radar-ink2">Loading...</p>}

          {!isLoading && asides.length === 0 && (
            <p className="rounded-xl border border-radar-line bg-radar-surface px-4 py-6 text-[13px] text-radar-ink2">
              {status === "PENDING"
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
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={aside.imageUrl}
                        alt={aside.text}
                        className="h-16 w-16 shrink-0 rounded-lg border border-radar-line object-cover"
                      />
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
    </>
  );
}

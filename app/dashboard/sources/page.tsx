"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EmailSourceManager } from "@/components/email-source-manager";
import { ReceivedEmails } from "@/components/inbound/received-emails";
import { RSSSourceManager } from "@/components/rss-source-manager";
import {
  ChipGroup,
  Num,
  PageHeading,
  radarButtonClass,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import { relativeTime } from "@/lib/radar/source";

interface RssSource {
  id: string;
  name: string;
  category: string;
  active: boolean;
  type?: string;
  lastFetchedAt: string | null;
  lastError: string | null;
}

type Panel = "sources" | "received";

export default function SourcesPage() {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>("sources");

  useEffect(() => {
    fetch("/api/rss-sources")
      .then((r) => r.json())
      .then((data) => setSources(Array.isArray(data) ? data : []))
      .catch(() => setSources([]))
      .finally(() => setIsLoading(false));
  }, []);

  // RQ-007: /api/rss-sources now returns email sources too. Counted apart, because an
  // email source has no feed URL and never reports a fetch error, so folding it into
  // "N feeds, all healthy" would inflate the count and vouch for health nothing measured.
  const feeds = useMemo(() => sources.filter((s) => s.type !== "EMAIL"), [sources]);
  const emailSources = useMemo(
    () => sources.filter((s) => s.type === "EMAIL"),
    [sources]
  );

  const active = useMemo(() => feeds.filter((s) => s.active), [feeds]);
  const failing = useMemo(
    () => active.filter((s) => Boolean(s.lastError)),
    [active]
  );
  const lastFetched = useMemo(() => {
    const stamps = active
      .map((s) => s.lastFetchedAt)
      .filter((v): v is string => Boolean(v))
      .sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [active]);

  const title = isLoading
    ? "Sources"
    : failing.length > 0
      ? `${active.length} feeds, ${failing.length} unhealthy`
      : `${active.length} ${active.length === 1 ? "feed" : "feeds"}, all healthy`;

  return (
    <>
      <AppHeader />

      <RadarMain width="1240px">
        <PageHeading
          eyebrow="Sources"
          title={title}
          subtitle={
            <>
              <Num>{feeds.length}</Num> configured ·{" "}
              <Num>{active.length}</Num> active
              {emailSources.length > 0 && (
                <>
                  {" · "}
                  <Num>{emailSources.length}</Num> email{" "}
                  {emailSources.length === 1 ? "source" : "sources"}
                </>
              )}
              {lastFetched && <> · last collected {relativeTime(lastFetched)}</>}
            </>
          }
          actions={
            <Link href="/dashboard/curation" className={radarButtonClass()}>
              Curation jobs
            </Link>
          }
        />

        {failing.length > 0 && (
          <div className="radar-enter mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-radar-err bg-radar-surface px-4 py-3">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-radar-err"
            />
            <p className="m-0 min-w-0 flex-1 text-[12.5px] text-radar-ink2">
              <span className="font-semibold text-radar-ink">
                {failing.length} {failing.length === 1 ? "feed" : "feeds"} failed on
                the last run.
              </span>{" "}
              {failing
                .slice(0, 2)
                .map((s) => `${s.name}: ${s.lastError}`)
                .join(" · ")}
              {failing.length > 2 && ` · and ${failing.length - 2} more`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {failing.slice(0, 4).map((source) => (
                <StatusChip key={source.id} tone="err">
                  {source.name}
                </StatusChip>
              ))}
            </div>
          </div>
        )}

        {/*
          Finding D2: the emails, beside the sources that claim them.

          Here rather than in its own navigation entry, and not inside a single source,
          because the question that goes unanswered today is "what arrived, and what did it
          give us", which is about the mail rather than about one subscription.
        */}
        <ChipGroup<Panel>
          label="Sources view"
          value={panel}
          onChange={setPanel}
          options={[
            { value: "sources", label: "Sources" },
            { value: "received", label: "Received" },
          ]}
        />

        {panel === "received" ? (
          <div className="mt-5">
            <SectionLabel className="mb-3">Emails received</SectionLabel>
            <ReceivedEmails />
          </div>
        ) : (
          <div className="mt-5">
            <SectionLabel className="mb-3">Email newsletters</SectionLabel>
            <div className="mb-8">
              <EmailSourceManager />
            </div>

            <SectionLabel className="mb-3">Feed management</SectionLabel>
            <RSSSourceManager />
          </div>
        )}
      </RadarMain>
    </>
  );
}

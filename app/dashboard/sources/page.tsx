"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EmailSourceManager } from "@/components/email-source-manager";
import { ReceivedEmails } from "@/components/inbound/received-emails";
import { RSSSourceManager } from "@/components/rss-source-manager";
import { SourcesAttention } from "@/components/sources/sources-attention";
import { SourcesTabRow } from "@/components/sources/sources-tabs";
import {
  Num,
  PageHeading,
  radarButtonClass,
  RadarMain,
} from "@/components/radar/primitives";
import {
  sourceAttention,
  sourcesHeading,
  splitSources,
  type SourceRow,
} from "@/lib/sources/summary";
import { resolveTab, type SourcesTab } from "@/lib/sources/tabs";
import { relativeTime } from "@/lib/radar/source";

/**
 * The sources screen: four tabs over one shell.
 *
 * It carried two whole collection managers stacked, each with its own header and toolbar,
 * which measured fifty viewports and twelve headings. What replaces them is one heading
 * covering both kinds, one attention banner, and one list at a time.
 *
 * The tab is in the URL so the banner can link to it and a bookmark survives a reload,
 * read from `window.location` in an effect and written with `replaceState` rather than
 * through `useSearchParams`. That is the pattern this project already settled on twice,
 * in `app/dashboard/page.tsx` and `app/dashboard/asides/page.tsx`: `useSearchParams`
 * would make the whole screen need a Suspense boundary to prerender. Only the `tab`
 * parameter is touched, so the preview harness keeps its own `?screen=`.
 */
export default function SourcesPage() {
  const [tab, setTab] = useState<SourcesTab>("feeds");

  useEffect(() => {
    setTab(resolveTab(new URLSearchParams(window.location.search).get("tab")));
  }, []);

  const changeTab = useCallback((next: SourcesTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    // Feeds is the default, so it stays out of the URL: a bare /dashboard/sources and
    // ?tab=feeds are the same screen and should not be two links to it.
    if (next === "feeds") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const [rows, setRows] = useState<SourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rss-sources")
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setIsLoading(false));
  }, []);

  const { feeds, emailSources } = useMemo(() => splitSources(rows), [rows]);

  // The clock this screen measures staleness against is taken once per load of the
  // sources, not once per render, for the reason recorded at email-source-manager.tsx:182.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [rows]);

  const attention = useMemo(
    () => sourceAttention({ feeds, emailSources, now }),
    [feeds, emailSources, now]
  );

  const lastCollected = useMemo(() => {
    const stamps = feeds
      .filter((feed) => feed.active)
      .map((feed) => feed.lastFetchedAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return stamps.length ? relativeTime(stamps[stamps.length - 1]) : null;
  }, [feeds]);

  const heading = sourcesHeading({
    feeds,
    emailSources,
    attentionCount: attention.count,
    isLoading,
    lastCollectedLabel: lastCollected,
  });

  return (
    <>
      <AppHeader />

      <RadarMain width="1240px">
        <PageHeading
          eyebrow="Sources"
          title={heading.title}
          subtitle={heading.subtitle.map((part, index) => (
            <span key={`${part.text}-${index}`}>
              {index > 0 && " · "}
              {part.num ? (
                <>
                  <Num>{part.num}</Num> {part.text}
                </>
              ) : (
                part.text
              )}
            </span>
          ))}
          actions={
            <Link href="/dashboard/curation" className={radarButtonClass()}>
              Curation jobs
            </Link>
          }
        />

        <SourcesAttention lines={attention.lines} onJump={changeTab} />

        <SourcesTabRow
          value={tab}
          onChange={changeTab}
          counts={{
            feeds: isLoading ? null : feeds.length,
            email: isLoading ? null : emailSources.length,
          }}
        />

        <div
          id={`sources-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`sources-tab-${tab}`}
          tabIndex={0}
          className="mt-5"
        >
          {tab === "feeds" && <RSSSourceManager />}
          {/* Both of these render the email manager until the unknown-senders block is
              lifted out of it. That happens in task 6 of the plan; the duplication is
              left visible rather than hidden behind a prop task 6 would delete. */}
          {tab === "email" && <EmailSourceManager />}
          {tab === "unmatched" && <EmailSourceManager />}
          {tab === "received" && <ReceivedEmails />}
        </div>
      </RadarMain>
    </>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
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
import { useSourceCollections } from "@/components/sources/use-source-collections";
import { LoadError } from "@/components/radar/controls";
import { sourceAttention, sourcesHeading } from "@/lib/sources/summary";
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

  const collections = useSourceCollections();
  const { feeds, emailSources, isLoading, error, reload } = collections;

  // The clock this screen measures staleness against is taken once per load of the
  // sources, not once per render, for the reason recorded at email-source-manager.tsx:182.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [feeds, emailSources]);

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

  /**
   * `SourceRow` is the subset both kinds have in common, so its `url` and its email fields
   * are optional. `/api/rss-sources` returns the whole Prisma row, which is why each
   * manager's own stricter interface holds at runtime. The two casts are the only place
   * that is asserted rather than proved, and they are asserted once, here, instead of
   * loosening either manager's props.
   */
  const feedRows = feeds as unknown as ComponentProps<typeof RSSSourceManager>["sources"];
  const emailRows = emailSources as unknown as ComponentProps<
    typeof EmailSourceManager
  >["sources"];

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

        {/* Above the tabs, and once: the tab row still renders, so the other three panels
            stay reachable when the source list is the thing that failed. */}
        {error && (
          <div className="mb-5">
            <LoadError what="The sources" message={error} onRetry={() => void reload()} />
          </div>
        )}

        <SourcesTabRow
          value={tab}
          onChange={changeTab}
          counts={{
            feeds: isLoading ? null : feeds.length,
            email: isLoading ? null : emailSources.length,
            unmatched:
              collections.unknownState === "ready" ? collections.unknown.length : null,
          }}
        />

        <div
          id={`sources-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`sources-tab-${tab}`}
          tabIndex={0}
          className="mt-5"
        >
          {tab === "feeds" && (
            <RSSSourceManager
              sources={feedRows}
              loading={isLoading}
              loadError={error}
              reload={reload}
            />
          )}
          {/* Both of these render the email manager until the unknown-senders block is
              lifted out of it. That happens in task 6 of the plan; the duplication is
              left visible rather than hidden behind a prop task 6 would delete. */}
          {(tab === "email" || tab === "unmatched") && (
            <EmailSourceManager
              sources={emailRows}
              isLoading={isLoading}
              loadError={error}
              reload={reload}
              unknown={collections.unknown}
              unknownState={collections.unknownState}
              unknownMessage={collections.unknownMessage}
              unknownTruncated={collections.unknownTruncated}
              reloadUnknown={collections.reloadUnknown}
            />
          )}
          {tab === "received" && <ReceivedEmails />}
        </div>
      </RadarMain>
    </>
  );
}

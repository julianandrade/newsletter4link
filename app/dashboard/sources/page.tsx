"use client";

import {
  Suspense,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { toast } from "sonner";
import { useSourceCollections } from "@/components/sources/use-source-collections";
import { UnknownSenders } from "@/components/sources/unknown-senders";
import {
  draftFromSender,
  emptyDraft,
  EmailSourceDialog,
  type NewSourceDraft,
} from "@/components/sources/email-source-dialog";
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
 * The tab is in the URL so the banner can link to it and a bookmark survives a reload.
 *
 * Read once through `useSearchParams`, then kept in local state and written back with
 * `replaceState`. The two halves are deliberate, and each one is a bug that was measured:
 *
 *  - `useSearchParams` for the initial value, rather than `window.location` in an effect
 *    the way `app/dashboard/page.tsx` and `app/dashboard/asides/page.tsx` do it, because
 *    the server knows the URL and this panel does not hold plain divs. Reading it in an
 *    effect made the server render the Feeds panel, Radix dialogs and all, and then swap
 *    that subtree out during hydration, which React reports as mismatched `useId` values.
 *    Landing on `?tab=unmatched` logged a hydration error; `?tab=feeds` did not.
 *  - Local state plus `replaceState` for changes, rather than `router.replace`, so
 *    switching tabs stays a render instead of a navigation. Only the `tab` parameter is
 *    touched, so the preview harness keeps its own `?screen=`.
 *
 * The Suspense boundary at the bottom of this file is what `useSearchParams` costs, and it
 * is the whole cost.
 */
function SourcesScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<SourcesTab>(() => resolveTab(params.get("tab")));

  const changeTab = useCallback((next: SourcesTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    // Feeds is the default, so it stays out of the URL: a bare /dashboard/sources and
    // ?tab=feeds are the same screen and should not be two links to it.
    if (next === "feeds") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  /** A draft means the create dialog is open. Promote fills it; Add starts it empty. */
  const [draft, setDraft] = useState<NewSourceDraft | null>(null);

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
          {tab === "email" && (
            <EmailSourceManager
              sources={emailRows}
              isLoading={isLoading}
              loadError={error}
              reload={reload}
              reloadUnknown={collections.reloadUnknown}
              onAdd={() => setDraft(emptyDraft)}
            />
          )}
          {tab === "unmatched" && (
            <UnknownSenders
              groups={collections.unknown}
              state={collections.unknownState}
              message={collections.unknownMessage}
              truncated={collections.unknownTruncated}
              onPromote={(group) => setDraft(draftFromSender(group))}
            />
          )}
          {tab === "received" && <ReceivedEmails />}
        </div>

        {/*
          The create dialog lives here because two tabs open it: Add on the Email tab, and
          Promote on the Unmatched tab, which prefills it from a sender the mailbox has
          actually seen. Owning the draft here is what lets Promote land on the source it
          just created instead of leaving you where you were.
        */}
        <EmailSourceDialog
          draft={draft}
          onDraftChange={setDraft}
          onClose={() => setDraft(null)}
          onCreated={async (sender) => {
            const held = collections.unknown.find((group) => group.sender === sender);

            // Only worth offering when something is actually held. Requeueing is a separate
            // call so that creating a source without reprocessing stays possible.
            if (held && held.count > 0) {
              const requeue = await fetch("/api/inbound/unknown-senders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender }),
              });
              const data = await requeue.json().catch(() => null);

              if (requeue.ok) toast.success(data?.message ?? "Held emails requeued");
              else toast.error(data?.error ?? "The held emails could not be requeued");
            }

            await collections.reloadAll();
            changeTab("email");
          }}
        />
      </RadarMain>
    </>
  );
}

/**
 * `useSearchParams` needs a Suspense boundary, and this is it.
 *
 * `null` as the fallback rather than a skeleton: the boundary resolves in the same pass on
 * the server, so nothing ever paints it, and a skeleton nobody sees is a skeleton nobody
 * maintains.
 */
export default function SourcesPage() {
  return (
    <Suspense fallback={null}>
      <SourcesScreen />
    </Suspense>
  );
}

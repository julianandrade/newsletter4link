"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { splitSources, type SourceRow } from "@/lib/sources/summary";

/**
 * The sources screen's data, fetched once.
 *
 * `/api/rss-sources` was requested three times per load: by the page, by the RSS manager
 * and by the email manager, each keeping its own copy of the same list. The page owns both
 * requests now and hands the pieces down.
 *
 * The unknown senders are here rather than inside the email manager because their count is
 * in the tab row, which is above every panel.
 */

export interface UnknownSenderGroup {
  sender: string;
  displayFrom: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  subjectSamples: string[];
  tags: string[];
  byStatus: Record<string, number>;
  alreadyIgnored: boolean;
}

export type UnknownState = "loading" | "ready" | "forbidden" | "error";

export interface SourceCollections {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  unknown: UnknownSenderGroup[];
  unknownState: UnknownState;
  unknownMessage: string | null;
  unknownTruncated: boolean;
  reloadUnknown: () => Promise<void>;
  reloadAll: () => Promise<void>;
}

export interface FeedCollection {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * The source list on its own.
 *
 * Its own hook because `/dashboard/curation` embeds the feeds manager too, and that screen
 * has no use for the unclaimed senders. Folding them in would have put a request on a page
 * that never renders its result.
 */
export function useFeedSources(): FeedCollection {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/rss-sources");
      if (!response.ok) {
        throw new Error(`the sources request answered ${response.status}`);
      }

      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "the sources could not be loaded"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // The load-on-mount effect every screen in this app uses, moved into a hook. The
    // compiler rule is a warning across the four paths listed in eslint.config.mjs and an
    // error here, deliberately, so that a new one is looked at rather than inheriting the
    // exemption. Looked at: the request is the reason the hook exists, and collapsing three
    // copies of it into one is the point of the change. Same call the page made before.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const { feeds, emailSources } = useMemo(() => splitSources(rows), [rows]);

  return { feeds, emailSources, isLoading, error, reload };
}

export interface UnknownSenders {
  unknown: UnknownSenderGroup[];
  unknownState: UnknownState;
  unknownMessage: string | null;
  unknownTruncated: boolean;
  reloadUnknown: () => Promise<void>;
}

/**
 * The senders no active source claims.
 *
 * Platform-wide, and answering 403 to anyone who may not see it, which is why the state is
 * four-valued rather than a boolean: "restricted" is a thing the panel says out loud.
 */
export function useUnknownSenders(): UnknownSenders {
  const [unknown, setUnknown] = useState<UnknownSenderGroup[]>([]);
  const [unknownState, setUnknownState] = useState<UnknownState>("loading");
  const [unknownMessage, setUnknownMessage] = useState<string | null>(null);
  const [unknownTruncated, setUnknownTruncated] = useState(false);

  const reloadUnknown = useCallback(async () => {
    try {
      const response = await fetch("/api/inbound/unknown-senders");
      const data = await response.json().catch(() => null);

      if (response.status === 403) {
        setUnknownState("forbidden");
        setUnknownMessage(data?.error ?? "This view is restricted.");
        return;
      }

      if (!response.ok) throw new Error(data?.error ?? `answered ${response.status}`);

      setUnknown(Array.isArray(data.groups) ? data.groups : []);
      setUnknownTruncated(Boolean(data.truncated));
      setUnknownState("ready");
      setUnknownMessage(null);
    } catch (caught) {
      setUnknownState("error");
      setUnknownMessage(
        caught instanceof Error ? caught.message : "the senders could not be loaded"
      );
    }
  }, []);

  useEffect(() => {
    // Same reasoning as the effect in useFeedSources above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadUnknown();
  }, [reloadUnknown]);

  return { unknown, unknownState, unknownMessage, unknownTruncated, reloadUnknown };
}

/** Both, for the sources screen, which shows all four tabs. */
export function useSourceCollections(): SourceCollections {
  const feeds = useFeedSources();
  const senders = useUnknownSenders();

  const reloadAll = useCallback(async () => {
    await Promise.all([feeds.reload(), senders.reloadUnknown()]);
  }, [feeds, senders]);

  return { ...feeds, ...senders, reloadAll };
}

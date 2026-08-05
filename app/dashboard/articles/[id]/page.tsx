"use client";

/**
 * RQ-006_03: the article detail route.
 *
 * Everything that knows about the network lives here, and everything that knows how to
 * draw lives in `components/article/`. That split is what lets the preview harness
 * render each state of the screen from a fixture with no Supabase session.
 *
 * Nothing is generated on open. The read passes `generate=false`, so opening an article
 * costs nothing and returns immediately. The API's default is the opposite, and it is
 * the right default for the API: a caller that wants a Link Take should get one. It is
 * the wrong default for a screen reached by clicking a headline, now that every card in
 * the feed links here, because idle navigation would spend the day's budget and a page
 * open would sit for up to two minutes waiting on a model.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { LinkTakeView, type LinkTakeNotice } from "@/components/article/link-take-view";
import {
  PageHeading,
  RadarMain,
  radarButtonClass,
} from "@/components/radar/primitives";
import { EmptyState, LoadError, SkeletonRows } from "@/components/radar/controls";
import { useOrgRole } from "@/components/radar/use-role";
import type { LinkTakePayload, RewriteHistoryEntry } from "@/lib/rewrite/view";

type LoadState =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "failed"; message: string }
  | { phase: "ready"; payload: LinkTakePayload };

/**
 * The frame the three pre-content states share.
 *
 * Loading, not-found and failed differ only in a heading and a body, and the width has
 * to match the one `LinkTakeView` uses or the page jumps as it resolves. One definition
 * is one place to keep that true.
 */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <RadarMain width="780px">
        <PageHeading eyebrow="Article" title={title} />
        {children}
      </RadarMain>
    </>
  );
}

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = params.id as string;
  const { atLeast } = useOrgRole();

  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<LinkTakeNotice | null>(null);
  const [history, setHistory] = useState<RewriteHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  /**
   * Read what exists.
   *
   * `generate` is a parameter rather than two functions because the two calls differ
   * only in whether they are allowed to spend, and the handling of the answer is
   * identical.
   */
  const read = useCallback(
    async (generate: boolean): Promise<LinkTakePayload | null> => {
      const response = await fetch(
        `/api/articles/${articleId}/rewrite?generate=${generate ? "true" : "false"}`
      );

      if (response.status === 404) {
        setLoad({ phase: "missing" });
        return null;
      }

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        setLoad({
          phase: "failed",
          message:
            json?.error ?? `The request came back with status ${response.status}.`,
        });
        return null;
      }

      const payload = json.data as LinkTakePayload;
      setLoad({ phase: "ready", payload });
      return payload;
    },
    [articleId]
  );

  useEffect(() => {
    // No guard on a missing id. In an App Router `[id]` route the param is always
    // there, so the guard would protect against nothing real, and it would stop the
    // preview harness dead: the harness renders this component at `/radar-preview`,
    // which has no route params, and an early return there means the screen never
    // leaves its loading state. `send/[id]` does the same for the same reason.
    let cancelled = false;

    read(false).catch((cause) => {
      if (cancelled) return;
      setLoad({
        phase: "failed",
        message: cause instanceof Error ? cause.message : "The request failed.",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [articleId, read]);

  /** Write one where none has ever been attempted. Any member may ask. */
  const handleGenerate = useCallback(async () => {
    setBusy(true);
    setNotice(null);

    try {
      const payload = await read(true);

      // Generated, and refused, both come back as a 200 with a payload. A refusal is
      // not an error: the checks did their job, and the reason is written for a person.
      if (payload && !payload.rewrite) {
        setNotice({
          tone: "info",
          title: "Nothing was written, and that is an answer",
          detail: payload.unavailableReason ?? undefined,
        });
      }
    } catch (cause) {
      setNotice({
        tone: "err",
        title: "The request failed",
        detail: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [read]);

  /**
   * The audit trail, read lazily.
   *
   * Declared before the regeneration that calls it, so the dependency array does not
   * reference a binding that has not been initialized yet.
   */
  const handleLoadHistory = useCallback(async () => {
    setHistoryError(null);

    try {
      const response = await fetch(`/api/articles/${articleId}/rewrite`, {
        method: "PATCH",
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        setHistoryError(
          json?.error ?? `The history came back with status ${response.status}.`
        );
        return;
      }

      setHistory(json.data as RewriteHistoryEntry[]);
    } catch (cause) {
      setHistoryError(
        cause instanceof Error ? cause.message : "The history request failed."
      );
    }
  }, [articleId]);

  /** Force a new one, superseding what is there. EDITOR and above. */
  const handleRegenerate = useCallback(async () => {
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/articles/${articleId}/rewrite`, {
        method: "POST",
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        // 409 carries a reason written for a person, such as the daily cap with its
        // numbers in it, so it is shown as it arrived rather than reworded.
        setNotice({
          tone: "warn",
          title: "Nothing was regenerated",
          detail: json?.error ?? `The request came back with status ${response.status}.`,
        });
        return;
      }

      if (json.generated === false) {
        setNotice({
          tone: "info",
          title: "The checks refused it",
          detail: json.reason ?? undefined,
        });
      }

      // Re-read either way: on success to pick up the new piece, and after a refusal
      // because the stored state changed even though no prose did. The POST answers with
      // only an id and a title, so this GET is load-bearing rather than redundant.
      //
      // Together, not in sequence. The two read different things (the current rewrite,
      // and the list of all of them) and neither depends on the other's answer, so
      // awaiting them one after the other cost a round trip for nothing.
      //
      // The trail is refreshed rather than discarded: the panel asks for the history only
      // on its first open, so clearing it here would leave whoever had it open reading
      // "Reading the history" until they reloaded the page.
      await Promise.all([
        read(false),
        history !== null ? handleLoadHistory() : Promise.resolve(),
      ]);
    } catch (cause) {
      setNotice({
        tone: "err",
        title: "The request failed",
        detail: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [articleId, read, history, handleLoadHistory]);

  if (load.phase === "loading") {
    return (
      <Shell title="Opening the article">
        <SkeletonRows rows={5} />
      </Shell>
    );
  }

  if (load.phase === "missing") {
    return (
      <Shell title="That article is not here">
        <EmptyState
          title="No article with that id"
          actions={
            <Link href="/dashboard" className={radarButtonClass("accent")}>
              Back to the feed
            </Link>
          }
        >
          It may belong to another organization, or the link may be stale.
        </EmptyState>
      </Shell>
    );
  }

  if (load.phase === "failed") {
    return (
      <Shell title="The article could not be read">
        <LoadError
          what="This article"
          message={load.message}
          onRetry={() => {
            setLoad({ phase: "loading" });
            void read(false);
          }}
        />
      </Shell>
    );
  }

  return (
    <>
      <AppHeader />
      <LinkTakeView
        payload={load.payload}
        canEdit={atLeast("EDITOR")}
        busy={busy}
        notice={notice}
        onGenerate={handleGenerate}
        onRegenerate={handleRegenerate}
        onLoadHistory={handleLoadHistory}
        history={history}
        historyError={historyError}
      />
    </>
  );
}

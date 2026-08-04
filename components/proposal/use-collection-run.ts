"use client";

/**
 * RQ-005 AC-5.7: starting a collection run by hand, as an override.
 *
 * Moved out of the proposal screen because it is plumbing, not the screen's
 * argument: it reads the server-sent event stream from
 * `GET /api/curation/collect` and reports progress back. Story 5 exists so that
 * nobody has to start a run to find out whether one is needed, so this is the
 * exception rather than a step in the weekly flow.
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export interface CollectionProgress {
  running: boolean;
  current: number | null;
  total: number | null;
}

export interface CollectionRun {
  /** Progress text from the stream, for the status band. */
  liveMessage: string | null;
  cancelling: boolean;
  run: () => Promise<void>;
  cancel: () => Promise<void>;
}

export function useCollectionRun(handlers: {
  onProgress: (progress: CollectionProgress) => void;
  /** A run that finished, was cancelled or failed: reload what it changed. */
  onFinished: () => void;
}): CollectionRun {
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Held in a ref so the reader below never closes over a stale callback.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const idle: CollectionProgress = { running: false, current: null, total: null };

  const run = useCallback(async () => {
    handlersRef.current.onProgress({ running: true, current: null, total: null });
    setLiveMessage("Connecting to the collector…");

    const stop = (progress: CollectionProgress) => {
      setLiveMessage(null);
      handlersRef.current.onProgress(progress);
    };

    try {
      const res = await fetch("/api/curation/collect", {
        headers: { Accept: "text/event-stream" },
      });
      if (!res.ok) throw new Error(`The collector responded ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("The collector sent no response body");

      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (type: string, raw: string) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }

        const message =
          typeof payload.message === "string" ? payload.message : "Working…";
        const current = typeof payload.current === "number" ? payload.current : null;
        const total = typeof payload.total === "number" ? payload.total : null;

        if (type === "start" || type === "progress") {
          setLiveMessage(message);
          handlersRef.current.onProgress({ running: true, current, total });
          return;
        }

        if (type === "complete" || type === "cancelled") {
          stop(idle);
          toast.success(
            type === "complete" ? "Collection finished" : "Collection cancelled",
            { description: message }
          );
          handlersRef.current.onFinished();
          return;
        }

        if (type === "error") {
          const detail =
            typeof payload.error === "string" ? payload.error : "Unknown error";
          stop(idle);
          toast.error("Collection failed", { description: detail });
          handlersRef.current.onFinished();
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          let type = "message";
          let data = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (data) handle(type, data);
        }
      }
    } catch (cause) {
      stop(idle);
      toast.error("Collection failed", {
        description:
          cause instanceof Error ? cause.message : "Could not reach the collector",
      });
      handlersRef.current.onFinished();
    }
    // `idle` is a constant literal, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      const res = await fetch("/api/curation/cancel", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Could not cancel the run");
      }
      setLiveMessage("Cancelling…");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not cancel the run"
      );
    } finally {
      setCancelling(false);
    }
  }, []);

  return { liveMessage, cancelling, run, cancel };
}

"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  clampPageSize,
  DEFAULT_PAGE_SIZE,
  pageSizeKey,
  type PageSize,
} from "@/lib/list-page-size";

/**
 * One list's rows-per-page, remembered between visits.
 *
 * In `localStorage` rather than the URL because it is a workspace preference: a link you
 * send a colleague should show them the same rows, not your density. Per list, because the
 * right size for a run history is not the right size for an article archive.
 *
 * Read through `useSyncExternalStore`, which is the primitive for exactly this: storage is
 * an external store, and the hook's server snapshot is what guarantees the server and the
 * first client render agree. Doing it with `useState` plus an effect also works, but only
 * as long as everyone who edits it remembers why the read is in the effect; here React
 * enforces it. The sources screen paid twice in one afternoon for renders that disagreed
 * across that boundary.
 *
 * Subscribing also means a size changed in another tab arrives here, which is the correct
 * behaviour for a preference and costs one event listener.
 *
 * Every storage call is wrapped: Safari in private mode throws, and a preference that
 * cannot be saved must not take the list down with it.
 */

const listeners = new Set<() => void>();

/**
 * Sizes chosen in this session.
 *
 * Consulted before storage, for two reasons. Storage can refuse a write, and a preference
 * that cannot be saved must still apply until the tab closes rather than snapping back the
 * instant it is chosen. And when a choice made here disagrees with one made in another tab,
 * the one made here is the one the person is looking at.
 */
const memory = new Map<string, PageSize>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // `storage` fires for other tabs only, so same-tab writes notify through the set above.
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readSize(list: string): PageSize {
  const chosen = memory.get(list);
  if (chosen !== undefined) return chosen;

  try {
    const stored = window.localStorage.getItem(pageSizeKey(list));
    return stored === null ? DEFAULT_PAGE_SIZE : clampPageSize(stored);
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function usePageSize(list: string): [PageSize, (next: PageSize) => void] {
  const size = useSyncExternalStore(
    subscribe,
    useCallback(() => readSize(list), [list]),
    // The server has no storage, so it renders the default and so does the first client
    // pass. React swaps in the stored value itself, after hydration.
    useCallback(() => DEFAULT_PAGE_SIZE, [])
  );

  const choose = useCallback(
    (next: PageSize) => {
      const clamped = clampPageSize(next);
      memory.set(list, clamped);
      try {
        window.localStorage.setItem(pageSizeKey(list), String(clamped));
      } catch {
        // Not saved for next time, but `memory` above means it still applies right now.
      }
      for (const listener of listeners) listener();
    },
    [list]
  );

  return [size, choose];
}

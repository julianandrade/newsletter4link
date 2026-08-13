"use client";

import { useCallback, useEffect, useState } from "react";
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
 * **Read in an effect, never during render.** The server has no `localStorage`, so reading
 * it while rendering would emit 50 on one side and 100 on the other, and React reports that
 * as a hydration mismatch. The sources screen paid for that twice in one afternoon, both
 * times through a subtree that differed across the two renders. So the first client render
 * returns exactly what the server returned, and the stored preference lands one render
 * later, before anything has been painted that a person could act on.
 *
 * Every storage call is wrapped: Safari in private mode throws on write, and a preference
 * that cannot be saved must not take the list down with it.
 */
export function usePageSize(list: string): [PageSize, (next: PageSize) => void] {
  const [size, setSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(pageSizeKey(list));
      if (stored !== null) setSize(clampPageSize(stored));
    } catch {
      // No storage, or storage that refuses to be read. The default is already in state.
    }
  }, [list]);

  const choose = useCallback(
    (next: PageSize) => {
      const clamped = clampPageSize(next);
      setSize(clamped);
      try {
        window.localStorage.setItem(pageSizeKey(list), String(clamped));
      } catch {
        // The choice still applies for this session; it just will not be there tomorrow.
      }
    },
    [list]
  );

  return [size, choose];
}

"use client";

import { ChipGroup, Num } from "@/components/radar/primitives";
import { SOURCES_TABS, TAB_LABELS, type SourcesTab } from "@/lib/sources/tabs";

/**
 * The four tabs, on one row, with the counts an editor acts on.
 *
 * `idBase` is the point of wrapping ChipGroup rather than calling it inline: it is what
 * makes every tab's `aria-controls` resolve, and the screen this replaces passed none.
 * A count of `null` or `undefined` renders no figure at all, because a zero printed while
 * a request is still in flight is a claim, and Received deliberately never has one.
 */
export function SourcesTabRow({
  value,
  onChange,
  counts,
}: {
  value: SourcesTab;
  onChange: (next: SourcesTab) => void;
  counts: Partial<Record<SourcesTab, number | null>>;
}) {
  return (
    // Four tabs with counts do not fit a phone. Scrolling keeps them on one row rather
    // than wrapping into two, which would push the list below the fold on the screen
    // whose whole problem was length.
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ChipGroup<SourcesTab>
        label="Sources view"
        idBase="sources"
        value={value}
        onChange={onChange}
        options={SOURCES_TABS.map((tab) => {
          const count = counts[tab];
          return {
            value: tab,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {TAB_LABELS[tab]}
                {typeof count === "number" && <Num>{count}</Num>}
              </span>
            ),
          };
        })}
      />
    </div>
  );
}

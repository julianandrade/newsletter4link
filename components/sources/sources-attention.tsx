"use client";

import { radarButtonClass } from "@/components/radar/primitives";
import type { AttentionLine } from "@/lib/sources/summary";
import type { SourcesTab } from "@/lib/sources/tabs";
import { cn } from "@/lib/utils";

/**
 * Everything wrong with the sources, in one box above the tabs.
 *
 * There were two boxes: failing feeds on the page and quiet email sources inside the email
 * manager, half a screen apart, so "is anything wrong" had two answers in two places. The
 * box takes the border of its worst line, and each line carries the jump to the tab where
 * the fix is.
 */
export function SourcesAttention({
  lines,
  onJump,
}: {
  lines: AttentionLine[];
  onJump: (tab: SourcesTab) => void;
}) {
  if (lines.length === 0) return null;

  const worst = lines.some((line) => line.tone === "err") ? "err" : "warn";

  return (
    <div
      className={cn(
        "radar-enter mb-5 overflow-hidden rounded-xl border bg-radar-surface",
        worst === "err" ? "border-radar-err" : "border-radar-warn"
      )}
    >
      {lines.map((line, index) => (
        <div
          key={line.tab}
          className={cn(
            "flex flex-wrap items-start gap-3 px-4 py-3",
            index > 0 && "border-t border-radar-line2"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              line.tone === "err" ? "bg-radar-err" : "bg-radar-warn"
            )}
          />
          <p className="m-0 min-w-0 flex-1 text-[12.5px] text-radar-ink2">
            <span className="font-semibold text-radar-ink">{line.headline}</span>{" "}
            {line.detail}
          </p>
          <button
            type="button"
            onClick={() => onJump(line.tab)}
            className={radarButtonClass("ghost", "sm")}
          >
            {line.jumpLabel}
          </button>
        </div>
      ))}
    </div>
  );
}

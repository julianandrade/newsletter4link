"use client";

/**
 * What is in the edition, in the order it will send.
 *
 * Lifted out of `edition-article-picker.tsx`, which paired it with a second column
 * holding the whole waiting pool. That pairing is what the split undoes: choosing from
 * a hundred and twenty-eight rows and arranging a dozen are different tasks, and giving
 * them equal width meant neither had enough.
 *
 * Position is the only thing this owns. It never fetches, and it never decides what may
 * be added: it is handed a list and reports the list it should become.
 *
 * Reordering keeps the pointer drag it has always had, plus the arrows beside it. The
 * drag is native HTML5 rather than a library because the list is short and always
 * on screen, and the arrows are what make it reachable without a pointer at all.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import { RadarButton, SectionLabel } from "@/components/radar/primitives";
import { EmptyNote } from "@/components/radar/controls";
import { cn } from "@/lib/utils";

export function EditionOrderList<T extends { id: string }>({
  items,
  onChange,
  renderItem,
  title,
  empty,
  className,
}: {
  items: T[];
  /** The list this should become. Ordering and removal both report through it. */
  onChange: (next: T[]) => void;
  renderItem: (item: T) => React.ReactNode;
  /** Accessible name for a row's remove button, e.g. the article's headline. */
  title: (item: T) => string;
  empty: string;
  className?: string;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));

  if (items.length === 0) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <EmptyNote>{empty}</EmptyNote>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline gap-2">
        <SectionLabel>In this edition</SectionLabel>
        <span className="text-[11.5px] text-radar-ink3">
          Drag a row, or use the arrows, to change the order it sends in
        </span>
      </div>

      <ul className="m-0 list-none rounded-xl border border-radar-line bg-radar-surface p-0">
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
              if (draggedIndex === null || draggedIndex === index) return;
              // Reorder as the pointer crosses a row rather than on drop, so the list
              // under the cursor is the list that will be committed.
              move(draggedIndex, index);
              setDraggedIndex(index);
            }}
            onDragEnd={() => setDraggedIndex(null)}
            className={cn(
              "group flex items-start gap-2.5 border-b border-radar-line2 px-3 py-2.5 last:border-b-0",
              draggedIndex === index && "opacity-50"
            )}
          >
            <GripVertical
              aria-hidden="true"
              className="mt-1 h-4 w-4 shrink-0 cursor-grab text-radar-ink3 active:cursor-grabbing"
            />

            <span className="font-num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-radar-surface2 text-[11px] text-radar-accent">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">{renderItem(item)}</div>

            <div className="flex shrink-0 items-center gap-0.5">
              <RadarButton
                size="sm"
                variant="ghost"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${title(item)} up`}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </RadarButton>
              <RadarButton
                size="sm"
                variant="ghost"
                onClick={() => move(index, index + 1)}
                disabled={index === items.length - 1}
                aria-label={`Move ${title(item)} down`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </RadarButton>
              <RadarButton
                size="sm"
                variant="ghost"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${title(item)} from this edition`}
                className="text-radar-ink3 hover:text-radar-err"
              >
                <X className="h-3.5 w-3.5" />
              </RadarButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, LayoutList, Table2 } from "lucide-react";
import { ChipGroup } from "@/components/radar/primitives";

export type LayoutType = "cards" | "compact" | "table";

interface LayoutToggleProps {
  value: LayoutType;
  onChange: (layout: LayoutType) => void;
  options?: LayoutType[];
  className?: string;
}

const LAYOUT_ICON: Record<LayoutType, React.ReactNode> = {
  cards: <LayoutGrid className="h-[13px] w-[13px]" strokeWidth={1.6} />,
  compact: <LayoutList className="h-[13px] w-[13px]" strokeWidth={1.6} />,
  table: <Table2 className="h-[13px] w-[13px]" strokeWidth={1.6} />,
};

const LAYOUT_LABEL: Record<LayoutType, string> = {
  cards: "Cards",
  compact: "Compact",
  table: "Table",
};

/** Density control, sharing the segmented chip shape used across the app. */
export function LayoutToggle({
  value,
  onChange,
  options = ["cards", "compact", "table"],
}: LayoutToggleProps) {
  return (
    <ChipGroup<LayoutType>
      label="Layout"
      kind="options"
      value={value}
      onChange={onChange}
      options={options.map((layout) => ({
        value: layout,
        label: (
          <span className="flex items-center gap-1.5">
            {LAYOUT_ICON[layout]}
            <span className="hidden sm:inline">{LAYOUT_LABEL[layout]}</span>
            <span className="sr-only sm:hidden">{LAYOUT_LABEL[layout]}</span>
          </span>
        ),
      }))}
    />
  );
}

/**
 * Custom hook to persist layout preference in localStorage
 */
export function useLayoutPreference(
  key: string,
  defaultValue: LayoutType = "cards"
): [LayoutType, (layout: LayoutType) => void] {
  const [layout, setLayout] = useState<LayoutType>(defaultValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored && (stored === "cards" || stored === "compact" || stored === "table")) {
      setLayout(stored as LayoutType);
    }
    setIsHydrated(true);
  }, [key]);

  // Persist to localStorage when layout changes
  const setLayoutWithPersist = useCallback(
    (newLayout: LayoutType) => {
      setLayout(newLayout);
      localStorage.setItem(key, newLayout);
    },
    [key]
  );

  // Return default until hydrated to avoid hydration mismatch
  return [isHydrated ? layout : defaultValue, setLayoutWithPersist];
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, LayoutList, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type LayoutType = "cards" | "compact" | "table";

interface LayoutToggleProps {
  value: LayoutType;
  onChange: (layout: LayoutType) => void;
  options?: LayoutType[];
  className?: string;
}

const layoutIcons: Record<LayoutType, React.ReactNode> = {
  cards: <LayoutGrid className="h-4 w-4" />,
  compact: <LayoutList className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />,
};

const layoutLabels: Record<LayoutType, string> = {
  cards: "Cards",
  compact: "Compact",
  table: "Table",
};

export function LayoutToggle({
  value,
  onChange,
  options = ["cards", "compact", "table"],
  className,
}: LayoutToggleProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 bg-muted rounded-lg", className)}>
      {options.map((layout) => (
        <Button
          key={layout}
          variant={value === layout ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onChange(layout)}
          className={cn(
            "h-8 px-3 gap-2",
            value === layout && "bg-background shadow-sm"
          )}
          title={layoutLabels[layout]}
        >
          {layoutIcons[layout]}
          <span className="hidden sm:inline">{layoutLabels[layout]}</span>
        </Button>
      ))}
    </div>
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

"use client";

import { useCallback, useSyncExternalStore } from "react";
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

function isLayoutType(value: string | null): value is LayoutType {
  return value === "cards" || value === "compact" || value === "table";
}

// Notify subscribers within the same tab when we write to localStorage (the
// native "storage" event only fires in *other* tabs).
const layoutListeners = new Set<() => void>();

function emitLayoutChange() {
  for (const listener of layoutListeners) listener();
}

/**
 * Custom hook to persist layout preference in localStorage
 */
export function useLayoutPreference(
  key: string,
  defaultValue: LayoutType = "cards"
): [LayoutType, (layout: LayoutType) => void] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) onStoreChange();
    };
    window.addEventListener("storage", onStorage);
    layoutListeners.add(onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      layoutListeners.delete(onStoreChange);
    };
  }, [key]);

  const getSnapshot = useCallback((): LayoutType => {
    const stored = localStorage.getItem(key);
    return isLayoutType(stored) ? stored : defaultValue;
  }, [key, defaultValue]);

  // Server (and initial hydration) snapshot is always the default, matching the
  // server-rendered output and avoiding a hydration mismatch.
  const getServerSnapshot = useCallback((): LayoutType => defaultValue, [defaultValue]);

  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Persist to localStorage when layout changes
  const setLayoutWithPersist = useCallback(
    (newLayout: LayoutType) => {
      localStorage.setItem(key, newLayout);
      emitLayoutChange();
    },
    [key]
  );

  return [layout, setLayoutWithPersist];
}

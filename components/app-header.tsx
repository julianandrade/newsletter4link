"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchIcon } from "@/components/radar/icons";
import { Kbd } from "@/components/radar/primitives";
import { useRadarNav } from "@/components/radar/nav-context";

interface AppHeaderProps {
  /**
   * Legacy page title. Screens converted to the editorial layout carry their own
   * h1 in the body and pass nothing, so the bar stays clean.
   */
  title?: React.ReactNode;
  /**
   * Drops the search shortcut. Set on the Search screen itself, where the bar
   * would otherwise link to the page you are already on.
   */
  hideSearch?: boolean;
}

/** Every theme the app ships, grouped so the list stays navigable at 19 entries. */
const THEME_GROUPS: { label: string; themes: [string, string][] }[] = [
  {
    label: "System",
    themes: [
      ["light", "Light"],
      ["dark", "Dark"],
      ["system", "System"],
    ],
  },
  {
    label: "Dark",
    themes: [
      ["linkroad-dark", "Linkroad Dark"],
      ["linkroad-slate", "Slate"],
      ["linkroad-ocean", "Ocean"],
      ["linkroad-ember", "Ember"],
      ["linkroad-print", "Print"],
      ["linkroad-print-graphite", "Print Graphite"],
      ["linkroad-print-carbon", "Print Carbon"],
    ],
  },
  {
    label: "Light",
    themes: [
      ["linkroad-light", "Linkroad Light"],
      ["linkroad-light-sand", "Light Sand"],
      ["linkroad-light-mist", "Light Mist"],
      ["linkroad-light-azure", "Light Azure"],
      ["linkroad-light-citrus", "Light Citrus"],
    ],
  },
  {
    label: "Mixed",
    themes: [
      ["linkroad-mix-slate", "Mix Slate"],
      ["linkroad-mix-ocean", "Mix Ocean"],
      ["linkroad-mix-ember", "Mix Ember"],
      ["linkroad-mix-sand", "Mix Sand"],
    ],
  },
];

const DARK_THEMES = new Set([
  "dark",
  "linkroad-dark",
  "linkroad-slate",
  "linkroad-ocean",
  "linkroad-ember",
  "linkroad-print",
  "linkroad-print-graphite",
  "linkroad-print-carbon",
  "linkroad-mix-slate",
  "linkroad-mix-ocean",
  "linkroad-mix-ember",
]);

export function AppHeader({ title, hideSearch = false }: AppHeaderProps) {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const router = useRouter();
  const { openNav } = useRadarNav();
  // The active theme is unknown during SSR, so the icon stays neutral until
  // mount. Branching earlier produces a hydration mismatch.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const setThemePreference = async (value: string) => {
    setTheme(value);
    try {
      await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", theme: value }),
      });
    } catch {
      // Persistence failure must not block the visual change.
    }
  };

  // Command-K jumps to search from anywhere, as the search affordance promises.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        router.push("/dashboard/search");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const isDark =
    mounted && (DARK_THEMES.has(theme ?? "") || resolvedTheme === "dark");

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-radar-line bg-radar-bg px-4 sm:px-6">
      <button
        type="button"
        onClick={openNav}
        aria-label="Open navigation"
        className="-ml-1 shrink-0 rounded-md p-2 text-radar-ink2 transition-colors hover:bg-radar-surface2 hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {title ? (
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-radar-ink">
          {title}
        </h1>
      ) : hideSearch ? (
        // Keeps the bar from reading as an unfinished strip on the Search screen.
        <span className="flex items-center gap-2.5 text-[13px] font-medium text-radar-ink2">
          <SearchIcon className="shrink-0 text-radar-ink3" />
          Web search
        </span>
      ) : (
        <Link
          href="/dashboard/search"
          className={cn(
            "flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-radar-line bg-radar-surface2 pr-2.5 pl-3 text-[13px] text-radar-ink3 transition-colors",
            "hover:border-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
            "sm:max-w-[520px]"
          )}
        >
          <SearchIcon className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {/* This shortcut lands on Search, which queries the live web, not our archive. */}
            Ask the web
            <span className="hidden sm:inline">
              : &ldquo;agentic AI in banking, last 6 months&rdquo;
            </span>
          </span>
          <span className="hidden shrink-0 sm:inline">
            <Kbd>⌘K</Kbd>
          </span>
        </Link>
      )}

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Change theme"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-radar-line bg-radar-surface text-[13px] text-radar-ink2 transition-colors hover:border-radar-ink3 hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
          >
            {/* Drawn, not a glyph: a filled disc for dark, a rayed disc for light. */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden="true"
            >
              {isDark ? (
                <path
                  d="M13.5 9.6A5.7 5.7 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"
                  fill="currentColor"
                  stroke="none"
                />
              ) : (
                <>
                  <circle cx="8" cy="8" r="3.1" />
                  <path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1" />
                </>
              )}
            </svg>
            <span className="sr-only">Change theme</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
          {THEME_GROUPS.map((group, index) => (
            <div key={group.label}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs">{group.label}</DropdownMenuLabel>
              {group.themes.map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setThemePreference(value)}
                  className={cn(
                    "cursor-pointer",
                    theme === value && "font-semibold"
                  )}
                >
                  {label}
                  {theme === value && <span className="ml-auto text-xs">●</span>}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/dashboard/settings/theme">Theme gallery</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

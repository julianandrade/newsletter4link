"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { setTheme } = useTheme();

  const setThemePreference = async (value: string) => {
    setTheme(value);
    try {
      await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", theme: value }),
      });
    } catch {
      // Ignore persistence errors for now
    }
  };

  return (
    <header className="app-navbar sticky top-0 z-30 flex h-16 items-center justify-between border-b px-6">
      {/* Page Title */}
      <h1 className="text-xl font-semibold">{title}</h1>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Search Button (placeholder) */}
        <Button variant="outline" size="sm" className="gap-2">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setThemePreference("light")}>
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("dark")}>
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("system")}>
              System
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-dark")}>
              Linkroad Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-slate")}>
              Linkroad Slate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-ocean")}>
              Linkroad Ocean
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-ember")}>
              Linkroad Ember
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-print")}>
              Linkroad Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-print-graphite")}>
              Linkroad Print Graphite
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-print-carbon")}>
              Linkroad Print Carbon
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-light")}>
              Linkroad Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-light-sand")}>
              Linkroad Light Sand
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-light-mist")}>
              Linkroad Light Mist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-light-azure")}>
              Linkroad Light Azure
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-light-citrus")}>
              Linkroad Light Citrus
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-mix-slate")}>
              Linkroad Mix Slate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-mix-ocean")}>
              Linkroad Mix Ocean
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-mix-ember")}>
              Linkroad Mix Ember
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setThemePreference("linkroad-mix-sand")}>
              Linkroad Mix Sand
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings/theme">Theme Gallery</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

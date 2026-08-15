"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { RadarNavContext } from "@/components/radar/nav-context";
import type { Identity } from "@/lib/auth/identity";

interface DashboardShellProps {
  children: React.ReactNode;
  /** Only `email` is read here. Narrowed from Supabase's `User` so the shell does not
   * depend on which identity provider issued the session: see lib/auth/identity.ts. */
  user: Identity;
  /**
   * Passed through to the sidebar so it can show the platform area. Resolved in
   * `app/dashboard/layout.tsx`, because the allowlist it comes from is server-only.
   */
  isSuperAdmin?: boolean;
}

const COLLAPSE_KEY = "radar:nav-collapsed";

export function DashboardShell({
  children,
  user,
  isSuperAdmin = false,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  // Restore the rail preference after mount so SSR markup stays stable.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private mode or blocked storage: the default is fine.
    }
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Route changes close the mobile drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Escape closes the drawer, and a locked body stops background scroll.
  useEffect(() => {
    if (!mobileOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const navState = useMemo(() => ({ openNav: () => setMobileOpen(true) }), []);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Persistence is a convenience, never a requirement.
      }
      return next;
    });
  };

  return (
    <div className="radar-root flex min-h-screen">
      <AppSidebar
        // The rail only narrows on desktop; the mobile drawer is always full width.
        collapsed={isDesktop ? collapsed : false}
        onToggle={toggleCollapsed}
        user={user}
        isSuperAdmin={isSuperAdmin}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[rgba(14,21,23,0.28)] lg:hidden"
        />
      )}

      <RadarNavContext.Provider value={navState}>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </RadarNavContext.Provider>
    </div>
  );
}

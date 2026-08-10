"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { OrgSwitcher } from "@/components/org-switcher";
import { JobIndicator } from "@/components/job-indicator";
import { RadarIcon, RadarMark, type RadarIconName } from "@/components/radar/icons";
import type { User } from "@supabase/supabase-js";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: User;
  /** Live counts rendered beside primary nav entries. */
  counts?: Partial<Record<"feed" | "editions" | "sources", number>>;
  /**
   * Whether to show the platform area.
   *
   * Computed on the server and passed down, because `SUPERADMIN_EMAILS` must not reach the
   * client: prefixing it `NEXT_PUBLIC_` to read it here would publish the list of platform
   * administrators to anyone who opens the bundle. A boolean is safe to send; the list is not.
   *
   * This only controls a link. The actual gate is `getPlatformContext()` in the platform
   * layout and in every platform route, so a hand-typed URL is refused whatever this says.
   */
  isSuperAdmin?: boolean;
  /** Below lg the sidebar is an off-canvas drawer driven by the header. */
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

/** Primary destinations, in the order the design fixes. */
const PRIMARY: { key: RadarIconName; href: string; label: string }[] = [
  // RQ-005 AC-4.4: one entry for the week's work. The Feed became the proposal,
  // and the review queue is a view of it rather than a second destination.
  { key: "feed", href: "/dashboard", label: "This week" },
  { key: "trends", href: "/dashboard/trends", label: "Trends" },
  { key: "search", href: "/dashboard/search", label: "Search" },
  { key: "editions", href: "/dashboard/send", label: "Editions" },
  { key: "sources", href: "/dashboard/sources", label: "Sources" },
  { key: "analytics", href: "/dashboard/analytics", label: "Analytics" },
  { key: "settings", href: "/dashboard/settings", label: "Settings" },
];

/** Everything else, grouped out of the primary rhythm. */
const WORKSPACE = [
  // "Review queue" was here, pointing at a second copy of the same list. It is
  // gone deliberately: two entries leading to one list under two names is what
  // RQ-005 AC-4.4 forbids. The queue lives at /dashboard?view=queue.
  // Every article, in every state. The only route to a rejected or discarded story, and
  // therefore the only way to undo either without an API call.
  { href: "/dashboard/articles", label: "Articles" },
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/curation", label: "Curation jobs" },
  { href: "/dashboard/generate", label: "Ghost Writer" },
  { href: "/dashboard/templates", label: "Templates" },
  // The closing slot's library: the joke, note or spotlight an edition ends on.
  { href: "/dashboard/asides", label: "One more thing" },
  { href: "/dashboard/subscribers", label: "Subscribers" },
];

/**
 * The platform area, appended to WORKSPACE only for a superadmin.
 *
 * Kept out of WORKSPACE rather than filtered inside it, so a future edit to that list
 * cannot accidentally show this to everyone.
 */
const PLATFORM_ENTRY = { href: "/dashboard/platform", label: "Organizations" };

export function AppSidebar({
  collapsed,
  onToggle,
  user,
  counts,
  isSuperAdmin = false,
  mobileOpen = false,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // /dashboard must match exactly, or it would light up on every child route.
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const initials =
    (user.email ?? "?")
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "?";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          // Off-canvas drawer on small screens, sticky rail from lg up.
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] shrink-0 flex-col",
          "border-r border-radar-line bg-radar-bg",
          "transition-transform duration-200 ease-out",
          // `invisible` keeps the closed drawer's links out of the tab order;
          // lg:visible restores the rail on desktop regardless of drawer state.
          mobileOpen
            ? "visible translate-x-0"
            : "invisible -translate-x-full lg:visible lg:translate-x-0",
          "lg:sticky lg:top-0 lg:z-40 lg:self-start lg:transition-[width] lg:duration-200",
          collapsed ? "lg:w-[62px]" : "lg:w-[248px]"
        )}
        onClick={(event) => {
          // Any nav click inside the mobile drawer should close it.
          if (
            onNavigate &&
            (event.target as HTMLElement).closest("a[href]") !== null
          ) {
            onNavigate();
          }
        }}
      >
        {/* Wordmark */}
        <div className="flex h-[60px] items-center gap-2.5 border-b border-radar-line2 px-[18px]">
          <RadarMark />
          {!collapsed && (
            <span className="text-[14.5px] font-semibold tracking-[-0.01em] whitespace-nowrap text-radar-ink">
              AI Radar
            </span>
          )}
        </div>

        {/* Organization */}
        <div className="border-b border-radar-line2">
          <OrgSwitcher collapsed={collapsed} />
        </div>

        <nav
          aria-label="Primary"
          className="flex min-h-0 flex-1 flex-col gap-px overflow-x-hidden overflow-y-auto px-2 py-2.5"
        >
          {PRIMARY.map((item) => {
            const active = isActive(item.href);
            const count = counts?.[item.key as keyof typeof counts];

            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-[11px] rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-radar-surface2 font-semibold text-radar-ink"
                    : "font-medium text-radar-ink2 hover:bg-radar-surface2 hover:text-radar-ink"
                )}
              >
                <RadarIcon name={item.key} className="shrink-0 opacity-90" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left whitespace-nowrap">
                      {item.label}
                    </span>
                    {count !== undefined && count > 0 && (
                      <span className="font-num text-[10.5px] tabular-nums text-radar-ink3">
                        {count}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {count !== undefined && count > 0 ? ` · ${count}` : ""}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}

          {!collapsed && (
            <div className="mt-4 mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-radar-ink3">
              Workspace
            </div>
          )}
          {collapsed && (
            <div
              aria-hidden="true"
              className="mx-auto my-3 h-px w-6 bg-radar-line2"
            />
          )}

          {(isSuperAdmin ? [...WORKSPACE, PLATFORM_ENTRY] : WORKSPACE).map((item) => {
            const active = isActive(item.href);

            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-radar-surface2 font-semibold text-radar-ink"
                    : "text-radar-ink2 hover:bg-radar-surface2 hover:text-radar-ink"
                )}
              >
                <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
                  <span
                    className={cn(
                      "h-[3px] w-[3px] rounded-full",
                      active ? "bg-radar-accent" : "bg-radar-ink3"
                    )}
                  />
                </span>
                {!collapsed && (
                  <span className="whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </nav>

        {/* Jobs, account, collapse */}
        <div className="flex flex-col gap-1 border-t border-radar-line2 px-2 py-2.5">
          <JobIndicator collapsed={collapsed} />

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mx-auto flex h-9 w-9 items-center justify-center rounded-md text-radar-ink3 transition-colors hover:bg-radar-surface2 hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Sign out</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground">Sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2.5 px-1.5 py-1">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-radar-primary text-[10px] font-semibold tracking-[0.02em] text-white"
              >
                {initials}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-radar-ink2">
                {user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out"
                className="shrink-0 rounded p-1 text-radar-ink3 transition-colors hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="sr-only">Sign out</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className={cn(
              // The rail only collapses from lg up, so hide the control below it.
              "hidden items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-radar-ink3 transition-colors lg:flex",
              "hover:bg-radar-surface2 hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
              collapsed && "justify-center px-0"
            )}
          >
            <span aria-hidden="true" className="w-4 text-center">
              {collapsed ? "›" : "‹"}
            </span>
            {!collapsed && <span>Collapse</span>}
            <span className="sr-only">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </span>
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

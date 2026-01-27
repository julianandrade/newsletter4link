"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  FileText,
  Briefcase,
  Send,
  ChevronLeft,
  ChevronRight,
  History,
  Layout,
  Settings,
  LogOut,
  BarChart3,
  Users,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { OrgSwitcher } from "@/components/org-switcher";
import type { User } from "@supabase/supabase-js";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: User;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/review", label: "Review Articles", icon: FileText },
  { href: "/dashboard/projects", label: "Projects", icon: Briefcase },
  { href: "/dashboard/curation", label: "Curation", icon: History },
  { href: "/dashboard/search", label: "Trend Radar", icon: Search },
  { href: "/dashboard/generate", label: "Ghost Writer", icon: Sparkles },
  { href: "/dashboard/templates", label: "Templates", icon: Layout },
  { href: "/dashboard/subscribers", label: "Subscribers", icon: Users },
  { href: "/dashboard/send", label: "Send Newsletter", icon: Send },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ collapsed, onToggle, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          {!collapsed && (
            <span className="text-lg font-semibold">Newsletter</span>
          )}
        </div>

        {/* Organization Switcher */}
        <div className="border-b">
          <OrgSwitcher collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          <TooltipProvider delayDuration={0}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-md mx-auto",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </TooltipProvider>
        </nav>

        {/* User & Toggle */}
        <div className="border-t p-2 space-y-2">
          {/* User Info */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="w-full justify-center"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground">Sign out</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="px-2 py-1">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="w-full justify-start px-0 h-auto py-1 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3 w-3 mr-2" />
                Sign out
              </Button>
            </div>
          )}

          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn("w-full", collapsed && "justify-center")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}

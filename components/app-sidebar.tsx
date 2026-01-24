"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/review", label: "Review Articles", icon: FileText },
  { href: "/dashboard/projects", label: "Projects", icon: Briefcase },
  { href: "/dashboard/curation", label: "Curation", icon: History },
  { href: "/dashboard/templates", label: "Templates", icon: Layout },
  { href: "/dashboard/send", label: "Send Newsletter", icon: Send },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();

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

        {/* Toggle Button */}
        <div className="border-t p-2">
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

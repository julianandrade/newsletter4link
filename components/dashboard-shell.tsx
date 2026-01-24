"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface DashboardShellProps {
  children: React.ReactNode;
  user: User;
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={user}
      />
      <main
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {children}
      </main>
    </div>
  );
}

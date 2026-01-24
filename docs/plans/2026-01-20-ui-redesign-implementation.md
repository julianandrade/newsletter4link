# UI/UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete redesign of the newsletter dashboard with modern minimal aesthetic, collapsible sidebar, and improved UX.

**Architecture:** Replace current basic layout with shadcn-admin style layout featuring collapsible sidebar + top header. Remove subscriber management (internal use only). Update all pages with new component styling.

**Tech Stack:** Next.js 16, React 19, TailwindCSS 4, shadcn/ui components

---

## Task 1: Install Additional shadcn/ui Components

**Files:**
- Modify: `package.json`
- Run: shadcn CLI commands

**Step 1: Install required shadcn components**

Run:
```bash
cd /home/julian/git/work/newsletter4Link/.worktrees/ui-redesign
npx shadcn@latest add dialog dropdown-menu command scroll-area avatar switch tabs
```

Expected: Components added to `components/ui/`

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui components for redesign"
```

---

## Task 2: Create Theme Provider and Color Tokens

**Files:**
- Create: `components/theme-provider.tsx`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Step 1: Create theme provider component**

Create `components/theme-provider.tsx`:
```tsx
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

**Step 2: Install next-themes**

Run:
```bash
npm install next-themes
```

**Step 3: Update globals.css with new color tokens**

Replace color variables in `app/globals.css`:
```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 9%;
    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 96%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 45%;
    --accent: 214 100% 97%;
    --accent-foreground: 217 91% 60%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 90%;
    --input: 0 0% 90%;
    --ring: 217 91% 60%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 4%;
    --foreground: 0 0% 98%;
    --card: 0 0% 7%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 7%;
    --popover-foreground: 0 0% 98%;
    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 15%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 15%;
    --muted-foreground: 0 0% 64%;
    --accent: 217 91% 15%;
    --accent-foreground: 217 91% 70%;
    --destructive: 0 62% 50%;
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 15%;
    --input: 0 0% 15%;
    --ring: 217 91% 60%;
  }
}
```

**Step 4: Update root layout with ThemeProvider**

Modify `app/layout.tsx` to wrap children with ThemeProvider.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add theme provider and update color tokens"
```

---

## Task 3: Create App Sidebar Component

**Files:**
- Create: `components/app-sidebar.tsx`

**Step 1: Create the sidebar component**

Create `components/app-sidebar.tsx`:
```tsx
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
  { href: "/dashboard/send", label: "Send Newsletter", icon: Send },
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
```

**Step 2: Commit**

```bash
git add components/app-sidebar.tsx
git commit -m "feat: create collapsible sidebar component"
```

---

## Task 4: Create App Header Component

**Files:**
- Create: `components/app-header.tsx`

**Step 1: Create the header component**

Create `components/app-header.tsx`:
```tsx
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

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { setTheme, theme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
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
            <DropdownMenuItem onClick={() => setTheme("light")}>
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add components/app-header.tsx
git commit -m "feat: create app header with theme toggle"
```

---

## Task 5: Update Dashboard Layout

**Files:**
- Modify: `app/dashboard/layout.tsx`

**Step 1: Update the dashboard layout**

Replace `app/dashboard/layout.tsx`:
```tsx
"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
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
```

**Step 2: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat: update dashboard layout with new sidebar"
```

---

## Task 6: Redesign Dashboard Home Page

**Files:**
- Modify: `app/dashboard/page.tsx`

**Step 1: Rewrite the dashboard page**

Replace `app/dashboard/page.tsx` with new design featuring:
- Quick action cards (Run Curation, Review Articles, Send Newsletter)
- Metrics cards (Pending, Approved, Editions, Last Sent)
- Activity feed section

**Step 2: Test the page loads**

Run: `npm run dev`
Navigate to: `http://localhost:3000/dashboard`
Expected: New dashboard layout renders

**Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: redesign dashboard home page"
```

---

## Task 7: Redesign Article Review Page

**Files:**
- Modify: `app/dashboard/review/page.tsx`

**Step 1: Rewrite the review page**

Replace `app/dashboard/review/page.tsx` with new design featuring:
- Header with filters and pending count
- 2-column grid of medium article cards
- Score badges (color coded)
- Approve/Reject actions with animations

**Step 2: Test the page loads**

Navigate to: `http://localhost:3000/dashboard/review`
Expected: New review layout renders

**Step 3: Commit**

```bash
git add app/dashboard/review/page.tsx
git commit -m "feat: redesign article review page"
```

---

## Task 8: Redesign Projects Page

**Files:**
- Modify: `app/dashboard/projects/page.tsx`

**Step 1: Rewrite the projects page**

Replace `app/dashboard/projects/page.tsx` with new design featuring:
- Header with Add Project button
- 3-column grid of project cards
- Featured badge display
- Edit/Delete actions with dialog

**Step 2: Test the page loads**

Navigate to: `http://localhost:3000/dashboard/projects`
Expected: New projects layout renders

**Step 3: Commit**

```bash
git add app/dashboard/projects/page.tsx
git commit -m "feat: redesign projects page"
```

---

## Task 9: Redesign Send Newsletter Page

**Files:**
- Modify: `app/dashboard/send/page.tsx`

**Step 1: Rewrite the send page**

Replace `app/dashboard/send/page.tsx` with new design featuring:
- Two-panel layout (preview left, actions right)
- Preview container with viewport toggle
- Test email input
- Send confirmation dialog

**Step 2: Test the page loads**

Navigate to: `http://localhost:3000/dashboard/send`
Expected: New send layout renders

**Step 3: Commit**

```bash
git add app/dashboard/send/page.tsx
git commit -m "feat: redesign send newsletter page"
```

---

## Task 10: Remove Subscribers Page and Clean Up

**Files:**
- Delete: `app/dashboard/subscribers/page.tsx`
- Modify: `app/api/subscribers/` (keep for internal use but no UI)

**Step 1: Delete the subscribers page**

```bash
rm app/dashboard/subscribers/page.tsx
rmdir app/dashboard/subscribers
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: remove subscriber management UI (internal use only)"
```

---

## Task 11: Update Home Page

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update landing page**

Update `app/page.tsx` with cleaner design and redirect to dashboard.

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: update home page design"
```

---

## Task 12: Final Testing and Cleanup

**Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors

**Step 2: Manual testing checklist**

- [ ] Sidebar collapses and expands
- [ ] Theme toggle works (light/dark)
- [ ] Dashboard metrics display
- [ ] Review page shows articles
- [ ] Projects page allows CRUD
- [ ] Send page preview renders
- [ ] All navigation works
- [ ] Responsive on mobile

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete UI/UX redesign"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Install shadcn components | package.json |
| 2 | Theme provider + colors | globals.css, layout.tsx |
| 3 | App sidebar | components/app-sidebar.tsx |
| 4 | App header | components/app-header.tsx |
| 5 | Dashboard layout | app/dashboard/layout.tsx |
| 6 | Dashboard page | app/dashboard/page.tsx |
| 7 | Review page | app/dashboard/review/page.tsx |
| 8 | Projects page | app/dashboard/projects/page.tsx |
| 9 | Send page | app/dashboard/send/page.tsx |
| 10 | Remove subscribers | app/dashboard/subscribers/ |
| 11 | Home page | app/page.tsx |
| 12 | Final testing | - |

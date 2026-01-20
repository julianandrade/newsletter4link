# Newsletter4Link UI/UX Redesign

> Design validated: January 2026

## Overview

Complete redesign of the newsletter dashboard with a modern minimal aesthetic inspired by shadcn-admin template. Removes subscriber management (internal use only) and focuses on content curation workflow.

## Design Principles

- **Modern minimal** - Clean lines, generous whitespace, subtle shadows
- **Blue accents** - Neutral grayscale base with blue interactive elements
- **Full-width content** - Maximize working space
- **Responsive** - Works on desktop and mobile
- **Light/dark mode** - Theme toggle support

---

## Layout Structure

### Navigation

**Collapsible Sidebar (Left)**
- Icon-only when collapsed, full labels when expanded
- Toggle button to expand/collapse
- Navigation items:
  - Dashboard (Home icon)
  - Review Articles (FileText icon)
  - Projects (Briefcase icon)
  - Send Newsletter (Send icon)
- Active state: blue accent background

**Top Header Bar**
- Page title / breadcrumbs (left)
- Global search command (⌘K) (center)
- Theme toggle (right)
- User menu (right)

**Main Content Area**
- Full width when sidebar collapsed
- Reduced width when sidebar expanded
- Consistent padding and max-width constraints

---

## Pages

### 1. Dashboard

**Top Section: Quick Actions**
Three action cards in a horizontal row:

| Card | Icon | Label | Action |
|------|------|-------|--------|
| Run Curation | RefreshCw | "Run Curation" | Primary blue button, triggers `/api/curation/collect` |
| Review Articles | FileText | "Review Articles" | Badge shows pending count, links to `/dashboard/review` |
| Send Newsletter | Send | "Send Newsletter" | Shows status (ready/not ready), links to `/dashboard/send` |

**Middle Section: Metrics**
Four metric cards in a 2x2 or 4-column grid:

| Metric | Value | Subtext |
|--------|-------|---------|
| Pending Articles | Number | "awaiting review" |
| Approved This Week | Number | "articles approved" |
| Editions Sent | Number | "total newsletters" |
| Last Sent | Date | "most recent" |

Card design:
- Large number (24-32px font)
- Muted subtext below
- Subtle background, rounded corners
- Optional: trend indicator (up/down arrow)

**Bottom Section: Activity Feed**
Vertical timeline of recent activity:
- Icon + description + relative timestamp
- Activity types:
  - Article approved: "[Title]"
  - Curation completed: "12 new articles"
  - Newsletter sent: "Edition #5"
  - Project added: "[Name]"
- Shows last 10 items
- "View all activity" link at bottom

---

### 2. Review Articles

**Header**
- Page title: "Review Articles"
- Pending count badge
- Filter controls:
  - Score range dropdown (All, 8+, 6-8, <6)
  - Sort by dropdown (Date, Score)

**Article Cards**
Medium-sized cards in 2-column grid (1 column on mobile)

Card anatomy:
```
┌─────────────────────────────────────┐
│                           [8.5 ★]  │  ← Score badge (top-right)
│ Article Title Here                  │  ← Bold, linked
│ TechCrunch • Jan 15, 2026          │  ← Source + date (muted)
│                                     │
│ AI-generated summary of the article │  ← Summary text
│ content goes here. Can be 2-3 lines │
│ with expand option for longer...    │
│                                     │
│ [AI] [Tech] [Startup]              │  ← Category badges
│                                     │
│ [✏️ Edit] [✓ Approve] [✗ Reject]  │  ← Action buttons
└─────────────────────────────────────┘
```

Score badge colors:
- Green: 8.0+
- Yellow: 6.0-7.9
- Gray: <6.0

Interactions:
- Hover: subtle shadow lift
- Approve: card slides out with green flash
- Reject: card slides out with fade
- Edit: inline summary editing or modal

---

### 3. Projects

**Header**
- Page title: "Projects"
- "Add Project" button (opens modal)

**Project Cards**
3-column grid on large screens, 2 on medium, 1 on mobile

Card anatomy:
```
┌─────────────────────────────────────┐
│ [★ Featured]                        │  ← Featured badge (if applicable)
│                                     │
│ Project Name                        │  ← Bold title
│ Engineering Team                    │  ← Team badge
│                                     │
│ January 2026                        │  ← Date
│                                     │
│ Brief description of the project    │  ← Description text
│ and its impact on the company.      │
│                                     │
│ [⭐ Feature] [✏️ Edit] [🗑️ Delete] │  ← Actions
└─────────────────────────────────────┘
```

**Add/Edit Project Modal**
Form fields:
- Name (required)
- Team (required)
- Date (required)
- Description (required)
- Impact/Results (optional)
- Image URL (optional)

---

### 4. Send Newsletter

**Two-Panel Layout**

**Left Panel: Preview (60% width)**
- Email-like container with white background
- Viewport toggle: Desktop / Mobile
- Live preview of newsletter content:
  - Header with newsletter branding
  - Approved articles section
  - Featured projects section
  - Footer with unsubscribe link

**Right Panel: Actions (40% width)**
- Summary card:
  - "5 articles ready"
  - "2 featured projects"
- Divider
- Test email section:
  - Email input field
  - "Send Test" button
- Divider
- Send section:
  - "Send to all recipients" primary button
  - Confirmation modal before send:
    - "Are you sure?"
    - "This will send to [X] recipients"
    - Cancel / Send buttons

---

## Component Library

Using shadcn/ui components with customizations:

| Component | Usage |
|-----------|-------|
| Sidebar | Collapsible navigation |
| Button | Actions (primary blue, secondary gray) |
| Card | Metrics, articles, projects |
| Badge | Scores, categories, status |
| Input | Forms, search |
| Dialog | Modals for confirmation, editing |
| DropdownMenu | Filters, user menu |
| Command | Global search (⌘K) |
| Separator | Dividers |
| Skeleton | Loading states |
| Sonner | Toast notifications |

---

## Color Tokens

```css
/* Light Mode */
--background: white
--foreground: #171717
--muted: #f5f5f5
--muted-foreground: #737373
--primary: #2563eb (blue-600)
--primary-foreground: white
--destructive: #dc2626 (red-600)
--border: #e5e5e5
--accent: #f0f9ff (blue-50)

/* Dark Mode */
--background: #0a0a0a
--foreground: #fafafa
--muted: #262626
--muted-foreground: #a3a3a3
--primary: #3b82f6 (blue-500)
--primary-foreground: white
--destructive: #ef4444 (red-500)
--border: #262626
--accent: #172554 (blue-950)
```

---

## Responsive Breakpoints

| Breakpoint | Sidebar | Cards | Behavior |
|------------|---------|-------|----------|
| < 768px | Hidden (hamburger) | 1 column | Mobile layout |
| 768-1024px | Collapsed (icons) | 2 columns | Tablet layout |
| > 1024px | Expanded | 3-4 columns | Desktop layout |

---

## Animations

- Sidebar collapse: 200ms ease-out
- Card hover: scale(1.01), shadow increase
- Card removal: slide-out + fade, 300ms
- Page transitions: fade, 150ms
- Toast notifications: slide-in from top-right

---

## Removed Features

- **Subscriber management** - Internal use only, no need to manage recipients
- Subscriber page removed from navigation
- CSV import functionality removed
- Subscriber count metrics changed to edition/article metrics

---

## Implementation Reference

Based on [shadcn-admin](https://github.com/satnaing/shadcn-admin) patterns:
- Collapsible sidebar with ShadcnUI Sidebar component
- Command palette for global search
- Consistent card layouts
- Toast notifications with Sonner
- Light/dark theme toggle

---

## Success Criteria

- [ ] Sidebar collapses and expands smoothly
- [ ] All pages render with new layout
- [ ] Metrics display correctly on dashboard
- [ ] Article cards show all required information
- [ ] Approve/reject actions work with animations
- [ ] Newsletter preview renders accurately
- [ ] Light/dark mode works throughout
- [ ] Responsive on mobile/tablet/desktop

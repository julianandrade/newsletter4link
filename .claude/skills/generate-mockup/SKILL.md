---
name: generate-mockup
description: Generate HTML mockups and PNG screenshots (1920x1080) from Transaction documents using a design reference (Figma URL, design system folder with tokens/components in markdown, existing HTML screens, or screenshots). Supports three modes — single Transaction (TX-XXX), feature (group of related Transactions with dependencies resolved), or batch (all Transactions or all features at once). Use when asked to "create a mockup", "generate screens", "mockup the Transaction/feature", "generate mockups for all Transactions", or when executing step 4c-mockup in complete-development. Outputs standalone HTML files with embedded CSS and PNG screenshots rendered at 1920x1080.
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Generate Mockup

Generate standalone HTML mockups **and PNG screenshots** from Transaction documents, using a design reference as the visual source of truth. Mockups are **visual prototypes** — they show layout, structure, typography, colors, spacing, and component placement without functional logic. Each screen is also rendered as a **1920x1080 PNG screenshot** to simulate the default user monitor resolution.

## Modes

The skill supports two modes:

### Mode A — Single Transaction

Generate mockups for **one Transaction** (e.g. `TX-005`). Screens cover the actions and states defined in that Transaction only.

- **Output folder**: `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/`
- **Aggregated file**: `{tx-id}-mockups.html`

### Mode B — Feature (Multi-Transaction)

Generate mockups for a **feature** — a group of related Transactions that together form a user flow. The skill reads all Transactions in the group, resolves dependencies between them, and generates screens that show the full flow with proper context (e.g. if TX-006 depends on TX-005, the TX-006 screens show the CP4 field already populated from TX-005).

- **Output folder**: `{{PATH_DOCS}}/1-analysis/mockups/{feature-name}/`
- **Aggregated file**: `{feature-name}-mockups.html`

### Mode C — Batch (All Transactions or All Features)

Generate mockups for **every Transaction** in the project, or for **every feature** (grouped set of Transactions). The skill discovers all Transactions automatically by scanning `{{PATH_DOCS}}/4-implementation/development/`, then runs Mode A or Mode B for each target.

- **All Transactions**: One Mode A run per discovered Transaction. Output folder per Transaction.
- **All features**: Reads a feature manifest (`{{PATH_DOCS}}/features.md`) if present, or infers feature groups from Transaction dependency graphs; one Mode B run per group.
- **Skip-existing**: By default, skips Transactions whose mockup folder already exists and is non-empty. Pass `--force` to regenerate all.
- **Master index**: After all runs complete, writes `{{PATH_DOCS}}/1-analysis/mockups/README.md` — a project-wide index of all generated mockups.
- **Output folder**: one sub-folder per scope under `{{PATH_DOCS}}/1-analysis/mockups/`

**How to determine mode:**
- If the user provides a **single TX-XXX** → Mode A.
- If the user provides **multiple TX-XXX IDs**, a **feature name**, or asks to mockup a **flow/feature** → Mode B.
- If the user asks to generate mockups for **"all Transactions"**, **"all features"**, **"every Transaction"**, or **"the whole project"** → Mode C.

## When to Use This Skill

- User asks to **create a mockup**, **generate screens**, **prototype a Transaction**, or **visualize a feature**.
- Before frontend architecture (step 4a in complete-development) to align stakeholders on the expected UI.
- When a Transaction exists but no visual reference (Figma, screenshot, HTML screen) has been produced yet.
- When migrating or replicating an existing design into a new project context.

**Trigger phrases:**
- "Create a mockup for TX-XXX"
- "Generate screens for this Transaction"
- "Mockup this feature"
- "Create mockups for the postal code feature (TX-005, TX-006, TX-007)"
- "Generate screens for the reception flow"
- "Create HTML screens from the Transaction"
- "Visualize this Transaction"
- "Generate a prototype for this feature"
- "Generate mockups for all Transactions"
- "Create mockups for every Transaction"
- "Batch generate all mockups"
- "Generate mockups for all features"
- "Mockup the whole project"
- "Generate mockups for all Transactions that don't have one yet"

## Supported Design Reference Sources

The skill accepts **one or more** of the following as design input, in priority order:

| Priority | Source | Description | How to provide |
|----------|--------|-------------|----------------|
| 1 | **Figma / External URL** | URL to a Figma file, frame, or any web-based layout tool (Figma, Penpot, Zeplin, etc.) | Pass the URL as argument or in the Transaction doc |
| 2 | **Design System folder** | Local folder with markdown docs for tokens (colors, typography, spacing), components, and guides — see [Pattern A](#pattern-a-design-system-folder-structure-markdown-tokens) | Path to folder (e.g. `{{PATH_DOCS}}/3-design/design-system/`) |
| 3 | **Existing HTML screens** | Pre-existing HTML mockups/screens in the project | Path to HTML files or folder |
| 4 | **Screenshots / Images** | PNG/JPG reference images of target layouts | Path to image files |
| 5 | **No reference** | No design reference available — generate a clean, accessible default | Skill uses sensible defaults |

When multiple sources are available, **combine them**: use the design system tokens for colors/typography/spacing, the HTML screens or Figma for layout patterns, and screenshots for visual validation.

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| **Transaction document(s)** | Yes (A/B) | **Mode A**: Path to `{tx-id}.md` or `{tx-id}-complete-transaction.md`. **Mode B**: Multiple Transaction paths, or a feature name + list of RQ IDs. **Mode C**: Not needed — discovered automatically. |
| **Feature name** | Mode B only | Kebab-case identifier for the feature (e.g. `postal-codes`, `reception-flow`). Used for the output folder name. |
| **Design reference** | No | One or more of: URL, folder path, HTML file path, image path (see table above). In Mode C, applied to all generated mockups. |
| **Output folder** | No | Where to write the generated HTML. Default: `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/` (A), `{{PATH_DOCS}}/1-analysis/mockups/{feature-name}/` (B), `{{PATH_DOCS}}/1-analysis/mockups/` root (C) |
| **Screen list** | No (A/B) | Explicit list of screens to generate. If omitted, inferred from Transaction actions, flows, and business rules. Not applicable to Mode C. |
| **`--force`** | No (C) | Mode C flag. Regenerate mockups even if the output folder already exists. Default: skip existing. |

## Process

### Step 0 — Discover Targets (Mode C only)

Skip this step for Mode A and Mode B.

1. **Scan** `{{PATH_DOCS}}/4-implementation/development/` for Transaction directories. Each sub-folder named `TX-XXX` (or any `{tx-id-name}` folder containing a `{tx-id}.md` or `{tx-id}-complete-transaction.md`) is a candidate.
2. **Build target list**:
   - For **all Transactions**: each discovered Transaction is an independent Mode A target.
   - For **all features**:
     a. Check if `{{PATH_DOCS}}/features.md` exists. If so, read it — it lists feature groups with their member TX/NTI IDs and a feature name.
     b. If no `features.md`, read each Transaction's dependency fields and group Transactions that share dependencies into feature clusters. Standalone Transactions become their own single-Transaction feature.
3. **Filter existing** (unless `--force`): for each target, check whether `{{PATH_DOCS}}/1-analysis/mockups/{scope}/html/` exists and contains at least one `.html` file. If yes, mark as `SKIP`. Report skipped targets to the user before proceeding.
4. **Present plan**: show the full target list (with SKIP/GENERATE status) and ask the user to confirm before starting. Example:
   ```
   Batch Mockup Plan — 12 Transactions found:
     GENERATE  TX-001  (no existing mockup)
     GENERATE  TX-002  (no existing mockup)
     SKIP      TX-003  (html/ folder exists, --force to regenerate)
     GENERATE  TX-004  (no existing mockup)
     ...
   Proceed? (yes / no / --force to regenerate all)
   ```
5. **Execute**: for each GENERATE target, run Mode A or Mode B (Steps 1–6 of this process). Process sequentially or in batches — if using sub-agents (Agent tool), spawn them in parallel groups of up to 5 to avoid overwhelming context.
6. **Master index**: after all targets complete, write `{{PATH_DOCS}}/1-analysis/mockups/README.md` — project-wide index (see Outputs).

### Step 1 — Read and Analyse Transactions

#### Mode A — Single Transaction

1. Read the Transaction document (`{tx-id}-complete-transaction.md` or `{tx-id}.md`).
2. Extract:
   - **Actions / Use Cases**: Each user action or flow that implies a distinct screen or screen state (e.g. "Create record", "Search", "Confirm delete").
   - **Business Rules (BRs)**: Validation messages, constraints, conditional UI (e.g. "BR-003: Reason is mandatory" → error state screen).
   - **Entities and Fields**: Data fields, types, labels, relationships that need to appear in the UI.
   - **Navigation / Flow**: How screens connect — which action leads to which screen.

#### Mode B — Feature (Multi-Transaction)

1. Read **all Transaction documents** in the feature group.
2. For each Transaction, extract actions, BRs, entities, and fields (same as Mode A).
3. **Build a dependency graph** from the `Dependencias` field in each Transaction's actions table and from cross-references between Transactions (e.g. "see TX-006" in TX-005's post-conditions).
4. **Resolve execution order**: Sort Transactions by dependency (e.g. TX-005 before TX-006 if TX-006 depends on CP4 being selected).
5. **Determine shared context**: Identify the UI state that carries over between Transactions:
   - Which fields are populated by earlier Transactions (e.g. CP4 field filled after TX-005).
   - Which screens are the starting point for dependent Transactions (e.g. the reception grid with CP4 populated is the context for opening the TX-006 LOV).
6. When generating screens for a dependent Transaction, **show the accumulated context** from its predecessors (e.g. TX-006 screens show CP4=1050 already filled in the background grid).

#### Clarifications (Read Proactively)

**Before** reading core reference files, check if `{{PATH_DOCS}}/core/clarifications/clarification_questions.md` exists. If it does, **read it immediately** — answered clarifications directly affect screen design, field behaviour, conditional states, and validation rules.

- Extract only Q&A pairs that have a recorded answer — skip unanswered questions entirely.
- Filter to pairs relevant to the target transaction(s).
- Use answers to refine the screen inventory (e.g. a clarified edge case → add error state screen).
- Override or extend information from the transaction document where the clarification provides more precise detail.

> If the file does not exist, skip this step silently and continue.

#### Screen Inventory (both modes)

Produce a **Screen Inventory** — a list of screens/states to mockup:

```
Screen Inventory for {tx-id or feature-name}:
1. [screen-name] — Description (e.g. "Main list with toolbar and filters") [TX-XXX]
2. [screen-name-state] — Description (e.g. "List in search/query mode") [TX-XXX]
3. [dialog-name] — Description (e.g. "Confirmation dialog for delete") [TX-YYY]
...
```

In Mode B, each screen is tagged with its source Transaction. Screens are ordered to follow the user flow across Transactions (dependency order), not grouped by Transaction.

Present the Screen Inventory to the user for confirmation before generating. If the user provides a screen list, use that instead.

### Step 2 — Resolve the Design Reference

Apply the priority order to determine the design source:

#### 2a. Figma / External URL

1. If a URL is provided, use `WebFetch` to retrieve the page content.
2. Extract visual patterns: layout structure, component types, colors, typography, spacing.
3. If the URL is a Figma file and cannot be fetched directly, ask the user to export the relevant frames as PNG screenshots or HTML.

#### 2b. Design System Folder (Markdown Tokens)

1. Read the folder's `README.md` (index) to discover available documentation.
2. Read relevant token files:
   - **Colors**: `colors/README.md` and sub-folders — extract CSS variables, hex values, semantic names.
   - **Typography**: `typography/README.md` — font families, sizes, weights, line heights.
   - **Spacing**: `spacing/README.md` — spacing scale (e.g. 4px/8px grid).
   - **Icons**: `icons/README.md` — available icon set and usage.
3. Read relevant **component** docs:
   - For each component needed (e.g. Button, Modal, Table, Input), read its `README.md` (API, variants) and `integration-guide.md` (HTML patterns).
4. Read **guides** if relevant (accessibility, events).
5. If a `color-tokens.json` (or similar structured token file) exists, read it for exact hex/RGB values.
6. **Extract Component Visual Characteristics** — mandatory whenever design system component docs are read. The mockup uses native HTML elements (not actual web components), but those native elements must faithfully reproduce every characteristic of the real components that affects the visual layout or appearance. Dimensions are just one category — extract **all** of the following for each component:

   **Categories to extract per component:**

   | Category | What to look for |
   |----------|-----------------|
   | **Dimensions** | `height` / `min-height` per size variant, `min-width`, `max-width` |
   | **Spacing** | internal `padding`, gap between internal sub-elements (e.g. icon-to-label gap), `margin` applied by the component itself |
   | **Shape** | `border-radius` per variant (e.g. pill vs rounded vs square) |
   | **Typography** | `font-size`, `font-weight`, `line-height`, `text-transform`, `letter-spacing` per variant |
   | **Color / surface** | background, border, text color per state (default, hover, focus, disabled, error, success) |
   | **Focus / outline** | focus ring style, thickness, color, offset — affects how focused fields look |
   | **Validation states** | how error / warning / success states are displayed (border color change, icon, background tint) |
   | **Error / hint message** | position relative to the field (below? above?), font-size, color, icon presence, max lines, overflow behaviour |
   | **Label** | position (above, inline, floating), font-size, font-weight, required indicator (`*`) position and color, distance from field |
   | **Icons** | leading / trailing icon placement, icon size, icon-to-text gap |
   | **Prefix / suffix** | inline prefix or suffix text, its padding, font style |
   | **Disabled state** | opacity, cursor, visual treatment (greyed out, hatched, etc.) |
   | **Read-only state** | whether the component has a distinct read-only style vs disabled |
   | **Loading state** | spinner placement, skeleton pattern, if applicable |
   | **Empty / placeholder** | placeholder text color, style |
   | **Counter** | character counter position (below field? right-aligned?), when it appears |
   | **Overlay / backdrop** | modal/drawer backdrop color and opacity |
   | **Z-index / stacking** | dropdowns, tooltips, modals — relevant for layering in the mockup |
   | **Responsive behaviour** | breakpoints where the component changes layout (e.g. full-width on mobile) |

   **How to record them:**

   For each component, write a **Component Visual Profile** entry in your working context (not in the output files). Structure it as a flat reference you can consult while writing mockup CSS:

   ```
   Component Visual Profile:

   ctt-button (small variant) → <button class="btn btn-sm">
     height: 32px | padding: 0 12px | border-radius: 16px (pill)
     font-size: 13px | font-weight: 600
     default: bg #df0024, text white | hover: bg #b30018 | disabled: opacity 0.4
     focus: outline 2px solid #df0024, offset 2px

   ctt-input-text (medium variant) → native structure: <div class="field-wrapper"> containing <label> + <input> + <span class="hint-or-error">
     total component height: ~72px (label 20px + gap 4px + input 48px + gap 4px + hint 16px)
     input area: height 48px | padding: 0 12px | border: 1px solid #c9c9c9 | border-radius: 4px
     label: font-size 13px | font-weight 600 | margin-bottom 4px | required * color: #df0024
     hint/error: font-size 11px | color (hint) #808080 | color (error) #b30018 | position: below input, margin-top 4px
     error state: input border-color #b30018 | background tint #feeaec
     focus state: border-color #df0024 | outline 2px solid #df0024 offset -1px
     disabled: opacity 0.5 | cursor not-allowed

   ctt-table row → <tr>
     row height: 40px | cell padding: 8px 12px | header: font-weight 600, bg #f2f2f2
     border: 1px solid #e2e2e2 | striped: even rows bg #fafafa

   ctt-modal → <div role="dialog">
     backdrop: rgba(0,0,0,0.4) | dialog bg: white | border-radius: 8px
     min-width: 480px | max-width: 800px | padding: 24px
     header: font-size 18px font-weight 700, border-bottom 1px solid #e2e2e2
     footer: border-top 1px solid #e2e2e2, padding-top 16px, actions right-aligned
   ```

   - Map each design system component to the closest native HTML equivalent it will be rendered as in the mockup. When a design system component renders as a composite (e.g. label + input + error text), replicate that structure in native HTML — do not collapse it to a bare `<input>`.
   - In Step 3, apply the full profile when styling native elements. Do not guess any value — use only what the docs state. Where a doc is silent, fall back to the spacing scale from the token files.

7. Compile a **Design Token Summary** (colors, typography, spacing) together with the **Component Visual Profiles** to use when generating CSS in Step 3.

#### 2c. Existing HTML Screens

1. Read the HTML files to extract:
   - Layout patterns (page structure, header, sidebar, content area).
   - Component usage (which components are used and how).
   - CSS classes and inline styles.
2. If a shared CSS file exists, read it to reuse styles.
3. Use these patterns as templates for the new screens.

#### 2d. Screenshots / Images

1. Read the image files to understand the visual layout.
2. Use as a reference for structure and placement — do **not** extract exact values from images (they are approximate).
3. Cross-reference with HTML source or design tokens when available.

#### 2e. No Reference (Defaults)

Generate a clean, modern design with:
- **Typography**: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`), modular scale (1.25 ratio).
- **Colors**: Neutral palette with a single primary accent. WCAG 2.1 AA contrast.
- **Spacing**: 8px grid system.
- **Components**: Simple, accessible HTML elements with minimal styling.

### Step 3 — Generate the HTML Mockups

For each screen in the inventory:

1. **Create a standalone HTML file** with:
   - `<!DOCTYPE html>` declaration.
   - `<meta charset="UTF-8">` and `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.
   - `<title>` with screen name and Transaction ID.
   - **Embedded `<style>`** block — the mockup must be self-contained (no external CSS dependencies).
   - Semantic HTML structure (`<header>`, `<main>`, `<nav>`, `<section>`, `<form>`, `<table>`, `<dialog>`, etc.).

2. **Apply design tokens** from the resolved reference:
   - CSS custom properties (variables) at `:root` for colors, typography, spacing.
   - Component styles matching the design system's patterns.
   - Responsive layout using flexbox/grid.

3. **Populate with realistic data**:
   - Use field labels from the Transaction.
   - Fill tables/grids with 3-5 sample rows of plausible data.
   - Show form fields with appropriate types (`text`, `number`, `date`, `select`, etc.).
   - Include placeholder text where applicable.

4. **Show screen states** when the Transaction describes them:
   - Default state, empty state, error state, loading state.
   - Modal/dialog open state — show the dialog overlay on top of the parent screen.
   - Validation errors inline on fields.

### Step 4 — Generate the Index, CSS, and Component References

1. **Create a shared CSS file** (`mockup-design-system.css`) if generating multiple screens:
   - Contains all design tokens as CSS variables.
   - Contains base component styles reused across screens.
   - Each screen HTML can optionally embed this CSS or link to it.

2. **Create an aggregated HTML file** (`{scope}-mockups.html`) that contains all screens in a single file:
   - Each screen wrapped in a `<section id="screen-{name}">`.
   - Table of contents at the top with anchor links to each screen.
   - Embedded CSS (no external dependencies) — fully self-contained.

3. **Create a component reference markdown file** for each screen in the `components/` sub-folder:
   - File name matches the screen: `components/{NN}-{screen-name}.md`.
   - Purpose: gives the frontend developer an at-a-glance list of which design system components to use when implementing the screen, so they do not have to reverse-engineer the mockup.
   - Content per file:

     ```markdown
     # Component Reference — {Screen Name}

     **Screen:** {NN}-{screen-name}
     **Transaction:** {TX-ID}
     **Description:** {one-line screen description}

     ## Design System Components

     | Area / Element | Component | Variant / Props | Notes |
     |----------------|-----------|-----------------|-------|
     | Primary action button | `ctt-button` | `variant="primary" size="md"` | Triggers form submit |
     | Text input — Barcode | `ctt-input-text` | `size="md" required` | 13-char S10 format; shows error below field |
     | Data grid | `ctt-table` | — | Read-only display rows; inline-editing uses native `<input>` inside `<td>` (no ctt-table equivalent) |
     | Postal code LOV trigger | `ctt-button` | `variant="ghost" size="sm"` | Icon-only, inside table cell |
     | Status badge | `ctt-badge` | `variant="success"` / `variant="error"` | V = success, A = error |
     | Confirmation dialog | `ctt-modal` | `size="sm"` | Shown on save / cancel |
     | ... | ... | ... | ... |
     ```

   - **Area / Element**: the UI region or field name (not the component name).
   - **Component**: the exact `ctt-*` tag name from `ctt-web-components`.
   - **Variant / Props**: the specific props / variant combination used in this screen (copy from the Component Visual Profile built in Step 2b.6).
   - **Notes**: any implementation detail the developer needs — e.g. when a design system component cannot cover the use case (inline-editing grid cells, dense 32px rows) state the exception explicitly and explain what native HTML to use instead.
   - If a UI area has **no matching design system component**, still include it in the table with `Component = native <element>` and a note explaining why.

4. **Create a `README.md`** index mapping each screen to its:
   - Screen ID and name.
   - Source Transaction and business rules.
   - Description.
   - File paths (HTML, screenshot, component reference).

### Step 5 — Generate PNG Screenshots

Render each HTML mockup as a **1920x1080 PNG screenshot** to simulate the default user monitor. Screenshots provide a quick visual reference without opening a browser, and are useful for embedding in documentation, PRs, or stakeholder reviews.

#### Screenshot generation method

Use **Playwright** (headless Chromium) to render and capture each screen. Run a Bash command for each HTML file:

```bash
npx playwright screenshot \
  --browser chromium \
  --viewport-size "1920,1080" \
  --full-page \
  "file://$(pwd)/{html-path}" \
  "{output-png-path}"
```

**If `npx playwright screenshot` is not available** (older Playwright version or not installed), use a small inline Node.js script instead:

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://$(pwd)/{html-path}');
  await page.screenshot({ path: '{output-png-path}', fullPage: true });
  await browser.close();
})();
"
```

**If Playwright is not available at all**, fall back to any available headless browser tool:
- `google-chrome --headless --screenshot="{output-png-path}" --window-size=1920,1080 "file://$(pwd)/{html-path}"`
- `wkhtmltoimage --width 1920 --height 1080 "{html-path}" "{output-png-path}"`

#### Screenshot rules

1. **Resolution**: Always render at **1920x1080** viewport (default Full HD monitor).
2. **Full page**: Capture the full rendered content (`fullPage: true`), not just the visible viewport — this ensures modals and longer content are fully visible.
4. **Output path**: Place screenshots in the `screenshots/` sub-folder: `{{PATH_DOCS}}/1-analysis/mockups/{tx-id}/screenshots/{NN}-{screen-name}.png`. HTML source files are in the sibling `html/` sub-folder.
5. **Naming**: Match the HTML file name — `html/01-user-list.html` → `screenshots/01-user-list.png`.
6. **One screenshot per HTML file**: Generate one PNG per individual screen HTML file from `html/`. Do **not** screenshot the aggregated HTML file.
7. **Verify output**: After generation, verify each PNG file exists and has a non-zero size. If a screenshot fails, log the error and continue with the remaining screens — do not abort the entire process.

### Step 6 — Validate and Deliver

1. **Validate** each HTML file:
   - Valid HTML structure (no unclosed tags).
   - All CSS variables are defined.
   - Responsive layout works at common breakpoints (375px, 768px, 1024px, 1920px).

2. **Present to the user**:
   - Summary of generated screens.
   - File paths.
   - Instructions to open in a browser.
   - Screen inventory with descriptions.

## Outputs

Use `{scope}` to refer to either `{tx-id}` (Mode A) or `{feature-name}` (Mode B).

| Output | Path | Description |
|--------|------|-------------|
| Individual screen HTMLs | `{{PATH_DOCS}}/1-analysis/mockups/{scope}/html/{NN}-{screen-name}.html` | One file per screen, standalone |
| PNG screenshots | `{{PATH_DOCS}}/1-analysis/mockups/{scope}/screenshots/{NN}-{screen-name}.png` | 1920x1080 render of each screen |
| Aggregated HTML | `{{PATH_DOCS}}/1-analysis/mockups/{scope}/html/{scope}-mockups.html` | All screens in one file with TOC |
| Shared CSS (optional) | `{{PATH_DOCS}}/1-analysis/mockups/{scope}/html/mockup-design-system.css` | Reusable design tokens and base styles |
| Component references | `{{PATH_DOCS}}/1-analysis/mockups/{scope}/components/{NN}-{screen-name}.md` | Per-screen list of design system components for developers |
| Scope index | `{{PATH_DOCS}}/1-analysis/mockups/{scope}/README.md` | Screen inventory with mappings |
| **Master index** (Mode C) | `{{PATH_DOCS}}/1-analysis/mockups/README.md` | Project-wide index of all generated mockups with status, screen counts, and links per scope |

### Output Folder Structure

**Modes A and B** — single scope:
```
{{PATH_DOCS}}/1-analysis/mockups/{scope}/
  README.md                                  # Screen inventory index
  html/                                      # All HTML files
    {NN}-{screen-name}.html                  # Individual screen (standalone)
    {scope}-mockups.html                     # Aggregated file with TOC
    mockup-design-system.css                 # Shared design tokens (optional)
  screenshots/                               # All PNG screenshots
    {NN}-{screen-name}.png                   # 1920x1080 render
  components/                                # Per-screen component references
    {NN}-{screen-name}.md                    # Design system components used in this screen
```

**Mode C** — batch, all scopes under one root:
```
{{PATH_DOCS}}/1-analysis/mockups/
  README.md                                  # Master index (all scopes, screen counts, status)
  {scope-1}/                                 # One folder per Transaction / feature
    README.md
    html/
    screenshots/
    components/
  {scope-2}/
    ...
```

In Mode B, the per-scope README must include a **Transaction Map** section listing all Transactions in the feature, their dependencies, and which screens belong to each.

In Mode C, the master `README.md` must include:
- Total Transactions/features processed, total screens generated, total screenshots rendered.
- A table per scope: scope name, status (generated / skipped / failed), screen count, aggregated HTML path.

### Output File Naming

- Screen files: `html/{NN}-{screen-name}.html` where `NN` is a zero-padded sequence number (01, 02, ...) and `{screen-name}` is a kebab-case identifier (e.g. `html/01-user-list.html`, `html/02-user-create.html`, `html/03-confirm-delete.html`).
- Screenshot files: `screenshots/{NN}-{screen-name}.png` — same base name as the HTML, different extension, inside the `screenshots/` sub-folder.
- Component reference files: `components/{NN}-{screen-name}.md` — same base name as the HTML, `.md` extension, inside the `components/` sub-folder.
- Section IDs inside the aggregated file: `screen-{name}` (e.g. `screen-user-list`, `screen-confirm-delete`).

## Design Reference Source — Detailed Patterns

### Pattern A: Design System Folder Structure (Markdown Tokens)

A design system folder typically has this structure. The exact layout may vary by project — the agent should **discover** the structure by reading the root `README.md` or index file and navigating from there.

```
design-system/
  README.md                      # Index — lists all sections and links
  color-tokens.json              # (optional) Structured token values (hex/RGB)
  colors/
    README.md                    # Color tokens overview, CSS variables
    primary-scale/README.md      # Primary color scale (50-900)
    neutral-scale/README.md      # Neutral/gray scale
    semantic-*/README.md         # Success, error, warning, info scales
    surface-colors/README.md     # Background/surface colors
    ...
  typography/
    README.md                    # Font families, sizes, weights, line heights
  spacing/
    README.md                    # Spacing scale (4px/8px grid)
  icons/
    README.md                    # Icon catalog and usage
    icon/README.md               # Icon component API
  components/
    button/
      README.md                  # API, props, variants, stories
      integration-guide.md       # HTML/framework usage patterns
    modal/
      README.md
      integration-guide.md
    table/
      README.md
      integration-guide.md
    input/
      README.md
      integration-guide.md
    ...                          # Other components (card, chip, tag, etc.)
  utilities/
    css-utilities/README.md      # CSS utility classes
    layout-utilities/README.md   # Layout helpers (grid, flex patterns)
  guides/
    accessibility.md             # WCAG, ARIA patterns
```

**How to consume this structure:**
1. Read `README.md` for the full index of available documentation.
2. Read `colors/README.md` → extract CSS variable names and hex values.
3. Read `typography/README.md` → extract font stack and type scale.
4. Read `spacing/README.md` → extract spacing grid and scale.
5. For each component used in the mockup, read its `README.md` (API/variants) and `integration-guide.md` (HTML patterns).
6. If `color-tokens.json` exists, use it as the authoritative token value source.
7. Apply tokens as CSS custom properties in the mockup's `<style>` block.

### Pattern B: Figma / URL Reference

When a Figma URL or similar design tool URL is provided:

1. **Try to fetch** the URL content with `WebFetch`.
2. If the content is usable (HTML, SVG, JSON), extract layout and style information.
3. If the content is not directly parseable (e.g. Figma requires authentication):
   - Ask the user to **export frames as PNG** and place them in the project.
   - Or ask the user to **export as HTML/CSS** if the tool supports it.
   - Or ask the user to **describe the layout** verbally and generate from that description.
4. Use extracted or described layout as the structural template for the mockup.

### Pattern C: Existing HTML Screens

When existing HTML screen files are provided:

1. Read the HTML to understand the page structure (header, sidebar, content area, footer).
2. Read the associated CSS (embedded or external) to extract styles.
3. Replicate the layout patterns for new screens.
4. Reuse CSS classes and component patterns.
5. Maintain visual consistency with the existing screens.

## Integration with Complete-Development

This skill can be used **before step 4a** (Architect) in the complete-development flow to produce a visual reference that the frontend-architect and ui-ux-designer can consume:

1. **Before 4a**: Generate mockups from the complete Transaction → stakeholders validate the layout.
2. **In 4a**: Frontend-architect references the mockups when writing `{tx-id}-frontend-tech-spec.md`.
3. **In 4c**: UI/UX designer refines the tech-spec using the mockups as the layout reference.
4. **In 6**: Frontend-engineer implements following the tech-spec, with mockups as visual validation.

The generated mockups are placed in `{{PATH_DOCS}}/1-analysis/mockups/{scope}/` and referenced from the tech-spec.

## Quality Checklist

Before delivering mockups:

- [ ] All screens from the inventory are generated
- [ ] HTML is valid and semantic (proper heading hierarchy, ARIA labels)
- [ ] CSS variables are defined for all tokens used
- [ ] Layout is responsive (tested at 375px, 768px, 1024px, 1920px)
- [ ] Colors meet WCAG 2.1 AA contrast Transactions (4.5:1 text, 3:1 large text)
- [ ] Form fields have labels and appropriate input types
- [ ] Tables have `<thead>`, `<tbody>`, proper headers
- [ ] Modals/dialogs show overlay on parent screen
- [ ] Native element visual characteristics (dimensions, spacing, label position, error message position/style, focus ring, validation states, disabled appearance, icon placement, composite structure) match Component Visual Profiles extracted from design system docs — no guessed values
- [ ] A component reference `.md` file exists in `components/` for every screen HTML file
- [ ] Each component reference lists every design system component used in that screen with exact variant/props
- [ ] Exceptions (areas with no matching design system component) are documented in the component reference with the native HTML fallback and reason
- [ ] Aggregated HTML has working TOC with anchor links
- [ ] PNG screenshots generated for every individual screen HTML at 1920x1080
- [ ] Screenshots are saved in `screenshots/` sub-folder
- [ ] Each PNG has non-zero file size (rendering succeeded)
- [ ] README.md index is complete and accurate (includes screenshot paths)
- [ ] Files open correctly in a browser without external dependencies

## Examples

### Example 1: With a Design System Folder

**User:** "Create mockups for TX-005 using the design system at `{{PATH_DOCS}}/3-design/design-system/`"

**Process:**
1. Read `{{PATH_DOCS}}/4-implementation/development/TX-005/TX-005-complete-transaction.md`
2. Extract screens: user list page, create user form, edit user form, confirm-delete dialog
3. Read design system at `{{PATH_DOCS}}/3-design/design-system/`:
   - `README.md` → discover available sections
   - `colors/README.md` → project color palette and CSS variables
   - `typography/README.md` → font families and type scale
   - `spacing/README.md` → spacing grid
   - `components/button/README.md` → button variants
   - `components/modal/README.md` → modal/dialog patterns
   - `components/table/README.md` → table/grid patterns
   - `components/input/README.md` → form input patterns
4. Generate:
   - `html/01-user-list.html` — User list with search and toolbar
   - `html/02-user-create.html` — Create user form
   - `html/03-user-edit.html` — Edit user form
   - `html/04-confirm-delete.html` — Confirmation dialog
   - `html/TX-005-mockups.html` — All screens aggregated
   - `html/mockup-design-system.css` — Extracted design tokens
   - `screenshots/01-user-list.png` — 1920x1080 screenshot
   - `screenshots/02-user-create.png` — 1920x1080 screenshot
   - `screenshots/03-user-edit.png` — 1920x1080 screenshot
   - `screenshots/04-confirm-delete.png` — 1920x1080 screenshot
   - `components/01-user-list.md` — Component reference for user list screen
   - `components/02-user-create.md` — Component reference for create form
   - `components/03-user-edit.md` — Component reference for edit form
   - `components/04-confirm-delete.md` — Component reference for confirmation dialog
   - `README.md` — Index

### Example 2: Feature Mode (Multi-Transaction)

**User:** "Create mockups for the postal code feature (TX-005, TX-006, TX-007)"

**Process:**
1. Read all three Transaction documents:
   - `TX-005.md` — LOV CP4 (search/select 4-digit postal code)
   - `TX-006.md` — LOV CP7 (search/select 7-digit postal code, filtered by CP4)
   - `TX-007.md` — LOV Country (select country, Portugal excluded)
2. Build dependency graph:
   - TX-006 depends on TX-005 (CP7 is filtered by selected CP4)
   - TX-007 is independent
3. Determine shared context:
   - TX-006 screens must show CP4 field already populated (e.g. CP4=1050 from TX-005)
4. Produce screen inventory ordered by flow:
   ```
   Screen Inventory for postal-codes:
   1. lov-cp4-default — CP4 modal with results [TX-005]
   2. lov-cp4-search — CP4 modal filtered [TX-005]
   3. lov-cp7-default — CP7 modal (CP4=1050 pre-filled in background) [TX-006]
   4. lov-cp7-search — CP7 modal filtered by CP4 [TX-006]
   5. lov-country-default — Country modal with results [TX-007]
   6. lov-country-search — Country modal filtered [TX-007]
   ```
5. Generate screens — TX-006 screens show the reception grid with CP4=1050 already filled, demonstrating the dependency context.

**Output:**
```
Generated 6 screens for postal-codes (TX-005, TX-006, TX-007):
  html/01-lov-cp4-default.html    — CP4 LOV default [TX-005]
  html/02-lov-cp4-search.html     — CP4 LOV search [TX-005]
  html/03-lov-cp7-default.html    — CP7 LOV (CP4=1050 context) [TX-006]
  html/04-lov-cp7-search.html     — CP7 LOV search [TX-006]
  html/05-lov-country-default.html — Country LOV default [TX-007]
  html/06-lov-country-search.html  — Country LOV search [TX-007]

Component references (for developers):
  components/01-lov-cp4-default.md
  components/02-lov-cp4-search.md
  components/03-lov-cp7-default.md
  components/04-lov-cp7-search.md
  components/05-lov-country-default.md
  components/06-lov-country-search.md

Aggregated: html/postal-codes-mockups.html
Output: {{PATH_DOCS}}/1-analysis/mockups/postal-codes/
```

### Example 3: With a Figma URL

**User:** "Create mockups for TX-012 based on https://figma.com/file/abc123"

**Process:**
1. Read Transaction document
2. Fetch the Figma URL → if accessible, extract layout patterns; if not, ask for exported PNGs
3. Use Figma layout as structural template
4. Generate HTML screens matching the Figma frames

### Example 3: No Design Reference

**User:** "Create mockups for TX-018"

**Process:**
1. Read Transaction document
2. No design reference provided → use sensible defaults (system fonts, neutral palette, 8px grid)
3. Generate clean, accessible HTML mockups

### Example 4: Batch — All Transactions

**User:** "Generate mockups for all Transactions"

**Process:**
1. Scan `{{PATH_DOCS}}/4-implementation/development/` → find TX-001 through TX-012 (12 folders)
2. Check existing mockups → TX-003 and TX-007 already have `html/` folders
3. Present plan:
   ```
   Batch Mockup Plan — 12 Transactions found:
     GENERATE  TX-001, TX-002, TX-004–TX-006, TX-008–TX-012  (10 Transactions)
     SKIP      TX-003, TX-007  (mockups already exist)
   Proceed?
   ```
4. User confirms → run Mode A for each of the 10 GENERATE targets (in parallel batches of 5)
5. Write `{{PATH_DOCS}}/1-analysis/mockups/README.md` master index

**Output:**
```
Batch complete — 10/12 Transactions generated, 2 skipped.
Master index: {{PATH_DOCS}}/1-analysis/mockups/README.md

| Scope  | Status    | Screens | Path |
|--------|-----------|---------|------|
| TX-001 | generated | 3       | mockups/TX-001/html/TX-001-mockups.html |
| TX-002 | generated | 4       | mockups/TX-002/html/TX-002-mockups.html |
| TX-003 | skipped   | —       | mockups/TX-003/ (existing) |
| ...    | ...       | ...     | ... |
Total: 34 screens, 34 screenshots
```

### Example 5: Batch — All Features

**User:** "Generate mockups for all features"

**Process:**
1. Check for `{{PATH_DOCS}}/features.md` → found, defines 3 features:
   - `postal-codes`: TX-005, TX-006, TX-007
   - `reception-flow`: TX-008, TX-009, TX-010
   - `settings`: TX-011, TX-012
2. No existing mockup folders → all GENERATE
3. Run Mode B for each feature (parallel)
4. Write master index

**Output summary (Example 1):**
```
Generated 4 screens for TX-005:
  html/01-user-list.html        — User list with search and toolbar (TX-005)
  html/02-user-create.html      — Create user form (TX-005, BR-001)
  html/03-user-edit.html        — Edit user form (TX-005, BR-002)
  html/04-confirm-delete.html   — Confirmation dialog (TX-005, BR-003)

Screenshots (1920x1080):
  screenshots/01-user-list.png
  screenshots/02-user-create.png
  screenshots/03-user-edit.png
  screenshots/04-confirm-delete.png

Aggregated: html/TX-005-mockups.html (all screens with TOC)
Design tokens: html/mockup-design-system.css

Open any HTML file in a browser to preview.
Open any components/*.md file to see which design system components to use.
```

## Limitations

- Mockups are **static HTML** — no JavaScript interactivity (buttons don't trigger actions).
- Figma URLs may require authentication — if content can't be fetched, screenshots or manual export are needed.
- Complex animations or transitions are not represented.
- Mockups are a visual guide — the final implementation should use the project's actual tech stack and components.

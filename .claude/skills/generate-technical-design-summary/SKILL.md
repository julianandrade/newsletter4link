---
name: generate-technical-design-summary
description: Generate a Technical Design Summary document from an existing Technical Design (TD) Markdown file. Produces three artefacts — a Markdown summary (.md), an Excalidraw architecture diagram (.excalidraw + .png), and a formatted Word document (.docx) using a provided .docx as the style template. Use when asked to "generate a summary of the technical design", "create a TD summary", "summarise the technical design", or "gerar resumo do design técnico".
---

> **Variable Resolution:** This file uses `{{VARIABLE_NAME}}` placeholders. Read `env` object of `.claude/settings.json` to resolve all project variables before execution.

# Generate Technical Design Summary

Produce a concise, structured summary of an existing **Technical Design (TD)** document. The summary targets readers who need to understand: what the application does, which modules it is composed of, what technologies are used, what external integrations exist, what the API contracts look like, and what the data model is — without reading the full TD.

Three artefacts are always produced together:

| Artefact | Description |
|----------|-------------|
| `*_summary_*_v1.md` | Markdown summary (source of truth) |
| `architecture-diagram.excalidraw` | Editable Excalidraw architecture diagram |
| `architecture-diagram.png` | PNG export of the diagram (embedded in the docx) |
| `*_summary_*_v1.docx` | Word document using the provided style template |

---

## When to Use This Skill

- User asks to **summarise** or **create a summary** of a technical design document.
- User needs a shareable, formatted Word document derived from a TD.
- User wants an architecture diagram generated from the TD's system architecture section.

**Trigger phrases:**
- "Generate a technical design summary from `architecture/Technical-Design_CTT_EN_v3.md`"
- "Create a summary of the technical design document"
- "Generate TD summary and export as docx using the Functional-Specification template"
- "Gerar resumo do design técnico"
- "Summarise the technical design"

---

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| **Source TD** | Yes | Path to the Technical Design Markdown file (user-supplied). |
| **DOCX template** | Yes | Path to an existing `.docx` file whose styles, page layout, headers, and footers are used as the template. |
| **Output directory** | No | Where to write all artefacts. Default: same directory as the source TD. |
| **Output version suffix** | No | Default: `v1`. Increment if a previous summary already exists. |
| **API sample payloads** | No | Paths to sample JSON payload files referenced by the TD (e.g. `architecture/APIs/*.json`). Read if available to populate §5 request examples. |

### Default output naming

Given a source TD at `architecture/Technical-Design_CTT_EN_v3.md`:

```
architecture/Technical-Design_summary_CTT_v1.md
architecture/Technical-Design_summary_CTT_v1.docx
architecture/architecture-diagram.excalidraw
architecture/architecture-diagram.png
```

Derive the `CTT` slug from the source TD's system/initiative name (kebab-case, ASCII). Increment `v1` → `v2` if a previous summary exists and the user has not asked to overwrite.

---

## Process

### Step 1 — Read Source Material

1. Read the full source TD Markdown file.
2. Scan for any **referenced API payload sample files** (e.g. `architecture/APIs/` folder mentioned in the TD). If found, read them to populate request examples in §5.
3. Identify the system name / initiative name from the TD's document control table (used for the output file slug).

### Step 2 — Generate Markdown Summary

Write the summary Markdown file to the default (or user-specified) path. Follow the **required section structure** below exactly.

#### 2.1 Required Section Structure

Use these exact H2/H3 titles in this order. **Do not include section numbers in the Markdown headings** — numbers in headings cause duplication when Word auto-numbers them in the DOCX step.

```markdown
# {System/Initiative Name} — Technical Design Summary

## Document Information

## Application Objective

## High-Level Architecture

(code block or placeholder — replaced by PNG in DOCX step)

## Modules & Technologies

### Frontend
### Backend
### Data
### External Systems

## Integrations

### External Integrations

### Internal Routes (database-backed, not integrations)

### Cross-Cutting Concerns

## Request Examples (Payloads)

### {Integration name — e.g. API-001 Create Shipping Manifest}
...one subsection per external integration with payloads...

### Internal Reference Routes (sample)

## Data Models

### Logical Entities
### Database Collections / Tables
### Indicative Document Shapes
### Session / In-Memory State (if applicable)
### State Machine (if applicable)
### UI / Domain Events (if applicable)

## Open Items
```

#### 2.2 Document Information Table

A metadata table derived from the TD's document control section:

| Field | Value |
|-------|-------|
| Source | path to source TD + version |
| Summary version | v1 |
| Date | today |
| Initiative | system/initiative name |
| Client | client name |

#### 2.3 Application Objective

2–4 paragraphs. Cover:
- What the application replaces (legacy context).
- What it is (tech stack summary: SPA + BFF + data stores).
- Primary business outcomes (bullet list, max 6 items).
- Scope boundary (what is in POC vs future).

#### 2.4 High-Level Architecture

Include the ASCII architecture block from the TD verbatim inside a fenced code block. **This block is replaced by the Excalidraw PNG in the DOCX step** (Step 4). Keep it in Markdown for readability of the `.md` file.

**Placement rule:** High-Level Architecture comes immediately after Application Objective and **before** Modules & Technologies — the diagram gives readers the overall picture before they read module-level detail.

#### 2.5 Modules & Technologies

One subsection per layer. For each module, a table with at minimum: item and value. Typical rows: framework/engine, key libraries/patterns, deployment notes.

End the subsection with **"Out of Scope"** — a paragraph listing explicitly out-of-scope items from the TD.

#### 2.6 Integrations — Splitting Rules

**Critical rule: separate external integrations from internal/database-backed routes.**

##### External Integrations

Third-party systems called by the application over HTTPS. These **cross trust boundaries**, require credentials, and depend on contracts owned outside the project.

Table columns: `ID | Direction | Endpoint | Purpose | Trigger`

Include: UAT/production base paths, auth notes, per-endpoint rate-limit assumptions.

##### Internal Routes (database-backed, not integrations)

UI→BFF HTTP routes serving data from the application's own database. **Not external integrations.** Label them as such explicitly.

Table columns: `ID | UI route | Data source | Backing collection | Purpose | Consumer`

- The **Data source** column must be explicit (e.g. `MongoDB`, `PostgreSQL`, `IdP (API-009)`).
- Every row that reads from the database must say so in the **Data source** column — no row should be ambiguous about where the data comes from.
- Routes that orchestrate external calls (e.g. supervisor auth wrapper) must list the external system in **Data source**, not a database.

##### Cross-Cutting Concerns

Bullet list: correlation ID, idempotency strategy, rate limits, timeouts, circuit breaker, mock flags for offline dev, error handling / error mapping policy.

#### 2.7 Request Examples (Payloads)

One H3 per **external** integration. For each:
- HTTP method + URL (UAT path).
- Key request headers (auth, idempotency, correlation ID).
- Request body JSON (use actual sample payload files if available; otherwise derive from TD contract descriptions).
- Brief note on the authoritative contract artefact (e.g. OAS file path).

Include a final H3 for internal reference routes showing the URL pattern + standard paginated response shape.

#### 2.8 Data Models

Subsections:
- **Logical Entities**: Table with entity name, legacy table, and POC physical store/access.
- **Collections / Tables**: Table per collection with source, access API, and notes.
- **Indicative Document Shapes**: JSON comment blocks showing representative documents for each collection.
- **Session / In-Memory State**: JSON shape of BFF session cache if applicable.
- **State Machine**: Markdown diagram or table of row/entity states and transitions if applicable.
- **UI / Domain Events**: Table of event IDs, names, and technical handling.

#### 2.9 Open Items

Table: `# | Topic | Status | Impact`. Derive from the TD's open issues section. Statuses: `PROPOSED`, `CLOSED`, `DEFERRED`, `OPEN`.

---

### Step 3 — Generate Excalidraw Architecture Diagram

Generate an `.excalidraw` JSON file representing the high-level system architecture. Follow the **Excalidraw diagram rules** below.

#### 3.1 Excalidraw Diagram Rules

**Layout (left-to-right, top-to-bottom):**

```
  [Client / Browser layer]        (top, centred)
          │
          ▼ HTTPS JSON
       [BFF / API layer]           (centre)
      /    |    \
     ▼     ▼     ▼
[DB]  [Auth]  [External APIs]     (bottom)
```

Adapt the layout to the actual system — more or fewer layers, more or fewer external systems.

**Element types:**
- `rectangle` with `roundness: {"type": 3}` for all boxes.
- `text` for labels and row entries inside grouped boxes.
- `arrow` for connections between components.

**Color scheme — derive from the project's brand or use these defaults:**

| Component type | Fill | Stroke | Font color |
|---|---|---|---|
| Client / UI layer | `#e3f8fd` | `#0EB1D2` | `#0F1A20` |
| Frontend SPA label | `#0EB1D2` | `#0991B0` | `#ffffff` |
| BFF / Backend | `#0F1A20` | `#0F1A20` | `#ffffff` |
| External API Gateway group | `#fff8e1` | `#FF9C00` | heading `#FF9C00` |
| External API sub-boxes | `#ffe0b2` | `#FF9C00` | `#0F1A20` |
| Database (MongoDB, etc.) | `#e8f5e9` | `#388E3C` | `#0F1A20` |
| Auth / IdP | `#f3e5f5` | `#7B1FA2` | `#0F1A20` |

**Arrow colors match the target component stroke color.**

**Arrow markers:** define `<marker>` elements for each arrow color (`arr-{color}`), referenced via `marker-end`.

**fontFamily must be `5` (Excalifont) on all text elements.**

**roughness must be `0` on all elements** (clean/professional look).

**Include a Legend** box (bottom-left) mapping colors to component types.

**Include a Title** text element at the top.

**Required artefact:** `architecture-diagram.excalidraw` alongside the `.md` file.

---

### Step 4 — Export Excalidraw Diagram to PNG

Export the `.excalidraw` as a PNG file (`architecture-diagram.png`) for embedding in the DOCX. Use **Playwright** (headless Chromium) to render an SVG representation of the diagram — this avoids external CDN dependencies and is reliable in offline/air-gapped environments.

#### 4.1 Export Method (SVG via Playwright)

Generate a **self-contained HTML file** containing an inline SVG that faithfully represents the Excalidraw diagram. Then take a Playwright screenshot.

```javascript
// export-diagram.mjs  (ESM, requires `playwright` npm package)
import { chromium } from "playwright";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

const outPath = resolve("{output-dir}/architecture-diagram.png");
const tmpHtml = resolve("{output-dir}/diagram-export-tmp.html");

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>* { margin:0; padding:0; } body { background:#fff; width:{W}px; height:{H}px; overflow:hidden; }</style>
</head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="Segoe UI, Arial, sans-serif">
  {SVG_ELEMENTS}
</svg>
</body></html>`;

writeFileSync(tmpHtml, html, "utf-8");

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width: {W}, height: {H} });
await page.goto(`file:///${tmpHtml.replace(/\\/g, "/")}`, { waitUntil: "domcontentloaded" });
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
unlinkSync(tmpHtml);
console.log("PNG saved:", outPath);
```

Translate each Excalidraw element type to its SVG equivalent:

| Excalidraw element | SVG equivalent |
|---|---|
| `rectangle` with `roundness` | `<rect rx="10" ry="10" .../>` |
| `text` | `<text ...>` with `<tspan>` per line |
| `arrow` (straight) | `<line .../>` with `marker-end` |
| `arrow` (curved/path) | `<path d="M ... Q ... ..." .../>` with `marker-end` |
| Group background | outer `<rect>` with lighter fill |

Define SVG `<defs>` with `<marker>` arrowheads for each arrow color.

#### 4.2 Node/npm Transactions

- `playwright` package must be installed locally (`npm install playwright` in the working dir, or globally).
- Chromium browser must be available (`npx playwright install chromium` if missing).
- Run script via `node export-diagram.mjs`.
- **Delete the temporary script and HTML after successful export.**

If `playwright` is unavailable after installation attempts, save the `.excalidraw` file and note in the output that the user can export the PNG manually from [excalidraw.com](https://excalidraw.com).

---

### Step 5 — Generate DOCX Using Template

Generate the `.docx` by:
1. Opening the provided **template .docx** (inherits all styles, page layout, headers, footers, numbering).
2. Clearing all body content (preserve `w:sectPr`).
3. Parsing the Markdown summary and adding content using template styles.
4. Replacing the ASCII architecture block with the exported PNG.
5. Saving to the output path.

Use **Python + python-docx** (via WSL if on Windows). The conversion script must be a temporary file — delete it after the DOCX is saved.

#### 5.1 Heading Style Mapping

| Markdown level | Word style |
|---|---|
| `# H1` | `Link_Heading_1` |
| `## H2` | `Link_Heading_2` |
| `### H3` | `Link_Heading_3` |
| `#### H4` | `Link_Heading_4` |

#### 5.2 Strip Section Numbers from Heading Text — MANDATORY

Word heading styles in CTT templates apply **automatic outline numbering**. Markdown headings that include a numeric prefix (e.g. `## 2.4 External...`) will render as `2.4  2.4 External...` — the number appears twice.

**Rule:** Strip the leading section number from the heading text before adding it to the DOCX. Apply this regex to the raw heading text:

```python
import re
_NUM_PREFIX = re.compile(r"^\d+(\.\d+)*\.?\s+")

def strip_section_number(text: str) -> str:
    return _NUM_PREFIX.sub("", text)
```

Apply `strip_section_number()` to **every heading text** regardless of level.

Examples:
- `"2. Modules & Technologies"` → `"Modules & Technologies"`
- `"2.4 External — CTT API Gateway (UAT)"` → `"External — CTT API Gateway (UAT)"`
- `"5.1 API-001 — Create Shipping Manifest"` → `"API-001 — Create Shipping Manifest"`
- `"Technical Design — Summary (CTT.TOS.ReceçãoManual)"` → unchanged (no leading number)

#### 5.3 Body Text and Other Styles

| Content type | Word style |
|---|---|
| Normal paragraphs | `Normal Link` |
| Bullet lists | `List Bullet` / `List Bullet 2` |
| Numbered lists | `List Number` |
| Code blocks | `Normal Link` + left indent 0.3 in + Courier New 9pt + `F4F4F4` background |
| Tables | `Plain Table 3` |
| Inline code `` `text` `` | Courier New 9.5pt run within the paragraph run |

#### 5.4 Architecture Diagram — Replace ASCII Block with PNG

Detect the ASCII architecture code block in the parsed Markdown:
- It immediately follows the `## High-Level Architecture` heading.
- It contains the strings `"Browser"` and `".NET BFF"` (or equivalent BFF/backend name from the TD).

Replace this code block with an inline image run:

```python
run = para.add_run()
run.add_picture(str(png_path), width=Inches(7.2))
```

Centre-align the paragraph containing the image.

If `architecture-diagram.png` does not exist (Step 4 failed), keep the ASCII block as a code block and add a note paragraph: `"[Architecture diagram not available — open architecture-diagram.excalidraw at excalidraw.com]"`

#### 5.5 Table Formatting

- Use `Plain Table 3` style (matches CTT template).
- Row 0 (header): bold runs.
- All cell paragraphs: `Normal` style, inline formatting preserved.

#### 5.6 Horizontal Rules

Render `---` as an orange (`FF9C00`) single bottom border on an empty paragraph using `w:pBdr/w:bottom`.

#### 5.7 Inline Formatting

Parse `**bold**`, `*italic*`, and `` `code` `` within runs:
- Bold → `run.bold = True`
- Italic → `run.italic = True`
- Code → Courier New 9.5pt run

---

### Step 6 — Verify Outputs

After all steps complete, verify:

```
✅ architecture/Technical-Design_summary_CTT_v1.md    (non-empty)
✅ architecture/architecture-diagram.excalidraw        (valid JSON)
✅ architecture/architecture-diagram.png               (non-zero bytes)
✅ architecture/Technical-Design_summary_CTT_v1.docx
```

Report the result to the user with paths and any warnings (e.g. PNG export failed, DOCX locked).

---

## Quality Checklist

Before reporting completion:

- [ ] Markdown summary covers all 9 required sections
- [ ] Integration catalog clearly separates external integrations from internal/DB-backed routes
- [ ] Every internal/DB row has an explicit **Data source** column value (e.g. `MongoDB`, `PostgreSQL`, `IdP (API-009)`) — no ambiguity
- [ ] Request examples exist for every external integration
- [ ] Excalidraw diagram generated and saved
- [ ] Excalidraw: all text elements use `fontFamily: 5`
- [ ] Excalidraw: all elements use `roughness: 0`
- [ ] Excalidraw: legend box included
- [ ] PNG exported successfully (non-zero size)
- [ ] DOCX uses provided template (styles inherited, page layout preserved)
- [ ] DOCX headings: section numbers stripped (no `"2.4  2.4 External..."` duplication)
- [ ] DOCX: ASCII architecture block replaced with PNG image
- [ ] DOCX: Tables use `Plain Table 3` style
- [ ] Temporary scripts deleted after use

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Duplicate section numbers in DOCX headings (`"2.4  2.4 External..."`) | Always apply `strip_section_number()` before `doc.add_paragraph(style="Link_Heading_*")` |
| PNG export timeout (excalidraw CDN fails to load) | Render inline SVG directly — do NOT load excalidraw library from CDN in the export HTML |
| Countries / reference data appearing ambiguous in integration catalog | Internal routes table must have `Data source = MongoDB` (or equivalent DB) on every row |
| Supervisor auth route listed as both internal and external | List it in the internal routes table (BFF-internal path), with `Data source = IdP (API-009)` and a note that it wraps the external API-009 call |
| Code block not replaced by PNG in DOCX | Detection requires both `"Browser"` and BFF identifier in block text; broaden check if different terminology is used |

---

## Reference

- Peer skills: `generate-technical-design` (full TD from FDD), `excalidraw-diagram-generator` (standalone diagram), `generate-mockup` (UI screens).
- DOCX template discovery: ask the user if no template path is provided. Never create a blank-style DOCX without a template — the result will not match project style.
- Excalidraw viewer: [https://excalidraw.com](https://excalidraw.com) — drag-and-drop `.excalidraw` to open.

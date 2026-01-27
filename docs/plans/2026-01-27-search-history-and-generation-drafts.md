# Search History & Generation Drafts

> Enable search history persistence and multi-draft approval workflow for Ghost Writer.

## Problem Statement

**Trend Radar:** Ad-hoc searches are ephemeral. Users can't revisit past searches or their results.

**Ghost Writer:** Generated content overwrites previous versions. No approval gate before sending.

## Solution Overview

| Feature | Approach |
|---------|----------|
| Search History | Manual save creates snapshot. Option to convert to monitored topic. |
| Generation Drafts | Multiple drafts per edition. Explicit approval required before send. |

---

## Data Models

### SearchHistory

```prisma
model SearchHistory {
  id             String   @id @default(cuid())
  query          String   @db.Text
  queryExpanded  String?  @db.Text
  queryAnalysis  Json?    // { intent, timeScope, topics }

  resultCount    Int
  results        Json     // Snapshot of AnalyzedResult[]

  searchedAt     DateTime @default(now())

  // If converted to a topic
  convertedToTopicId String?
  convertedTopic     SearchTopic? @relation(fields: [convertedToTopicId], references: [id])

  // Multi-tenant
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String

  @@index([organizationId])
  @@index([searchedAt(sort: Desc)])
}
```

### GenerationDraft

```prisma
model GenerationDraft {
  id            String   @id @default(cuid())

  content       Json     // The full GeneratedNewsletter object
  brandVoiceId  String?  // Which voice was used

  status        DraftStatus @default(DRAFT)
  generatedAt   DateTime @default(now())
  approvedAt    DateTime?

  edition       Edition  @relation(fields: [editionId], references: [id], onDelete: Cascade)
  editionId     String

  // Multi-tenant
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String

  @@index([editionId])
  @@index([organizationId])
  @@index([status])
}

enum DraftStatus {
  DRAFT      // Just generated
  APPROVED   // Ready for send
  USED       // Was sent
  DISCARDED  // Rejected
}
```

### Schema Updates

Add relations to Organization model:
```prisma
searchHistory    SearchHistory[]
generationDrafts GenerationDraft[]
```

Add relation to Edition model:
```prisma
drafts GenerationDraft[]
```

Add relation to SearchTopic model:
```prisma
convertedFromHistory SearchHistory[]
```

---

## API Endpoints

### Search History

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search/history` | Save current search results |
| GET | `/api/search/history` | List saved searches (paginated) |
| GET | `/api/search/history/[id]` | Get single search with results |
| DELETE | `/api/search/history/[id]` | Delete a saved search |
| POST | `/api/search/history/[id]/convert` | Convert to SearchTopic |

### Generation Drafts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/drafts` | List drafts for edition (`?editionId=...`) |
| GET | `/api/drafts/[id]` | Get draft details |
| POST | `/api/drafts/[id]/approve` | Mark draft as approved |
| POST | `/api/drafts/[id]/discard` | Mark draft as discarded |

### Modified Endpoints

- `POST /api/generation/stream` - Creates `GenerationDraft` instead of updating edition directly

---

## UI Changes

### Trend Radar Page

**New "History" tab** (alongside Quick Search and Saved Topics):
- List of past searches, newest first
- Each row: query snippet, result count, date
- Click to expand and view saved results
- Actions: View Results, Convert to Topic, Delete

**Quick Search tab changes:**
- After results load, show "Save Search" button in results header
- Clicking saves query + results to SearchHistory
- Success toast: "Search saved"

**Import from history:**
- Same flow as current - click import on a result
- Goes to article review queue as PENDING_REVIEW

### Ghost Writer Page

**Drafts panel** (when edition selected):
- Shows all drafts for this edition, newest first
- Each draft: generated date, brand voice used, status badge
- Actions: View/Edit, Approve, Discard

**Generation flow change:**
- After generation completes, creates GenerationDraft with status DRAFT
- Edition's generatedContent NOT updated directly
- Show draft in editable preview

### Send Page

- Filter editions by those with APPROVED drafts
- Or show all with "Ready" vs "Needs approval" indicator
- When sending, use the approved draft's content
- Mark draft as USED after send

---

## Implementation Phases

### Phase 1: Schema & Search History Backend
1. Add SearchHistory model to schema
2. Add relations to Organization, SearchTopic
3. Create search history API endpoints
4. Run prisma db push

### Phase 2: Search History Frontend
1. Add History tab to Trend Radar page
2. Add "Save Search" button after results
3. Build history list view with expand/collapse
4. Add Convert to Topic functionality

### Phase 3: Generation Drafts Backend
1. Add GenerationDraft model and DraftStatus enum
2. Add relations to Edition, Organization
3. Modify generation stream to create drafts
4. Create drafts API endpoints
5. Run prisma db push

### Phase 4: Generation Drafts Frontend
1. Add Drafts panel to Generate page
2. Update generation flow to show new draft
3. Add approve/discard actions
4. Update Send page to check for approved drafts

---

## Verification

1. **Search History:** Run search → Save → See in History → Convert to Topic → Topic appears in Saved Topics
2. **Generation Drafts:** Generate for edition → See draft in panel → Edit → Approve → Go to Send → Edition shows as ready → Send → Draft marked USED
3. **Multiple drafts:** Generate twice → Both appear in panel → Approve one → Only that one available for send

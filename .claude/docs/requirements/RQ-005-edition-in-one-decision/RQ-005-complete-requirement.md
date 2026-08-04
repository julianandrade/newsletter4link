# Req ID: RQ-005-edition-in-one-decision

> Specification. Functional only: what the product must do, and how a reader can
> check that it does. Technical design belongs to the tech spec that follows.
>
> Source requirement: [`RQ-005.md`](RQ-005.md). All five open questions in that
> file carry answers, and those answers are binding here. Clarification answers
> live inside the requirement rather than in a separate clarifications file, which
> is why there is no `RQ-005-clarifications.md`.
>
> Written 4 August 2026, against the code as it stands at commit `428736f`.

---

## 1. Feature Overview

Producing the weekly edition becomes one decision.

The product assembles a proposal for the current week on its own, from what the
machine collected and scored, and shows it as the first thing a person sees. An
authorized person reads it and approves it, and that approval is what sends it.
Assembling, finalizing, previewing and sending stop being separate acts a person
has to perform in the right order.

Everything the pipeline does before that moment becomes visible as status: what
was collected, when, what it produced, what was rejected. The intermediate views
stay reachable for an editor who wants to intervene, but nobody has to pass
through them for the product to work.

Two defects are closed on the way through:

- The Feed and the Review queue show the same list of articles from the same
  query, and doing the work in one silently empties the other. One of them stops
  being a screen.
- Approving an article moves it somewhere real and says nothing about where. The
  destination exists already; the signpost does not.

And one latent data defect is closed while the area is open: deleting an edition
that was sent leaves its delivery history pointing at nothing.

---

## 2. Decisions carried forward, and closed

These five are answered in `RQ-005.md`. They are recorded here so nothing
downstream reopens them. **Do not redesign around any of these; if one looks
wrong, raise it as a new requirement rather than deciding differently in code.**

| # | Question | Decision, binding |
|---|---|---|
| D1 | Does automation send, or only propose? | **Propose only.** Automation assembles and presents. A person approves, and that approval is what sends. No unattended send path exists, and the one that exists today is removed (see [conflict C1](#11-conflicts-identified-and-how-they-are-resolved)). |
| D2 | What does the proposal contain when the machine is not confident? | **Propose what there is, marked as thin.** The proposal states how many were collected and how many rejected, so a light week reads as a light week. It never lowers the relevance threshold on its own, and never pads itself to look full. |
| D3 | Should approving an article still be a separate act? | **No.** The edition is the unit of approval. Approving an individual article stays available as optional editorial refinement. That is what turns the queue from a station into a view. |
| D4 | What happens to the Feed screen? | **The Feed becomes the proposal.** Opening the product shows this week's edition, already assembled. The Review queue survives as a filter of that view, not as a second screen. The Editions screen already carries the pipeline counts, so part of this moves rather than being built. |
| D5 | Deleting an edition that was sent: allowed, or blocked? | **Archive for anything sent; delete only for what was never sent; force delete allowed but OWNER-only and obliged to remove that edition's delivery events in the same transaction.** The confirmation states the real numbers. The existing single-edition delete carries the same hole and is fixed here. |

### 2.1 The correction that matters

An earlier reading of this requirement said an approved article "appears on
none" of the screens. That was wrong, and the requirement corrects it.
`app/dashboard/send/page.tsx` already loads approved articles and splits them
into those waiting and those already used in an edition.

**The defect is feedback and navigation, not visibility.** Whoever implements
this must not build a screen that already exists. Action 3 adds a signpost to a
destination that is already there.

### 2.2 Product-owner defaults set in this specification

Points the answers did not fix, decided here so nobody has to guess. Each is a
constant, not a setting: BR-001 forbids offering a setting that does not take
effect, and none of these needs to be configurable yet.

| Default | Value | Why |
|---|---|---|
| Proposal size target | Up to 10 articles and up to 5 projects | Matches what `POST /api/editions` auto-population already takes, so the proposal is not a second, different idea of "enough". |
| "Thin" marker | Fewer than 5 articles in the proposal | A light week must read as light without the product judging it. Five is the point below which a reader should be told rather than left to count. |
| Week identity | ISO week number and year, one shared helper for the whole product | Two helpers exist today and must not disagree about which week it is. |
| Who may approve and send | EDITOR or above | The role hierarchy already exists. Today the send endpoint asks for no role at all. |
| Who may force delete a sent edition | OWNER only | It destroys delivery history. |

---

## 3. Scope and delivery units

`RQ-005.md` says this requirement is the largest so far and should be split once
the questions are answered. They are answered, so here is the split. Each unit is
independently shippable and independently testable, in this order.

| Unit | Covers | Depends on |
|---|---|---|
| **RQ-005_01: Editions list, safe removal** | Actions 7 and 8 as they apply to editions, and the whole of D5 | Nothing. Ships alone. |
| **RQ-005_02: One list, and a signpost** | Actions 4 and 3 | Nothing. Ships alone. |
| **RQ-005_03: The proposal, and one approval** | Actions 1, 2 and 6, plus the approval record | RQ-005_02, because the proposal is the screen the Feed becomes |
| **RQ-005_04: What the machine is doing** | Action 5 | RQ-005_03 for placement; the data it reads exists already |

The folder convention for a split is `RQ-005/RQ-005_01/RQ-005_01.md` and so on
(`.claude/docs/requirements/README.md`). This specification covers all four
units; when the units get their own folders, each takes the acceptance criteria
carrying its number and nothing else changes.

**RQ-005_01 is partly built already.** Commit `c439bcb` added bulk selection and
delete to the editions list and tagged it RQ-005 action 7. It predates the answer
to D5, and it is the code path that would create the orphans D5 exists to prevent
(`includeSent: true` deletes a sent edition and leaves its `EmailEvent` rows
behind). The unit revises that work; it does not start from nothing.

---

## 4. User roles and permissions

The hierarchy is `VIEWER < EDITOR < ADMIN < OWNER`, already implemented in
`lib/auth/context.ts` (`hasRole`, `requireRole`).

| Role | May do |
|---|---|
| VIEWER | Read the proposal, the pipeline status, the editions list and every article view. May not approve, send, edit the proposal, archive, or delete. |
| EDITOR | Everything a VIEWER may do, plus: edit the proposal (add, remove, reorder, reject), approve an article, approve and send the edition, archive a sent edition, unarchive, delete an edition that was never sent. |
| ADMIN | As EDITOR. |
| OWNER | As ADMIN, plus force delete of a sent edition and its delivery events. |

Rules that apply to every route in this requirement:

- A request with no session, or with a session but no organization, is
  **Unauthorized** and answers **401**.
- A request from an authenticated member whose role is too low is **Forbidden**
  and answers **403**. The UI does not offer a control the current role cannot
  use, so a 403 is a defence, not the normal path.
- Every route reads and writes org-scoped data through the tenant client. A row
  belonging to another organization must be indistinguishable from a row that
  does not exist: **404, never 403 and never the row**.

---

## 5. User stories and acceptance criteria

Each of the eight Actions becomes one story. Criteria are written so a tester can
check them without reading the implementation. `[R]` marks a criterion that must
be covered by a unit test beside the code.

### Story 1: the proposal assembles itself

> As a business user, I want this week's edition to be already assembled when I
> open the product, so that I do not have to know that collection, scoring and
> assembly are separate steps.

Action 1. Unit RQ-005_03. Rules BR-010, BR-012, D1, D2.

- [ ] **AC-1.1** Opening the product with no edition for the current ISO week
      results in a proposal for that week existing, without the person asking for
      it and without a "Create edition" step.
- [ ] **AC-1.2** The proposal is populated from the organization's own approved
      and pending articles, highest relevance score first, then most recently
      published, up to 10 articles and 5 projects.
- [ ] **AC-1.3** Opening the product twice, or opening it while the scheduled
      proposal job runs, yields **one** proposal for the week, never two. A
      collision on week plus year plus organization resolves to the existing
      proposal rather than an error shown to the person. `[R]`
- [ ] **AC-1.4** A proposal is never created for an organization other than the
      one in context, and never contains an article or project from another
      organization. `[R]`
- [ ] **AC-1.5** The proposal states, in words a business user reads without
      hovering: how many articles were collected in the period, how many were
      rejected or scored below the threshold, and how many are in the proposal.
- [ ] **AC-1.6** When the proposal holds fewer than 5 articles it is marked as
      thin, and the mark names the reason using the counts from AC-1.5. `[R]`
- [ ] **AC-1.7** A thin proposal is **not** padded, and the relevance threshold is
      **not** lowered to fill it. Given a week where only 2 articles clear the
      threshold, the proposal holds 2 and says so. `[R]`
- [ ] **AC-1.8** The week and year shown on the proposal match the week and year
      used by every other part of the product for the same instant, including the
      scheduled job. One helper, one answer. `[R]`
- [ ] **AC-1.9** The proposal never sends itself. No code path sends to
      subscribers without a human approval recorded against it (see AC-2.6).

### Story 2: one approval sends it

> As an authorized person, I want approving the proposal to send it, so that
> producing the newsletter is one decision rather than four.

Action 2. Unit RQ-005_03. Rules BR-010, BR-011, D1.

- [ ] **AC-2.1** The proposal screen offers a single primary control that approves
      and sends. Using it does not require a preceding save, finalize, or preview
      action, and does not require navigating to another screen.
- [ ] **AC-2.2** The rendered edition is visible on the proposal screen before
      approving. Approving does not require opening the preview, and opening the
      preview is not a step in the flow.
- [ ] **AC-2.3** The control asks for confirmation once, and the confirmation
      states what is about to happen: the edition, the number of articles, and the
      number of active recipients.
- [ ] **AC-2.4** On confirmation, the current contents of the proposal, including
      unsaved editorial changes, are what gets sent. Nothing sends a stale version
      of the edition. `[R]`
- [ ] **AC-2.5** After a successful send the edition reads as sent, carries the
      time it was sent, and can no longer be edited.
- [ ] **AC-2.6** The record of the send names **who** approved it and **when**,
      both stored and visible on the edition and in the editions list. An edition
      in the sent state with no approver recorded is a defect. `[R]`
- [ ] **AC-2.7** A VIEWER is not offered the control, and a VIEWER's direct
      request to send answers **403** without sending anything. `[R]`
- [ ] **AC-2.8** When the send partly fails, the edition still reads as sent, and
      the result states how many recipients received it and how many failed. Mail
      that went out cannot be un-sent by a screen. `[R]`
- [ ] **AC-2.9** When the send fails outright the edition does **not** read as
      sent, no approval is recorded, and the person is told in one message what
      failed. The edition remains approvable once the cause is fixed. `[R]`
- [ ] **AC-2.10** Approving twice sends once. A second confirmation against an
      already sent edition is refused with a message saying it was already sent,
      by whom, and when. `[R]`

### Story 3: approving says where the work went

> As a person reviewing stories, I want approving one to tell me where it went
> and take me there, so that approving does not read as losing it.

Action 3. Unit RQ-005_02. Rules BR-009, D3.

- [ ] **AC-3.1** Approving an article produces a message that names the
      destination in the product's own words, not the schema's: the story is
      approved and waiting for an edition.
- [ ] **AC-3.2** The message carries an action that goes to that destination in
      one step, and that action lands on a view where the just-approved story is
      visible. `[R]`
- [ ] **AC-3.3** The message carries an undo that returns the story to awaiting a
      decision, and undo restores it to the list it left. `[R]`
- [ ] **AC-3.4** The same message, destination and undo appear whether the story
      was approved one at a time or as part of a bulk action. A bulk approval
      reports the count and the destination. `[R]`
- [ ] **AC-3.5** Rejecting an article gets the same treatment: a message saying it
      was rejected, where rejected stories can be seen, and an undo. `[R]`
- [ ] **AC-3.6** No screen is built for the destination. The existing approved and
      waiting view is the destination.

### Story 4: the same list stops being two screens

> As a person moving around the product, I want one place where stories awaiting a
> decision live, so that I can tell whether I am looking at two things or one.

Action 4. Unit RQ-005_02. Rules BR-012, D4.

- [ ] **AC-4.1** Exactly one screen renders the list of articles awaiting a
      decision. Checkable: only one route builds a list from the pending-articles
      query.
- [ ] **AC-4.2** The proposal screen is that place. The queue survives inside it
      as a filter or view of the same screen, reachable in one action.
- [ ] **AC-4.3** The old review route no longer renders a second copy of the list.
      A person or a bookmark arriving at it lands on the proposal screen with the
      queue filter applied, and nothing they had done is lost.
- [ ] **AC-4.4** Navigation offers one entry for this work, pointing at the
      filter, not at a second screen. No two navigation entries lead to the same
      list under two names.
- [ ] **AC-4.5** Acting on a story in the queue filter updates the counts and the
      contents everywhere on the screen at once. There is no second list left
      holding a story that was just decided. `[R]`
- [ ] **AC-4.6** Every capability the review screen offers today survives the
      consolidation: filtering, editing a story's fields, single decisions and
      bulk decisions with their confirmation. Nothing on the list below is lost.

### Story 5: the machine says what it is doing

> As a person opening the product once a week, I want to see what was collected
> and when, so that I never have to start a run to find out whether one is needed.

Action 5. Unit RQ-005_04. Rules BR-010, D2.

- [ ] **AC-5.1** The proposal screen shows, without navigating anywhere: when
      collection last ran, whether it succeeded, and what it produced (found,
      curated, duplicates, below threshold, errors).
- [ ] **AC-5.2** It shows whether a run is in progress, and its progress, without
      the person starting one.
- [ ] **AC-5.3** It says whether a run is needed, in those terms. Learning this
      never requires starting a run. `[R]`
- [ ] **AC-5.4** It shows the assembly state of this week's proposal: assembled or
      not, from how many candidates, and whether it is thin.
- [ ] **AC-5.5** Every count shown is the current organization's own. No count
      shown to a member of one organization includes another organization's rows.
      `[R]`
- [ ] **AC-5.6** When collection last failed, the status says so and says when,
      rather than showing the last successful run as though it were current. `[R]`
- [ ] **AC-5.7** Starting a run by hand remains possible for an EDITOR or above,
      as an override rather than a step in the weekly flow.

### Story 6: the editor keeps the controls

> As an editor, I want to change the proposal without leaving it, so that
> intervening is cheap and does not put me back into a sequence of screens.

Action 6. Unit RQ-005_03. Rules BR-010, D3.

- [ ] **AC-6.1** From the proposal, an EDITOR can add an article that is approved
      or pending and not already in it, and the addition shows immediately.
- [ ] **AC-6.2** From the proposal, an EDITOR can remove an article. Removing it
      from the edition does not reject it: it returns to approved and waiting, and
      the message says so. `[R]`
- [ ] **AC-6.3** From the proposal, an EDITOR can reorder its contents, and the
      order persists across a reload and is the order the sent email uses. `[R]`
- [ ] **AC-6.4** From the proposal, an EDITOR can reject an item. It leaves the
      proposal, is recorded as rejected, and the message says where rejected
      stories can be seen, with an undo (AC-3.5).
- [ ] **AC-6.5** Every one of these is done without leaving the proposal screen
      and without a separate save step. Whatever is on screen is what would be
      sent (AC-2.4).
- [ ] **AC-6.6** The same controls work for projects as for articles: add, remove,
      reorder.
- [ ] **AC-6.7** None of these controls is offered on an edition that has been
      sent, and a request to change a sent edition is refused with a message
      saying it was already sent. `[R]`
- [ ] **AC-6.8** A VIEWER sees the proposal and none of these controls, and a
      direct request answers **403**. `[R]`

### Story 7: bulk selection on the editions list

> As a person tidying up, I want to select editions and act on them the way I do
> on every other list, so that the editions list is not the one exception.

Action 7. Unit RQ-005_01. Rules D5.

- [ ] **AC-7.1** The editions list offers selection with the same behaviour as the
      five lists that have it: a row checkbox, a header checkbox with a mixed
      state, shift-click to extend a range, Escape to clear, and a bar that
      appears once something is selected.
- [ ] **AC-7.2** Select-all means every edition currently visible, never every
      edition in the database, and the count on the bar is the count that will be
      acted on. `[R]`
- [ ] **AC-7.3** Changing the filter, including the archived filter, prunes the
      selection to what is still visible rather than clearing it or keeping hidden
      rows selected. `[R]`
- [ ] **AC-7.4** The bar offers, for the current selection: **Archive** for
      editions that were sent, **Delete** for editions that were never sent, and
      for an OWNER only, **Force delete** for editions that were sent.
- [ ] **AC-7.5** A mixed selection is handled by outcome, not refused: the bar
      reports what was deleted, what was archived, and what was held back and why.
      `[R]`
- [ ] **AC-7.6** A bulk action that affects fewer editions than were selected says
      so, with the number and the reason. Silently affecting fewer rows than asked
      is the failure this criterion exists to catch. `[R]`
- [ ] **AC-7.7** A single request is capped at a stated number of editions and a
      request above the cap is refused with that number in the message. `[R]`
- [ ] **AC-7.8** A bulk request naming an edition from another organization
      affects nothing and reports it as not found. `[R]`

### Story 8: nothing is lost silently

> As anyone using this product, I want every action that removes work to be
> reversible or confirmed, and to say what happened, so that I can trust the
> product with a week's work.

Action 8. Units RQ-005_01 and RQ-005_02. Rules BR-009, D5.

- [ ] **AC-8.1** Every action that removes work from the flow, approving,
      rejecting, removing from the proposal, archiving, deleting, is either
      reversible or confirmed first, and every one of them reports what happened.
      No action is both irreversible and unconfirmed.
- [ ] **AC-8.2** **Anything sent is archived, not deleted.** An archived edition
      keeps its contents, its send record and its delivery history. Nothing is
      destroyed. `[R]`
- [ ] **AC-8.3** Archived editions are hidden from the default editions list and
      reachable under an explicit filter, and unarchiving restores the edition to
      the default list. `[R]`
- [ ] **AC-8.4** **Delete remains available for an edition that was never sent.**
      Such an edition has no delivery history, so there is nothing to orphan and
      nothing to preserve. It is confirmed once, and the confirmation says the
      edition and its contents go. `[R]`
- [ ] **AC-8.5** **Force delete of a sent edition is allowed, restricted to
      OWNER**, and deletes that edition's delivery events in the same transaction.
      A non-OWNER is not offered it and is refused **403**. `[R]`
- [ ] **AC-8.6** The force-delete confirmation states the real numbers, read from
      the data at the moment of asking, not a generic warning: this also destroys
      N delivery records for M recipients. `[R]`
- [ ] **AC-8.7** **Invariant, the point of D5: after any delete, archive or force
      delete, no delivery event points at an edition that does not exist.** The
      count of delivery events whose edition is missing is zero before and after
      every operation in this requirement. Checkable directly against the data.
      `[R]`
- [ ] **AC-8.8** The invariant holds for the pre-existing single-edition delete as
      well, which today would leave events behind. That path is fixed here, not
      left for the next requirement. `[R]`
- [ ] **AC-8.9** If any part of a force delete fails, none of it takes effect:
      neither the edition nor its events are half removed. `[R]`
- [ ] **AC-8.10** The existing baseline is 71 delivery events across 19 editions
      with zero orphans. Acceptance includes checking that the number of orphans
      is still zero after the work lands.

---

## 6. Business Rules

Restated from the requirement, with where each is enforced and how a reader
checks it. BR-009 to BR-012 are private to RQ-005; BR-001 is shared with RQ-002
and RQ-003.

| Rule | Statement | Enforced by | Checked by |
|---|---|---|---|
| **BR-009** | When an action moves work off the screen a person is using, the interface must say where it went. | Every approve, reject, remove, archive and delete reports its outcome and its destination. | AC-3.1, AC-3.4, AC-3.5, AC-6.2, AC-6.4, AC-8.1 |
| **BR-010** | The product must not require a person to know the order of internal steps in order to produce its output. | The proposal exists unasked; one control approves and sends; status replaces the need to start a run. | AC-1.1, AC-2.1, AC-2.2, AC-5.3, AC-6.5 |
| **BR-011** | Sending to subscribers requires an explicit human approval, and that approval is recorded. Automation may assemble and propose; it may not send. | The approval record on the edition; removal of the unattended send path. | AC-1.9, AC-2.6, AC-2.7, and conflict C1 |
| **BR-012** | Two screens must not present the same data as though they were different things. | One screen renders the pending list; the queue is a filter of it. | AC-4.1, AC-4.3, AC-4.4 |
| **BR-001** | A setting the product offers must take effect, or must not be offered. | No new setting is introduced by this requirement. The proposal size, the thin marker and the week helper are constants. | Section 2.2; a reviewer finds no new toggle |

Two further rules follow from D5 and are stated here so they are testable rather
than implied:

| Rule | Statement | Checked by |
|---|---|---|
| **BR-013** | Delivery history is never orphaned. An edition's delivery events are either preserved with the edition or removed with it, in the same transaction, never left pointing at nothing. | AC-8.7, AC-8.8, AC-8.9, AC-8.10 |
| **BR-014** | Destroying delivery history is an OWNER's decision, taken against stated numbers. | AC-8.5, AC-8.6 |

---

## 7. Data Requirements

What the product needs to hold, described functionally. The shapes are the tech
spec's business.

- **One proposal per organization per week.** Identified by ISO week and year.
  Two proposals for the same week in the same organization must be impossible,
  not merely unlikely.
- **The approval record.** For any edition that was sent: who approved it,
  identified in a way that survives that person leaving, and when. Immutable once
  set.
- **The archive marker.** For any edition: whether it is archived, and when it
  was archived. Absence of the marker is the default, visible state.
- **The proposal's counts.** For the period the proposal covers: how many
  articles were collected, how many rejected or below threshold, how many are in
  the proposal. These are derived, not entered.
- **Pipeline status.** The last collection run's outcome and timing, and whether
  one is in progress. This data already exists as curation job records.
- **The association between a delivery event and its edition.** Today this is a
  bare identifier with nothing holding it to an edition, which is exactly why
  deleting the edition orphans the event. Whatever the tech spec chooses, the
  functional requirement is BR-013: the association can never point at nothing.
- **Ordering within the proposal.** The order an editor sets is the order the
  email uses, and it survives a reload.

Everything above is organization-scoped and read and written through the tenant
client. No count, list or record in this requirement crosses an organization
boundary.

---

## 8. User Workflows

### 8.1 The weekly path, which is the point of the requirement

1. A person opens the product. The proposal for this week is on screen,
   assembled, with the week's counts and the pipeline status beside it.
2. They read it. The rendered edition is on the same screen.
3. They approve. One confirmation states the edition, the number of articles and
   the number of recipients.
4. It sends. The screen says it was sent, to how many, and records who approved
   it and when.

No step in this path requires knowing that collection, scoring, assembly,
finalizing and sending are distinct.

### 8.2 The editor's path

1. Same start. The proposal is on screen.
2. The editor removes a story that does not fit. It returns to approved and
   waiting, and the message says so.
3. They open the queue filter on the same screen, approve two more stories, and
   each message offers to take them to where those stories now wait.
4. They add one of them to the proposal and reorder the top three.
5. They approve and send, as in 8.1.

### 8.3 The light week

1. The proposal holds 2 articles and is marked thin, stating that 40 were
   collected and 38 were below the threshold.
2. The person can send it as it stands, add from what is waiting, or leave it.
3. Nothing pads the proposal and nothing lowers the threshold on their behalf.

### 8.4 Tidying the editions list

1. A person selects six editions: four drafts and two sent.
2. The bar offers Delete for the four and Archive for the two.
3. They archive the two: the editions leave the default list, keep everything,
   and are reachable under the archived filter.
4. They delete the four, confirming once.
5. The bar reports: four deleted, two archived, nothing held back.
6. An OWNER who genuinely needs a sent edition gone uses Force delete, and the
   confirmation tells them it also destroys 11 delivery records for 9 recipients.
   After it runs, no delivery event points at a missing edition.

---

## 9. Dependencies

- **Collection on a schedule rather than on demand.** Satisfied: a scheduled
  collection already runs daily.
- **Scoring good enough that a proposal is worth reading.** Satisfied by RQ-002,
  which made the model configurable and made the selected model the one that
  runs.
- **A template that renders a proposal.** Satisfied by RQ-003, which made the
  built-in edition selectable and made both switches work.
- **The approved-and-waiting view.** Exists. Action 3 points at it; it is not
  rebuilt.
- **The bulk selection primitive.** Exists and is used by five lists. Action 7
  reuses it and does not grow a second one.
- **Preconditions carried from the requirement**: at least one source active and
  healthy; the organization has a template, built-in or stored; the person
  approving is authorized to send.

Downstream: RQ-006 adds a per-article control inside the edition builder and
RQ-004 adds scoring. Both build on the flow this requirement consolidates, which
is why the roadmap puts RQ-005 first.

---

## 10. Constraints the implementation inherits

Not design choices, house rules. Listed because a reviewer checks them and
because getting one wrong is a defect rather than a preference.

- Org-scoped data goes through the tenant client in `lib/db/tenant.ts`. Never
  bare `prisma` for anything carrying `organizationId`.
- Every API route: `try`/`catch`, `Unauthorized` mapped to **401**, `Forbidden`
  mapped to **403**, nothing else leaking to the client.
- UI uses the vocabulary in `components/radar/primitives.tsx` and
  `controls.tsx`. Bulk selection uses `components/radar/selection.tsx`, the one
  five screens already use.
- Every UI fetch has a loading state and an error state.
- No long dashes anywhere, comments included.
- New code carries an `RQ-005` tag where a reader would otherwise ask why it
  exists.
- Unit tests beside the code, in the style of `tests/unit/selection.test.tsx`.
- `npx tsc --noEmit` and `npx vitest run` both clean before the work is handed on.

---

## 11. Conflicts identified, and how they are resolved

Found in the code while specifying. Each is a live contradiction with something
this requirement decides, so each carries a resolution rather than a note.

**C1. An unattended send already exists, and D1 forbids it.**
`vercel.json` schedules `/api/cron/weekly-send` every Sunday at 12:00 UTC. That
route iterates every organization, auto-finalizes the week's edition when it is
still a draft, and sends it to subscribers with no human in the loop.
**Resolution:** the scheduled job becomes propose-only. It assembles or refreshes
the week's proposal and stops. It never sends and never marks an edition sent.
This is the single largest behavioural change in the requirement and it is not
optional: BR-011 and D1 both forbid what the job does today. Existing schedule
and secret handling stay; only the outcome changes.

**C2. The single-edition routes bypass the tenant client.**
`app/api/editions/[id]/route.ts` uses bare `prisma` for GET, PATCH and DELETE,
with no organization filter and no auth call at all. Any authenticated request
can read, modify or delete another organization's edition by id.
**Resolution:** those handlers go through `requireOrgContext` and the tenant
client, and an edition outside the caller's organization answers 404. This is in
scope because AC-8.8 requires touching that DELETE anyway.

**C3. Bulk delete can already orphan delivery history.**
`app/api/editions/bulk/route.ts` accepts `includeSent: true` and deletes sent
editions with `deleteMany`, touching no `EmailEvent` rows. `EmailEvent.editionId`
is a plain string with no relation and no cascade, so those rows survive pointing
at nothing. That path is the reason D5 exists.
**Resolution:** `includeSent` stops meaning "delete anyway". Sent editions are
archived; force delete is a distinct, OWNER-only action that removes the events
in the same transaction (AC-8.5, AC-8.7).

**C4. The existing single delete is narrower than the requirement and still
holed.** It refuses anything that is not a draft, so a finalized-but-never-sent
edition cannot be deleted today, and it does no event cleanup.
**Resolution:** delete covers anything never sent, which includes finalized
drafts, and cleans up events as a defence even where none should exist.

**C5. The roadmap lists editions bulk selection as live.**
`.claude/docs/requirements/ROADMAP.md` counts editions among the five lists with
bulk select and delete. True, and it predates D5.
**Resolution:** the roadmap entry is accurate about selection and stale about
deletion. RQ-005_01 revises the behaviour; the roadmap should be corrected when
the unit lands, not before.

**C6. `/api/status` counts across every organization.**
It uses bare `prisma` to count articles, projects and subscribers with no
organization filter, and returns the most recent edition in the whole database.
**Resolution:** nothing in this requirement may source a displayed count from it.
The pipeline status in Story 5 reads tenant-scoped data (AC-5.5). Making
`/api/status` itself tenant-aware, or reducing it to a health check with no
counts, is worth doing and is **out of scope here**: flagged for its own
requirement.

**C7. Two week-number helpers.**
`app/dashboard/send/page.tsx` and `app/api/cron/weekly-send/route.ts` each
compute the week independently. Two answers to "which week is it" is how a
scheduled proposal and a screen end up disagreeing about which edition is
current.
**Resolution:** one shared helper, used by both (AC-1.8).

**C8. Sending asks for no role.**
`POST /api/email/send-all` calls `requireOrgContext` and no role check, so a
VIEWER can send to every subscriber.
**Resolution:** EDITOR or above, enforced server-side (AC-2.7). The requirement's
own precondition already says the person approving must be authorized.

---

## 12. Out of scope

Stated so nobody widens the work on their own.

- Making `/api/status` tenant-aware (C6). Flagged, separate.
- Any per-article control inside the builder beyond add, remove, reorder and
  reject. That is RQ-006.
- New scoring, new signals, or a fourth AI call. That is RQ-004.
- Rewriting the 2,259-line edition builder screen. This requirement changes the
  path a person takes through it and the controls the proposal offers; a
  wholesale rewrite is not part of it.
- Any new user-facing setting, including a configurable proposal size or thin
  threshold. BR-001, and section 2.2.
- Unsending, recalling, or editing a sent edition.
- Retention or pruning of delivery events in general. Only the events belonging to
  an edition being force deleted are touched.

---

## 13. Open Questions

None blocking. The five questions in `RQ-005.md` are answered and recorded in
section 2, and the gaps those answers left are decided in section 2.2 as
product-owner defaults.

Two things a stakeholder may want to revisit later, neither of which stops the
work:

1. **The thin threshold of 5 articles** is a judgement, not a measurement. If a
   few light weeks show it marking proposals that read fine, it is one constant to
   change. It stays a constant, not a setting, until there is a reason.
2. **Whether an archived edition should ever leave the archive automatically.**
   The answer here is no: archiving is reversible only by a person. Nothing
   expires on its own.

---

## 14. Traceability

| Action | Story | Acceptance criteria | Rules | Unit |
|---|---|---|---|---|
| 1. Propose the edition without being asked | 1 | AC-1.1 to AC-1.9 | BR-010, BR-012, D1, D2 | RQ-005_03 |
| 2. Send on one approval | 2 | AC-2.1 to AC-2.10 | BR-010, BR-011, D1 | RQ-005_03 |
| 3. Say where work went | 3 | AC-3.1 to AC-3.6 | BR-009, D3 | RQ-005_02 |
| 4. Stop showing one list twice | 4 | AC-4.1 to AC-4.6 | BR-012, D4 | RQ-005_02 |
| 5. Say what the machine is doing | 5 | AC-5.1 to AC-5.7 | BR-010, D2 | RQ-005_04 |
| 6. Keep the editor's controls | 6 | AC-6.1 to AC-6.8 | BR-010, D3 | RQ-005_03 |
| 7. Select in bulk on editions | 7 | AC-7.1 to AC-7.8 | D5 | RQ-005_01 |
| 8. Never lose work silently | 8 | AC-8.1 to AC-8.10 | BR-009, BR-013, BR-014, D5 | RQ-005_01, RQ-005_02 |

Postconditions from the requirement, and where each is proven:

| Postcondition | Proven by |
|---|---|
| A proposed edition exists for the current week without anyone having asked | AC-1.1, AC-1.3 |
| Approving it sends it, and the record shows who approved and when | AC-2.1, AC-2.5, AC-2.6 |
| Approving reports where the article went, and getting there is one step | AC-3.1, AC-3.2 |
| Editions can be selected and deleted in bulk | AC-7.1, AC-7.4, AC-8.4 |

CRUD, from the requirement:

| Operation | Where it lands |
|---|---|
| CREATE a proposed edition, once per week per organization | AC-1.1 to AC-1.4 |
| READ the proposal, the pipeline status, articles at every stage | AC-1.5, AC-4.2, AC-5.1 to AC-5.6 |
| UPDATE the proposal's contents and an article's stage | AC-6.1 to AC-6.7, AC-3.3 |
| DELETE editions, individually and in bulk | AC-7.4 to AC-7.8, AC-8.2 to AC-8.9 |

---

## 15. Handoff

- **Specification:** this file.
- **Next step:** architecture. `@frontend-architect` produces
  `RQ-005-tech-spec.md` in this folder, treating the route handlers as part of the
  same unit of work as the screens, per `docs/AIDLC.md`.
- **Branch naming:** `RQ-005-edition-in-one-decision`, or the unit's own id when
  the split is taken up.
- **Read before designing:** `CLAUDE.md` for the stack and the constitutional
  principles, `docs/AIDLC.md` for which shared agents assume the wrong stack, and
  section 10 above for the constraints that are not negotiable.
- **Ignore any agent instruction that assumes .NET or Angular.** This is Next.js
  16, React 19, TypeScript and Prisma against Supabase.

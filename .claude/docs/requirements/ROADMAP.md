# Where the work stands

Updated 4 August 2026, at commit `9fbaa17`. Everything below "Live" is deployed
and verified in production.

## Live

| What | Requirement | Notes |
|---|---|---|
| The AI Radar email, built from the Claude Design project | none | Used by any send that names no template |
| Version 5 models, one shared list, validated on save | none | The settings screen warns on a superseded stored value |
| MFA by TOTP on password sign-ins, domain allowlist | none | **Never tested with a real password login** |
| Bulk select, act and delete on five lists | none | Sources, Review, Subscribers, Projects, Editions |
| The selected AI model is the model that runs | RQ-002 | Fifteen call sites; also fixed the relevance threshold disagreeing with itself |
| The built-in edition appears in the template list, and both switches work | RQ-003 | "Use this one" wrote a flag nothing read |
| Bulk rejection asks first | none | It did not, and 23 stories were lost to one click |
| 45 verified AI feeds, importable | none | **The file exists; it has not been imported** |
| AIDLC adopted, spec-kitty removed, repository tidied | none | `docs/AIDLC.md` records what diverges |
| The weekly edition is one decision: automation proposes, a person sends | RQ-005 | The unattended send route is deleted, not unscheduled |
| Scheduled routes refuse a request when no secret is configured | none | They were fail-open, and `CRON_SECRET` was unset, so an unauthenticated send-to-all was publicly callable |
| Sending requires EDITOR, and records who approved it | RQ-005 | Membership alone used to be enough, so a VIEWER could mail everyone |
| One ISO week helper for the whole product | RQ-005 | Replaced eight copies that filed the same week under two years at a new year |

## Waiting on a decision from you

Ordered by how much they block.

**RQ-005 is built and live.** What remains open:

1. **RQ-004 watchlist.** Which categorized topics scope it. Recommendation:
   Large Language Models, AI Tools, AI Research, Cloud AI, AI Regulation. Phase A
   (collectors, forward only, no backfill) waits on this answer and nothing else.
2. **RQ-002 Q7.** Whether the curation job gets a model column. Costs a
   `prisma db push`. The log entry already records the effective model.
3. **RQ-006 F3.** Which publishers may be fetched for full text. That is a
   default-deny list, and choosing what goes on it is an editorial decision rather
   than a technical one.

## What RQ-005 did not finish

Three pieces of it are specified and not built. None of them break anything; each
is a control that exists in the API and has no button.

- **The editions screen has selection and delete only.** Archive, unarchive and
  force delete all work over `PATCH /api/editions/bulk`, and the list accepts
  `?archived=exclude|only|all`, but nothing in the UI reaches them.
- **`lib/radar/pipeline.ts` was never written.** `decideRunNeeded` and
  `readPipelineStatus` in tech spec 4.1 have no implementation.
- **`lib/auth/roles.ts` and `components/radar/use-role.ts` are missing**, and
  `components/proposal/use-can-edit.ts` stands in for both. The server is the
  authority either way, so this is duplication rather than a hole.

## What I recommend, and why

**RQ-005 is done. The order below still holds for what is left.**

RQ-005 came first because you told me the flow was unusable and both other
requirements build on that flow. That is now settled, and RQ-006's per-article
toggle has a shape to fit into rather than one to undo.

After RQ-005, do **RQ-004 up to its gate** (`RQ-004_04`, the retrospective lead
time). That gate can kill the feature cheaply, before the scoring, the API and the
UI are built. Finding out that the radar does not lead the media costs two
sub-requirements instead of eight.

RQ-006 last, because it carries the only risk on this list that is not technical.

## Loose ends, small and cheap

- **Two of your seven active feeds are dead.** VentureBeat AI has not published in
  77 days, `/dev/random` in 1020. Deactivating them is two clicks and makes the
  source health honest.
- **The verified OPML has not been imported.** 45 feeds,
  `docs/reference/ai-feeds-verified.opml`, one import, categories applied from the
  folder names. Read the header first: the four arXiv feeds carry 100 to 710 items
  a day each.
- **428 sources sit in one category called Security.** They are correctly
  labelled, and one bucket that size is useless for filtering. Sub-dividing into
  threat intel, DFIR, appsec, cloud and vendor is worth doing if the security
  corpus has a purpose here. If it does not, that is the more useful thing to
  decide.
- **A password login has never been tried.** The MFA gate is live. If TOTP is off
  in the Supabase project, nobody with a password can get in and Office 365 masks
  it.
- **`NEXT_PUBLIC_APP_URL` locally points at port 3000** while the dev server runs
  on 3111, so links in locally generated emails point at the wrong port.

## What is not on this list

Two things deliberately.

**Reddit, GitHub and Hugging Face as ingestion sources**, beyond RSS. Raised, never
specified, and the record shows nothing. It is a real requirement and wants
writing before it wants building.

**The security corpus as a second product line.** 428 curated security feeds is an
asset. Whether this engine should produce a security brief alongside the AI one is
a product decision, not a backlog item, and nobody has made it.

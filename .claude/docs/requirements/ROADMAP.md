# Where the work stands

Updated 4 August 2026, at commit `d6318d8`. Everything below "Live" is deployed
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

## Waiting on a decision from you

Ordered by how much they block.

**RQ-004, RQ-005 and RQ-006 are all answered as of 4 August 2026.** RQ-005 is
ready to specify and build. What remains open:

1. **RQ-002 Q7.** Whether the curation job gets a model column. Costs a
   `prisma db push`. The log entry already records the effective model.
2. **RQ-006 F3.** Which publishers may be fetched for full text. That is a
   default-deny list, and choosing what goes on it is an editorial decision rather
   than a technical one.

## What I recommend, and why

**Do RQ-005 before RQ-004 and RQ-006.**

The reasoning is not that RQ-005 is bigger or newer. It is that you told me the
current flow is unusable, and both other requirements build on that flow:

- RQ-006 adds a per-article toggle in the edition builder, which is another
  station in a sequence we have just agreed should be one decision. Building it
  first means building something RQ-005 then has to undo.
- RQ-004 adds a fourth Claude call per article and RQ-006 a fifth. Paying for AI
  on a pipeline nobody can drive is the wrong order of spending.
- RQ-005 is mostly consolidation: two screens that show the same data become one,
  approving says where the work went, a proposal assembles itself. Low technical
  risk, and it is the difference between a demo and a product.

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

# Review of the Link Take plan

Reviewed against the repository at commit `c439bcb`, and against the feed list
added in `docs/reference/ai-feeds-verified.opml`, which changes two of the plan's
assumptions.

The plan is unusually careful for a feature of this kind. Most "AI rewrites the
news" designs skip straight to the prompt; this one leads with length, structure,
attribution and no-verbatim rules, which are the right four constraints. The data
model is sound and the hybrid eager/lazy trigger is the correct shape.

Six findings. The first is the one that changes the design.

---

## F1. In EXCERPT mode the format requirement forces fabrication

The plan sets a body length of 150 to 250 words and requires a lede plus a
"Relevância" section of 2 to 4 sentences. In EXCERPT mode the input is an RSS
excerpt: often 200 to 400 characters, sometimes a single sentence.

Asking for 150 words of grounded prose from 40 words of input is asking the model
to invent. Rule 3 says "the rewrite says less, not more", but the word floor and
the mandatory two-section structure say the opposite, and format instructions win
against soft guidance in practice. The two rules contradict each other and the
contradiction resolves in favour of fabrication.

This is not a corner case. The feed research established that excerpt-only RSS is
now the norm at Ars Technica, The Verge and TechCrunch, three of the six news
feeds in the list. EXCERPT will be the common path, not the fallback.

**Fix, and it must be in the requirement rather than the prompt:**

- In EXCERPT mode there is **no word floor**. A valid output may be 40 words.
- In EXCERPT mode the "Relevância" section is **optional**, and omitted when the
  excerpt does not support a specific connection.
- Below a floor of usable input, say 200 characters, **generate nothing** and show
  the excerpt with its attribution. A missing Link Take is honest; an invented one
  is a liability.

## F2. "No verbatim sentences" is a prompt instruction, not a guarantee

Rule 4 is the load-bearing copyright rule and nothing enforces it. Models
paraphrase well and still reproduce distinctive sentences, especially short
punchy ones, and especially in EXCERPT mode where there is little else to work
with.

This is mechanically checkable and cheap: compute word shingles (8-grams) of the
source text and of the output, and reject on any exact match. Same for the 15-word
quote limit, which is the same check at a different length.

The same applies to rule 3. Extract every number and date from the source, and
reject an output containing a number that does not appear in the input. Invented
figures are the most damaging hallucination in a business newsletter and the
easiest to catch.

**Both checks belong in the generation path, with a single retry and then a
`FAILED` status.** Without them the hard rules are aspirations, and there is no
way to demonstrate afterwards that they held.

## F3. Full-text extraction is a different legal posture from reading RSS

Ingesting an RSS feed the publisher offers is one thing. Fetching the article page
and extracting its body is scraping, and several of the publishers in the feed list
truncate their RSS precisely because they want the reader on the page.

The plan's rule, "if the fetch returns 401, 402 or 403, use EXCERPT mode", does not
cover the common case: paywalled pages usually return **200** with a gate, or 200
with the first two paragraphs and a subscribe wall. Status codes will not detect
that.

What the requirement needs:

- A real `robots.txt` check before any full-text fetch, honoured per path.
- A per-domain policy list, default deny for anything not on it, so adding a
  publisher is a deliberate act.
- A declared `User-Agent` identifying the tool and a contact address, which is
  both the courteous and the defensible choice.
- Treat a page whose extracted body is suspiciously short, or contains subscribe
  wall markers, as EXCERPT rather than FULL_TEXT.

## F4. The cost estimate is wrong under the feed list that now exists

"Tens per day, not hundreds" holds only while the source list stays small. The
verified feed list contains four arXiv feeds carrying 100 to 710 items **each per
day**. Enabling them, which is the point of having them, puts the eager trigger
into the hundreds daily on its own.

The arithmetic worth stating in the requirement: this is the **fifth** Claude call
per article. Today it is score, summarise, categorise. RQ-004 adds entity
extraction. This adds the rewrite, and the rewrite is by far the longest output.
The circuit breaker of 300 per day per org is a sensible guard, but it will engage,
and what happens when it does needs deciding rather than discovering: silently skip,
queue for tomorrow, or stop and tell someone.

## F5. `articleId @unique` prevents the audit trail this feature needs

One rewrite per article means regeneration overwrites history. For a feature whose
main risk is copyright and fabrication, the thing you most want six months later is
"what did we publish, generated from what input, by which model, and did the checks
pass".

Drop the unique constraint, add `supersededAt`, and keep old rows. Storage is
nothing; the record is the point. This also makes F2's checks provable after the
fact rather than only at generation time.

## F6. Two smaller things

**STALE has no mechanism.** The status exists and nothing computes it. Add a
content hash to `Article`, set on write, and compare at read. Otherwise `STALE` is
a value that is never assigned.

**"Relevância para a Link" is hardcoded in the plan** while the plan itself says
not to hardcode Link specifics. The section heading and its language should come
from settings alongside `orgContextPrompt` and `rewriteLanguage`, or the feature is
untranslatable and unusable by a second organization.

---

## Where this collides with RQ-005

RQ-005 asks for the weekly edition to become one decision. This plan adds a
per-article toggle in the edition builder ("usar análise Link"), which is another
station a person has to visit and set.

They can be reconciled: make it an organization-level default (use the Link Take
when one exists, fall back to the summary) with a per-article override for the
editor who wants it. That way the toggle exists for the person who needs it and
costs nothing for the person who just wants to approve the edition.

## What to decide before implementing

1. **Does a human read every Link Take before it reaches a subscriber?**
   **Answered: not necessarily.** A human may or may not read the generated prose
   before it goes out.

   Recorded consequence, because it changes what the checks in F2 are for. With no
   guaranteed human read, the mechanical checks stop being a safety net and become
   the only control: nothing else stands between a fabricated number and 800
   inboxes. They therefore move from "should" to "must", they must fail closed (no
   output rather than an unchecked one), and every generated piece must carry its
   check result so a complaint can be answered with evidence rather than intent.

2. **Who signs off on the copyright posture?** **Answered: the Link/Linkroad
   newsletter agent.**

   Recorded objection, once, so the decision is on the record rather than assumed.
   Software cannot hold accountability. If a publisher objects to a derivative of
   their article being circulated internally, "the agent approved it" is not an
   answer that protects anyone, and the person who configured the agent inherits
   the question anyway. What the agent can do is enforce and evidence: apply the
   rules, refuse what fails them, and keep the record. What it cannot do is accept
   the consequence.

   Proceeding as decided. The design compensates where it can: fail closed, keep
   the audit trail per F5, and make the source attribution unmissable. If a named
   human owner is ever wanted, nothing in the build prevents adding one.
3. **What happens when the daily cap engages?** F4.
4. **Is EXCERPT mode worth having at all**, given F1 and F3? An alternative worth
   considering: generate only from feeds that publish full text, and show
   everything else as summary plus link. Fewer Link Takes, none of them invented.

## Suggested split

| Requirement | Scope | Gate |
|---|---|---|
| `RQ-006_01` | Data model, org context settings, the generation path with the F2 checks | Checks provably reject a planted verbatim sentence and a planted invented number |
| `RQ-006_02` | Input pipeline: robots, domain policy, wall detection, EXCERPT rules from F1 | A paywalled source yields either a short honest output or none |
| `RQ-006_03` | Portal detail view with attribution | Source name and URL present on every rendering |
| `RQ-006_04` | Newsletter usage, reconciled with RQ-005 | A rewrite reaches a subscriber only after a human read it |

`RQ-006_01` and `RQ-006_02` are the whole risk. `RQ-006_03` and `RQ-006_04` are
ordinary work.

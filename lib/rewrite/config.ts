/**
 * RQ-006: the numbers this feature is bounded by.
 *
 * Separate from `lib/config.ts` so the caps are visible in one screen next to the
 * reasoning for them, and importable by the pure modules without dragging in the
 * environment.
 */

/** Hard cap on the body. The requirement's rule 1. */
export const MAX_REWRITE_WORDS = 300;

/**
 * Below this much usable input, generate nothing.
 *
 * Review F1: a missing Link Take is honest, an invented one is a liability. Two
 * hundred characters is about thirty words, which is a headline and a sentence, and
 * nothing grounded can be written from less.
 */
export const MIN_USABLE_INPUT_CHARS = 200;

/** Input sent to the model, in characters, roughly six thousand tokens. */
export const MAX_INPUT_CHARS = 24_000;

/**
 * Eager generations per organization per day.
 *
 * The plan said 300, sized for a daily product. This one is weekly: an edition carries
 * eight to twelve stories, so a few dozen candidates a week is generous and anything
 * beyond that is spend with nowhere to go. Eight a day is about fifty-six a week
 * against an edition of twelve.
 */
export const EAGER_DAILY_CAP = 8;

/**
 * Generations on open, per organization per day.
 *
 * Counted separately and more loosely: a person asking to read one specific piece is
 * not the runaway case.
 */
export const ON_OPEN_DAILY_CAP = 40;

/**
 * How long a queued candidate stays eligible.
 *
 * The queue expires, it does not accumulate. On a weekly product an item that missed
 * its edition is worthless, so the budget always goes to the best candidates currently
 * in play rather than to whatever arrived first. First in, first out would spend today
 * on last week's news and build a backlog that gets generated and never published.
 */
export const QUEUE_TTL_DAYS = 7;

/**
 * No temperature is sent.
 *
 * The plan asked for 0.3, on the reasoning that this is reporting rather than
 * invention, which is sound. The current models reject it: claude-sonnet-5 answers
 * `temperature is deprecated for this model` with a 400, so passing it would have
 * failed every call in production. Found by generating one piece against the real API
 * rather than by reading the plan.
 */

/** One retry, then FAILED. */
export const MAX_ATTEMPTS = 2;

/**
 * The organization's description of itself, in characters.
 *
 * Twice the cap on `brandVoicePrompt`, which says how the prose should sound: this one
 * says what the organization does, and it is what every relevance section is grounded in.
 * A sector, the clients and the work does not fit in five hundred.
 */
export const MAX_ORG_CONTEXT_CHARS = 1000;

/** The relevance section's heading. A heading, so one line of it. */
export const MAX_RELEVANCE_HEADING_CHARS = 80;

/**
 * The languages the prose can be written in.
 *
 * A closed list rather than a text field, because the value is not only passed to a model:
 * `asidePickerQuery` matches closing lines on it by exact string, so "Portugues" typed by
 * hand would quietly stop every stored aside from being offered.
 */
export const REWRITE_LANGUAGES = [
  { value: "pt-PT", label: "Portuguese (Portugal)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "fr-FR", label: "French (France)" },
] as const;

/**
 * The editor's per-version instruction, in characters.
 *
 * Matches the cap on `brandVoicePrompt`, which is the standing version of the same thing.
 * A cap at all because this text is typed into a prompt: an unbounded field is an
 * unbounded prompt, and an ask that needs more than a few sentences is a change to the
 * organization's settings rather than a note about one article.
 */
export const MAX_INSTRUCTION_CHARS = 500;

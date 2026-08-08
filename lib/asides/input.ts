/**
 * What a caller may set on an aside, and what it may not.
 *
 * Separated from the routes so the rules are testable without a session, following the
 * pattern lib/articles/patch-input.ts already established.
 *
 * `useCount`, `lastUsedAt` and `source` are absent from both parsers on purpose.
 * The first two are written by the send path and nowhere else, and a caller able to set
 * them could push a joke to the front or the back of every picker. `source` records
 * whether a person or a model wrote the line, which is worth knowing three months from
 * now precisely because nobody can edit it afterwards.
 */

const KINDS = ["JOKE", "NOTE", "SPOTLIGHT"] as const;
const STATUSES = ["PENDING", "APPROVED", "RETIRED"] as const;

/** An email block, not an essay. Long enough for a paragraph-length editor's note. */
export const MAX_ASIDE_TEXT = 500;

export type AsideKindInput = (typeof KINDS)[number];
export type AsideStatusInput = (typeof STATUSES)[number];

export interface AsideCreateInput {
  text: string;
  kind: AsideKindInput;
  language: string;
  reusable: boolean;
  imageUrl?: string;
  attribution?: string;
  status?: AsideStatusInput;
}

export interface AsidePatchInput {
  text?: string;
  kind?: AsideKindInput;
  status?: AsideStatusInput;
  language?: string;
  imageUrl?: string | null;
  attribution?: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** http(s) only. A javascript: or data: URL must never reach an inbox. */
function cleanUrl(value: unknown): { ok: true; url?: string } | { ok: false } {
  const text = cleanText(value);
  if (!text) return { ok: true };

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false };
  }
}

export function parseAsideCreate(body: unknown): Result<AsideCreateInput> {
  if (!isRecord(body)) return { ok: false, error: "Body must be an object." };

  const text = cleanText(body.text);
  if (!text) {
    return {
      ok: false,
      error:
        "Text is required. It is also the image's alt text, so an image on its own is not enough.",
    };
  }
  if (text.length > MAX_ASIDE_TEXT) {
    return { ok: false, error: `Text must be ${MAX_ASIDE_TEXT} characters or fewer.` };
  }

  const kind = body.kind === undefined ? "JOKE" : body.kind;
  if (!KINDS.includes(kind as AsideKindInput)) {
    return { ok: false, error: `Kind must be one of ${KINDS.join(", ")}.` };
  }

  if (body.status !== undefined && !STATUSES.includes(body.status as AsideStatusInput)) {
    return { ok: false, error: `Status must be one of ${STATUSES.join(", ")}.` };
  }

  const image = cleanUrl(body.imageUrl);
  if (!image.ok) return { ok: false, error: "Image URL must be http or https." };

  const attribution = cleanText(body.attribution);
  const language = cleanText(body.language) ?? "pt-PT";
  const reusable = body.reusable === undefined ? true : Boolean(body.reusable);

  return {
    ok: true,
    value: {
      text,
      kind: kind as AsideKindInput,
      language,
      reusable,
      ...(image.url ? { imageUrl: image.url } : {}),
      ...(attribution ? { attribution } : {}),
      ...(body.status ? { status: body.status as AsideStatusInput } : {}),
    },
  };
}

export function parseAsidePatch(body: unknown): Result<AsidePatchInput> {
  if (!isRecord(body)) return { ok: false, error: "Body must be an object." };

  const value: AsidePatchInput = {};

  if (body.text !== undefined) {
    const text = cleanText(body.text);
    if (!text) return { ok: false, error: "Text cannot be blank." };
    if (text.length > MAX_ASIDE_TEXT) {
      return { ok: false, error: `Text must be ${MAX_ASIDE_TEXT} characters or fewer.` };
    }
    value.text = text;
  }

  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind as AsideKindInput)) {
      return { ok: false, error: `Kind must be one of ${KINDS.join(", ")}.` };
    }
    value.kind = body.kind as AsideKindInput;
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as AsideStatusInput)) {
      return { ok: false, error: `Status must be one of ${STATUSES.join(", ")}.` };
    }
    value.status = body.status as AsideStatusInput;
  }

  if (body.imageUrl !== undefined) {
    // null clears it; anything unparseable is refused rather than silently cleared.
    if (body.imageUrl === null) {
      value.imageUrl = null;
    } else {
      const image = cleanUrl(body.imageUrl);
      if (!image.ok) return { ok: false, error: "Image URL must be http or https." };
      value.imageUrl = image.url ?? null;
    }
  }

  if (body.attribution !== undefined) {
    value.attribution = cleanText(body.attribution) ?? null;
  }

  if (body.language !== undefined) {
    const language = cleanText(body.language);
    if (!language) return { ok: false, error: "Language cannot be blank." };
    value.language = language;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  return { ok: true, value };
}

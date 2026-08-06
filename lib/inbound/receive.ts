import { load } from "cheerio";
import { config } from "@/lib/config";
import { pgSafe } from "@/lib/pg-safe-text";

/**
 * RQ-007: fetch an inbound email's content from Resend, and make it safe to store.
 *
 * The `email.received` webhook carries metadata only, so the body comes from a second call.
 * That call lives here rather than in the webhook: a webhook runs on someone else's timeout,
 * and the retry loop that recovers a failed fetch has to exist regardless.
 */

export interface FetchedContent {
  html: string | null;
  text: string | null;
}

export type ReceivingFetch = (
  emailId: string
) => Promise<{ status: number; body: unknown }>;

const resendFetch: ReceivingFetch = async (emailId) => {
  const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: {
      Authorization: `Bearer ${config.email.resend.apiKey}`,
      Accept: "application/json",
    },
  });

  const body = await response.json().catch(() => null);

  return { status: response.status, body };
};

/**
 * Strip everything from a newsletter's HTML that should never be stored or rendered.
 *
 * Scripts and event handlers because this markup came from a stranger and may end up in a
 * browser. Tracking pixels because a stored one fires again every time the email is looked
 * at, which reports a read to the sender that nobody performed.
 */
export function sanitizeEmailHtml(html: string): string {
  const $ = load(html);

  $("script, style, noscript, iframe, object, embed, form, link, meta, base").remove();

  // Any attribute that runs code, plus the ones that fetch on render.
  $("*").each((_, element) => {
    if (element.type !== "tag") return;

    for (const name of Object.keys(element.attribs ?? {})) {
      const lower = name.toLowerCase();
      const value = element.attribs[name] ?? "";

      if (lower.startsWith("on")) delete element.attribs[name];
      else if (lower === "srcdoc" || lower === "formaction") delete element.attribs[name];
      else if (/^(href|src|action|xlink:href)$/.test(lower) && /^\s*javascript:/i.test(value)) {
        delete element.attribs[name];
      }
    }
  });

  // Tracking pixels: a one pixel image exists to report that the mail was opened.
  $("img").each((_, element) => {
    const $img = $(element);
    const width = Number($img.attr("width") ?? NaN);
    const height = Number($img.attr("height") ?? NaN);

    if ((width <= 2 && !Number.isNaN(width)) || (height <= 2 && !Number.isNaN(height))) {
      $img.remove();
    }
  });

  return $.html();
}

/** Cap the stored html, since a newsletter can carry half a megabyte of table markup. */
export function capHtml(html: string, maxBytes: number = config.emailIngest.maxHtmlBytes): string {
  if (Buffer.byteLength(html, "utf8") <= maxBytes) return html;

  // Cut on bytes rather than characters, then trim any partial character off the end.
  return Buffer.from(html, "utf8").subarray(0, maxBytes).toString("utf8");
}

export type ContentOutcome =
  | { ok: true; content: FetchedContent }
  | { ok: false; reason: string; retryable: boolean };

/**
 * The body of one received email.
 *
 * A 404 is not retryable: Resend does not have it and will not later. Anything else is,
 * because an outage is exactly what the retry counter exists for, and Resend keeps its own
 * copy of every inbound email so nothing is lost while we wait.
 */
export async function fetchEmailContent(
  resendEmailId: string,
  fetcher: ReceivingFetch = resendFetch
): Promise<ContentOutcome> {
  let result: { status: number; body: unknown };

  try {
    result = await fetcher(resendEmailId);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "the request failed",
      retryable: true,
    };
  }

  if (result.status === 404) {
    return { ok: false, reason: "Resend does not have this email", retryable: false };
  }

  if (result.status !== 200) {
    return { ok: false, reason: `Resend answered ${result.status}`, retryable: true };
  }

  const body = result.body as Record<string, unknown> | null;

  const html = typeof body?.html === "string" ? body.html : null;
  const text = typeof body?.text === "string" ? body.text : null;

  if (!html && !text) {
    // Not retryable: the call succeeded and there is no body to have. An email with no
    // content is a real thing, and asking again produces the same nothing.
    return { ok: false, reason: "the email had no html and no text", retryable: false };
  }

  /**
   * `pgSafe` last, after sanitising and capping.
   *
   * A NUL cannot be stored by Postgres in a text column any more than in jsonb, and these
   * two strings are the least controlled input this product takes: whatever a newsletter
   * sender put in the message. The search failed on exactly this class of byte from
   * scraped web pages; there is no reason email would be cleaner.
   */
  return {
    ok: true,
    content: {
      html: html ? pgSafe(capHtml(sanitizeEmailHtml(html))) : null,
      text: text ? pgSafe(text) : null,
    },
  };
}

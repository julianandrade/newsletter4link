/**
 * An email prepared to be read inside a frame rather than by a mail client.
 *
 * The archive serves the edition's own HTML in an iframe, so the design survives without a second
 * rendering of it for the web. That has one consequence the email itself never has: a link with no
 * `target` navigates the frame, and a publisher that sends `Content-Security-Policy:
 * frame-ancestors 'self'` refuses to be framed. So every story link in the browser view died on
 * "refused to connect" while the same link in the delivered mail opened fine, because a mail client
 * hands an untargeted link to the system browser.
 *
 * Fixed here, at display time, rather than by putting `target="_blank"` in the markup the renderer
 * emits. A hand-edited send is served as the bytes that went out and an Unlayer design brings its
 * own anchors, so markup written today would leave every edition already in the database, including
 * the one this was reported against, still broken.
 *
 * A pure string function, following harden-export.ts: no DOM, client-safe, and idempotent.
 */

/** Also the marker that makes a second pass a no-op. */
const BASE_TAG = '<base target="_blank">';

/**
 * Every link in `html` opens in a new tab, leaving the frame where it is.
 *
 * Inserted immediately after `<head>`, ahead of any base the document already carries: the first
 * base element with a `target` is the one that counts, and this one has no `href`, so an existing
 * base keeps deciding how relative URLs resolve.
 *
 * The frame needs `allow-popups` in its `sandbox` for the new tab to open at all. Browsers imply
 * `rel="noopener"` for `target="_blank"`, so nothing that opens this way gets a handle on the
 * opener.
 *
 * A fragment with no head is returned untouched rather than given one, for the reason
 * `injectDarkMode` gives: corrupting the markup is worse than shipping it unchanged.
 */
export function framedEmailHtml(html: string): string {
  if (html.includes(BASE_TAG)) return html;

  const head = /<head\b[^>]*>/i.exec(html);
  if (!head) return html;

  const at = head.index + head[0].length;
  return `${html.slice(0, at)}\n${BASE_TAG}${html.slice(at)}`;
}

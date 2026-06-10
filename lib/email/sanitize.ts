/**
 * HTML sanitization helpers for editor-authored newsletter content.
 *
 * Custom blocks are authored by organization editors, but their content is
 * interpolated directly into outgoing email HTML. These helpers strip the
 * obvious injection vectors as defense-in-depth before that interpolation.
 */

/**
 * Escape the five HTML-significant characters.
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Conservatively sanitize editor-authored HTML before injecting it into an
 * outgoing email. Removes:
 *  - <script>/<style>/<iframe>/<object>/<embed>/<link>/<meta> tags
 *    (and the contents of script/style)
 *  - inline event-handler attributes (onclick, onload, ...)
 *  - javascript:/vbscript:/data: URLs in href/src attributes
 */
export function sanitizeBlockHtml(html: string): string {
  if (!html) return "";
  return html
    // Remove script/style together with their contents first, so the generic
    // tag strip below can't leave the inner text behind.
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi,
      "$1=$2#$2"
    );
}

/**
 * Only allow http(s) image URLs; anything else collapses to an empty src.
 */
export function sanitizeImageUrl(url: string): string {
  const trimmed = (url || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return escapeHtml(trimmed);
}

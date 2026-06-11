/**
 * Per-subscriber personalization of pre-rendered template HTML.
 *
 * Custom (Unlayer/stored) templates are rendered once and sent to every
 * subscriber, so per-subscriber values like the unsubscribe URL must be
 * injected afterwards. Templates may include an explicit placeholder;
 * otherwise a minimal footer is appended so every email always carries a
 * working unsubscribe link.
 */

const PLACEHOLDER_PATTERN = /\{\{\s*unsubscribe_?url\s*\}\}/gi;

export function injectUnsubscribeUrl(html: string, unsubscribeUrl: string): string {
  if (PLACEHOLDER_PATTERN.test(html)) {
    PLACEHOLDER_PATTERN.lastIndex = 0;
    return html.replace(PLACEHOLDER_PATTERN, unsubscribeUrl);
  }

  // Already personalized or template author hard-coded a link.
  if (html.includes("/unsubscribe?token=")) {
    return html;
  }

  const footer = `
    <div style="text-align:center;padding:16px 0;font-size:12px;color:#94a3b8;font-family:sans-serif;">
      <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
    </div>
  `;

  const bodyClose = /<\/body>/i;
  if (bodyClose.test(html)) {
    return html.replace(bodyClose, `${footer}</body>`);
  }
  return html + footer;
}

import { buildArchiveUrl, buildEditionIndexUrl } from "./archive-url";
import { hardenExportedHtml } from "./harden-export";
import { renderMergeTags } from "./merge-tags";
import { buildUnsubscribeUrl } from "./unsubscribe-token";

/**
 * The last step before an email leaves, run once per recipient.
 *
 * Everything shared is already substituted by the time this runs. Only the three signed URLs are
 * left standing, because each is bound to one subscriber and cannot be resolved earlier.
 *
 * Before this existed, the whole HTML was rendered once for a send and handed unchanged to every
 * recipient, so all of them received the generic unsubscribe page rather than their own signed
 * link. The signing machinery was correct and simply never reached.
 *
 * Hardening runs last, after substitution, because dropEmptyOptionalRows judges emptiness against
 * the final markup: run before, it would see an unresolved placeholder where a real link is about
 * to be and could drop a row that has content.
 *
 * An empty subscriberId is legitimate. An ad-hoc send has an address and no subscriber row, so it
 * gets unsigned URLs, and the archive page answers 404 for those.
 */
export function personalizeHtml(
  html: string,
  args: { subscriberId: string; editionId: string }
): string {
  const subscriberId = args.subscriberId || undefined;

  const substituted = renderMergeTags(html, {
    unsubscribe_url: buildUnsubscribeUrl(subscriberId),
    archive_url: buildArchiveUrl(args.editionId, subscriberId),
    portal_url: buildEditionIndexUrl(subscriberId),
  });

  return hardenExportedHtml(substituted);
}

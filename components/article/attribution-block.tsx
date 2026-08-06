/**
 * RQ-006_03: the source attribution, alone, because it is the one thing that can
 * never be missing.
 *
 * Plan rule 5: the block is always rendered, publication name plus original URL,
 * visually prominent, directly under the title. The API was built so no surface can
 * return the prose without it, and this component is the same idea one layer out: the
 * gate of this requirement is "source name and URL present on every rendering", and a
 * component is something a test can assert while markup scattered through a large
 * component is something a person has to remember to check.
 *
 * It renders no prose and takes no state. Nothing about it varies with the role of
 * whoever is looking, or with whether a Link Take exists.
 */

import { ExternalLink, SourceStamp } from "@/components/radar/primitives";
import type { LinkTakeAttribution } from "@/lib/rewrite/view";

export function AttributionBlock({
  attribution,
  /** Shown when the Link Take has its own headline, so the original is not lost. */
  showOriginalTitle = false,
}: {
  attribution: LinkTakeAttribution;
  showOriginalTitle?: boolean;
}) {
  return (
    <div className="rounded-xl border border-radar-line bg-radar-surface2 px-4 py-3.5">
      <SourceStamp
        sourceUrl={attribution.url}
        sourceName={attribution.publication}
        publishedAt={attribution.publishedAt}
      />

      {showOriginalTitle ? (
        <p className="mt-1 mb-2 text-[12.5px] text-radar-ink2 text-pretty">
          Originally published as{" "}
          <span className="text-radar-ink">{attribution.originalTitle}</span>
        </p>
      ) : null}

      {/*
        The URL itself, not only a labelled link. Rule 5 asks for the original URL to
        be prominent, and a reader who wants to know where a piece came from before
        clicking is entitled to see it. `break-all` because a query string is long and
        must not push the layout sideways.
      */}
      <ExternalLink
        href={attribution.url}
        className="font-num text-[11.5px] break-all text-radar-ink3 underline decoration-radar-line2 underline-offset-2 transition-colors hover:text-radar-ink"
      >
        {attribution.url}
      </ExternalLink>

      {/*
        Finding D4: said where the URL is, not in a column nobody reads.

        When the redirect chain could not be followed the address above is the tracking
        link the newsletter used, and the publication name a few lines up was derived from
        its host, so both read as the publisher and neither is. Nothing about this varies
        with role: an editor and a viewer are equally misled by a wrapper that says
        nothing.
      */}
      {attribution.sourceUnresolved ? (
        <p className="mt-2.5 mb-0 rounded-lg border border-radar-warn bg-radar-surface px-3 py-2 text-[12px] text-radar-ink2 text-pretty">
          <span className="font-semibold text-radar-ink">
            This is the newsletter&rsquo;s link, not the publisher&rsquo;s.
          </span>{" "}
          The redirect chain could not be followed, so the address above is the tracking
          link the newsletter used and the name beside it comes from that host. Check where
          it really goes before this story leaves in an edition.
        </p>
      ) : null}
    </div>
  );
}

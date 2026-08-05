import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * RQ-006_03: where a headline goes.
 *
 * Before this, an article's title linked straight to the publisher. The Link Take gave
 * the platform something of its own to say about an article, so the headline now opens
 * our page about the story, and the publication name opens the story: pass `href` to
 * `SourceStamp` for that half, which owns it.
 *
 * The gesture people already make on a headline starts working, and no route to the
 * source is lost. The detail view carries the URL twice over, and the stamp on the card
 * still goes there directly.
 *
 * This lives here rather than in `components/radar/` because it knows an application
 * route, and the design vocabulary is deliberately route-agnostic.
 */
export function ArticleTitleLink({
  articleId,
  title,
  className,
}: {
  articleId: string;
  title: string;
  className?: string;
}) {
  return (
    <Link
      href={`/dashboard/articles/${articleId}`}
      className={cn(
        "text-radar-ink no-underline hover:text-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
        className
      )}
    >
      {title}
    </Link>
  );
}

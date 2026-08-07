"use client";

/**
 * One article as a row in the all-articles list, with its state and its controls.
 *
 * Extracted from `app/dashboard/articles/page.tsx` when that file passed 600 lines. The
 * split is the ordinary one for this codebase: the route owns the network, the filter and
 * the selection, and the component owns how a story is drawn. Nothing here fetches, and
 * nothing here knows which filter is lit.
 *
 * The row shape itself is `components/proposal/queue-view.tsx`'s compact layout, so a story
 * reads the same whether it is met in the queue or in the archive.
 */

import { ArticleStateControls } from "@/components/article/article-state-controls";
import { ArticleTitleLink } from "@/components/article/article-title-link";
import {
  ScoreMeter,
  SourceStamp,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import { SelectCheckbox } from "@/components/radar/selection";
import { cn } from "@/lib/utils";

/** Exactly the columns `GET /api/articles` selects. */
export interface ListArticle {
  id: string;
  title: string;
  sourceUrl: string;
  author: string | null;
  publishedAt: string | null;
  capturedAt: string;
  relevanceScore: number | null;
  summary: string | null;
  category: string[];
  status: string;
  discardedAt: string | null;
}

/**
 * The state an article is in, as one chip.
 *
 * Same four-way mapping as the detail screen, discard first: a discarded article still
 * carries whichever verdict it had, and saying "approved" about something that is in no
 * list would be true and useless.
 */
export function ArticleStateChip({ article }: { article: ListArticle }) {
  if (article.discardedAt) return <StatusChip tone="neutral">discarded</StatusChip>;
  if (article.status === "APPROVED") return <StatusChip tone="ok">approved</StatusChip>;
  if (article.status === "REJECTED") return <StatusChip tone="err">rejected</StatusChip>;
  return <StatusChip tone="warn">no verdict yet</StatusChip>;
}

export function ArticleListRow({
  article,
  selected,
  onToggleSelected,
  canEdit,
  onChanged,
}: {
  article: ListArticle;
  selected: boolean;
  onToggleSelected: (modifiers: { shiftKey: boolean }) => void;
  /** RQ-005 AC-6.8: a VIEWER reads and decides nothing, so it gets no checkbox either. */
  canEdit: boolean;
  onChanged: () => void;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 border-b border-radar-line2 py-4 transition-colors sm:flex-row sm:items-start sm:gap-5",
        selected ? "bg-radar-surface2" : "hover:bg-radar-surface2"
      )}
    >
      {canEdit && (
        <SelectCheckbox
          checked={selected}
          onToggle={onToggleSelected}
          label={`Select ${article.title}`}
          className="mt-1 shrink-0"
        />
      )}

      <div className="min-w-0 flex-1">
        <SourceStamp
          sourceUrl={article.sourceUrl}
          publishedAt={article.publishedAt}
          capturedAt={article.capturedAt}
          href={article.sourceUrl}
        />
        <h3 className="font-editorial m-0 text-[15.5px] font-medium leading-[1.3] text-radar-ink text-pretty">
          <ArticleTitleLink articleId={article.id} title={article.title} />
        </h3>
        {/*
          Rendered rather than dropped from the interface and the select. The field is one of
          the six an editor can now change, and it reaches the newsletter, so a screen that
          claims to show every article should show the value it is asking people to correct.
          Same line and same wording as the queue at `components/proposal/queue-view.tsx`.
        */}
        {article.author && (
          <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3">by {article.author}</p>
        )}
        {article.summary && (
          <p className="mt-1.5 mb-0 line-clamp-2 max-w-[80ch] text-[12.5px] text-radar-ink2 text-pretty">
            {article.summary}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ArticleStateChip article={article} />
          {article.category.slice(0, 3).map((cat) => (
            <Tag key={cat}>{cat}</Tag>
          ))}
          {article.category.length > 3 && <Tag>+{article.category.length - 3}</Tag>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end">
        <ScoreMeter score={article.relevanceScore} />
        {/*
          The per-row controls are `ArticleStateControls`, unchanged: which actions an
          article offers is `nextActionsFor`'s rule and belongs in one place, or a discarded
          article grows an Approve button on the one screen that can show it.
        */}
        <ArticleStateControls
          article={{ status: article.status, discardedAt: article.discardedAt }}
          articleId={article.id}
          canEdit={canEdit}
          onChanged={onChanged}
        />
      </div>
    </article>
  );
}

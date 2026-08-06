"use client";

/**
 * RQ-005 action 4: the review queue, as a view of the proposal screen.
 *
 * This is the old `app/dashboard/review/page.tsx` moved, not rewritten. The
 * screen was good; the defect was that it was a second screen reading the same
 * pending-articles query as the Feed, so a decision in one silently emptied the
 * other (BR-012). Every capability survives the consolidation: filtering, the
 * three layouts, editing a story's fields, single verdicts, and bulk verdicts
 * with their confirmation (AC-4.6).
 *
 * What changed: the articles and the verdicts are props. The state lives in
 * `app/dashboard/page.tsx` so one decision updates this list, the proposal and
 * the counts at once (AC-4.5).
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArticleTitleLink } from "@/components/article/article-title-link";
import {
  ExternalLink,
  Num,
  RadarButton,
  ScoreMeter,
  SectionLabel,
  SourceStamp,
  Tag,
} from "@/components/radar/primitives";
import {
  EmptyState,
  LoadError,
  RadarField,
  RadarInput,
  RadarTextarea,
  SkeletonRows,
  TableShell,
  tableClass,
  tdClass,
  theadClass,
  thClass,
  trClass,
} from "@/components/radar/controls";
import {
  BulkBar,
  SelectCheckbox,
  useSelection,
  type BulkAction,
} from "@/components/radar/selection";
import { relativeTime, sourceIdentity } from "@/lib/radar/source";
import { describeDate } from "@/lib/articles/date";
import { LayoutToggle, useLayoutPreference } from "@/components/layout-toggle";
import {
  ArticleFiltersComponent,
  defaultArticleFilters,
  type ArticleFilters,
} from "@/components/article-filters";
import { cn } from "@/lib/utils";
import type { QueueArticle, Verdict } from "./state";

export interface QueueViewProps {
  articles: QueueArticle[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  filters: ArticleFilters;
  onFiltersChange: (filters: ArticleFilters) => void;
  availableCategories: string[];
  /** RQ-005 AC-6.8: a VIEWER reads the queue and decides nothing. */
  canEdit: boolean;
  deciding: string | null;
  onDecide: (article: QueueArticle, verdict: Verdict) => void;
  bulkBusy: string | null;
  onBulk: (verdict: Verdict, ids: string[]) => void;
  onSaveEdits: (
    article: QueueArticle,
    edits: { summary: string; category: string[] }
  ) => Promise<boolean>;
}

export function QueueView({
  articles,
  loading,
  error,
  onRetry,
  filters,
  onFiltersChange,
  availableCategories,
  canEdit,
  deciding,
  onDecide,
  bulkBusy,
  onBulk,
  onSaveEdits,
}: QueueViewProps) {
  const [layout, setLayout] = useLayoutPreference("review-layout", "cards");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Edit dialog
  const [editing, setEditing] = useState<QueueArticle | null>(null);
  const [editedSummary, setEditedSummary] = useState("");
  const [editedCategories, setEditedCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * Ids are passed in render order so shift-click ranges follow what is on
   * screen.
   */
  const selection = useSelection(articles.map((article) => article.id));

  /**
   * Rejecting in bulk asks first.
   *
   * It shipped without this, and on the first real run 23 curated stories were
   * rejected in a single second by one click. Approve needs no confirmation: it
   * moves work forward and says where it went.
   */
  const [pendingBulkReject, setPendingBulkReject] = useState<string[] | null>(null);

  const bulkActions: BulkAction[] = canEdit
    ? [
        {
          id: "approve",
          label: "Approve",
          onRun: (ids) => onBulk("approve", ids),
        },
        {
          id: "reject",
          label: "Reject",
          destructive: true,
          onRun: (ids) => setPendingBulkReject(ids),
        },
      ]
    : [];

  const openEdit = (article: QueueArticle) => {
    setEditing(article);
    setEditedSummary(article.summary || "");
    setEditedCategories([...article.category]);
    setNewCategory("");
  };

  const closeEdit = () => {
    setEditing(null);
    setEditedSummary("");
    setEditedCategories([]);
    setNewCategory("");
  };

  const saveEdits = async () => {
    if (!editing) return;
    setSaving(true);
    const ok = await onSaveEdits(editing, {
      summary: editedSummary,
      category: editedCategories,
    });
    setSaving(false);
    if (ok) closeEdit();
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasFilters =
    Boolean(filters.search) ||
    filters.categories.length > 0 ||
    filters.scoreMin > 0 ||
    filters.scoreMax < 10 ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  /** Verdict pair, shared by all three layouts so the controls never move. */
  const Verdicts = ({
    article,
    compact = false,
  }: {
    article: QueueArticle;
    compact?: boolean;
  }) =>
    canEdit ? (
      <div className={cn("flex items-center gap-1.5", compact && "justify-end")}>
        <RadarButton size="sm" variant="ghost" onClick={() => openEdit(article)}>
          Edit
        </RadarButton>
        <RadarButton
          size="sm"
          onClick={() => onDecide(article, "reject")}
          disabled={deciding === article.id}
          className="hover:border-radar-err hover:text-radar-err"
        >
          Reject
        </RadarButton>
        <RadarButton
          size="sm"
          variant="accent"
          onClick={() => onDecide(article, "approve")}
          disabled={deciding === article.id}
        >
          {deciding === article.id ? "Saving…" : "Approve"}
        </RadarButton>
      </div>
    ) : null;

  const renderCards = () => (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {articles.map((article) => {
        const isExpanded = expandedIds.has(article.id);
        const isLong = (article.summary?.length || 0) > 220;

        return (
          <article
            key={article.id}
            className={cn(
              "flex flex-col rounded-xl border bg-radar-surface p-4 shadow-radar transition-colors",
              selection.isSelected(article.id)
                ? "border-radar-accent"
                : "border-radar-line hover:border-radar-ink3"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <SelectCheckbox
                  checked={selection.isSelected(article.id)}
                  onToggle={(modifiers) => selection.toggle(article.id, modifiers)}
                  label={`Select ${article.title}`}
                  className="mt-0.5"
                />
                <SourceStamp
                  sourceUrl={article.sourceUrl}
                  publishedAt={article.publishedAt}
                  capturedAt={article.capturedAt}
                  href={article.sourceUrl}
                />
              </div>
              <ScoreMeter score={article.relevanceScore} className="shrink-0" />
            </div>

            <h3 className="font-editorial m-0 text-[17px] font-medium leading-[1.25] tracking-[-0.01em] text-radar-ink text-balance">
              <ArticleTitleLink articleId={article.id} title={article.title} />
            </h3>

            {article.author && (
              <p className="mt-1.5 mb-0 text-[11.5px] text-radar-ink3">
                by {article.author}
              </p>
            )}

            <p
              className={cn(
                "mt-2.5 mb-0 text-[13px] leading-[1.55] text-radar-ink2 text-pretty",
                !isExpanded && isLong && "line-clamp-3"
              )}
            >
              {article.summary || "No summary was generated for this story."}
            </p>

            {isLong && (
              <button
                type="button"
                onClick={() => toggleExpanded(article.id)}
                aria-expanded={isExpanded}
                className="mt-1.5 self-start text-[11.5px] text-radar-ink3 transition-colors hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              >
                {isExpanded ? "Show less" : "Show the full summary"}
              </button>
            )}

            {article.category.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {article.category.slice(0, 5).map((cat) => (
                  <Tag key={cat}>{cat}</Tag>
                ))}
              </div>
            )}

            {canEdit && (
              <div className="mt-4 flex justify-end border-t border-radar-line2 pt-3.5">
                <Verdicts article={article} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );

  const renderCompact = () => (
    <div className="border-t border-radar-line">
      {articles.map((article) => (
        <article
          key={article.id}
          className={cn(
            "flex flex-col gap-3 border-b border-radar-line2 py-4 transition-colors sm:flex-row sm:items-start sm:gap-5",
            selection.isSelected(article.id)
              ? "bg-radar-surface2"
              : "hover:bg-radar-surface2"
          )}
        >
          <SelectCheckbox
            checked={selection.isSelected(article.id)}
            onToggle={(modifiers) => selection.toggle(article.id, modifiers)}
            label={`Select ${article.title}`}
            className="mt-1 shrink-0"
          />
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
            {article.summary && (
              <p className="mt-1.5 mb-0 line-clamp-2 max-w-[80ch] text-[12.5px] text-radar-ink2 text-pretty">
                {article.summary}
              </p>
            )}
            {article.category.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {article.category.slice(0, 3).map((cat) => (
                  <Tag key={cat}>{cat}</Tag>
                ))}
                {article.category.length > 3 && (
                  <Tag>+{article.category.length - 3}</Tag>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
            <ScoreMeter score={article.relevanceScore} />
            <Verdicts article={article} compact />
          </div>
        </article>
      ))}
    </div>
  );

  const renderTable = () => (
    <TableShell>
      <table className={tableClass}>
        <caption className="sr-only">Stories waiting for a decision</caption>
        <thead>
          <tr className={theadClass}>
            <th scope="col" className={cn(thClass, "w-[36px]")}>
              <SelectCheckbox
                checked={selection.allSelected}
                indeterminate={selection.partiallySelected}
                onToggle={() =>
                  selection.allSelected ? selection.clear() : selection.selectAll()
                }
                label={
                  selection.allSelected
                    ? "Clear selection"
                    : `Select all ${articles.length} stories`
                }
              />
            </th>
            <th scope="col" className={thClass}>
              Score
            </th>
            <th scope="col" className={thClass}>
              Story
            </th>
            <th scope="col" className={thClass}>
              Source
            </th>
            <th scope="col" className={thClass}>
              Date
            </th>
            <th scope="col" className={thClass}>
              Topics
            </th>
            <th scope="col" className={cn(thClass, "text-right")}>
              Verdict
            </th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => (
            <tr
              key={article.id}
              className={cn(
                trClass,
                selection.isSelected(article.id) && "bg-radar-surface2"
              )}
            >
              <td className={tdClass}>
                <SelectCheckbox
                  checked={selection.isSelected(article.id)}
                  onToggle={(modifiers) => selection.toggle(article.id, modifiers)}
                  label={`Select ${article.title}`}
                />
              </td>
              <td className={tdClass}>
                <ScoreMeter score={article.relevanceScore} />
              </td>
              <td className={cn(tdClass, "min-w-[280px]")}>
                <ArticleTitleLink
                  articleId={article.id}
                  title={article.title}
                  className="text-[13px] font-medium"
                />
              </td>
              <td className={cn(tdClass, "whitespace-nowrap")}>
                {/* The column is the source, so it is the route to the source. */}
                <ExternalLink
                  href={article.sourceUrl}
                  className="text-radar-ink2 no-underline hover:text-radar-accent"
                >
                  {sourceIdentity(article.sourceUrl).name}
                </ExternalLink>
              </td>
              {/*
                Finding C1: the header said Published and the cell showed whatever was in
                publishedAt, which for every article arriving through a newsletter was its
                own ingestion time. The cell now says which date it is showing.
              */}
              <td className={cn(tdClass, "whitespace-nowrap")}>
                {describeDate(article).isCapture ? (
                  <span title="The source gave no publication date, so this is when we captured it.">
                    captured {relativeTime(describeDate(article).value)}
                  </span>
                ) : (
                  relativeTime(describeDate(article).value)
                )}
              </td>
              <td className={tdClass}>
                <div className="flex flex-wrap gap-1.5">
                  {article.category.slice(0, 2).map((cat) => (
                    <Tag key={cat}>{cat}</Tag>
                  ))}
                  {article.category.length > 2 && (
                    <Tag>+{article.category.length - 2}</Tag>
                  )}
                </div>
              </td>
              <td className={cn(tdClass, "text-right")}>
                <Verdicts article={article} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );

  /**
   * Select-all strip for the layouts with no table header to hang it off. The
   * table view carries its own header checkbox instead.
   */
  const renderSelectionBar = () =>
    articles.length === 0 || layout === "table" ? null : (
      <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-radar-line pb-3">
        <SelectCheckbox
          checked={selection.allSelected}
          indeterminate={selection.partiallySelected}
          onToggle={() =>
            selection.allSelected ? selection.clear() : selection.selectAll()
          }
          label={
            selection.allSelected
              ? "Clear selection"
              : `Select all ${articles.length} stories`
          }
        />
        <span className="text-[12.5px] text-radar-ink2">
          {selection.count > 0
            ? `${selection.count} of ${articles.length} selected`
            : `Select all ${articles.length}`}
        </span>
        <span className="ml-auto text-[11.5px] text-radar-ink3">
          Shift-click to select a range · Esc to clear
        </span>
      </div>
    );

  const renderContent = () => {
    switch (layout) {
      case "compact":
        return renderCompact();
      case "table":
        return renderTable();
      default:
        return renderCards();
    }
  };

  const topScore = articles.reduce(
    (max, article) => Math.max(max, article.relevanceScore ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Awaiting a decision</SectionLabel>
          <p className="mt-1 mb-0 text-[12.5px] text-radar-ink2 text-pretty">
            {articles.length === 0
              ? "Curation scores every story it collects; anything above your threshold lands here for a human verdict."
              : (
                  <>
                    Approving puts a story in the approved pool, ready for this
                    week&rsquo;s edition. The best of this batch scores{" "}
                    <Num>{topScore.toFixed(1)}</Num> out of 10.
                  </>
                )}
          </p>
        </div>
        <LayoutToggle value={layout} onChange={setLayout} />
      </div>

      <ArticleFiltersComponent
        filters={filters}
        onChange={onFiltersChange}
        availableCategories={availableCategories}
      />

      {error && !loading && (
        <LoadError what="The queue" message={error} onRetry={onRetry} />
      )}

      {loading && articles.length === 0 && !error && <SkeletonRows rows={5} />}

      {!loading && !error && articles.length === 0 && (
        <EmptyState
          title={hasFilters ? "Nothing matches those filters" : "Nothing to review"}
          actions={
            hasFilters ? (
              <RadarButton
                variant="accent"
                onClick={() => onFiltersChange(defaultArticleFilters)}
              >
                Clear filters
              </RadarButton>
            ) : undefined
          }
        >
          {hasFilters
            ? "Widen the score range or clear a topic, and the queue will fill back up."
            : "Either every story has had a verdict, or collection has not run since the last one. The status above says which."}
        </EmptyState>
      )}

      {articles.length > 0 && !error && (
        <>
          {loading && (
            <p
              role="status"
              className="m-0 text-[11.5px] text-radar-ink3"
              aria-live="polite"
            >
              Refreshing the queue…
            </p>
          )}
          {renderSelectionBar()}
          {renderContent()}
          <BulkBar
            selection={selection}
            actions={bulkActions}
            noun="story"
            nounPlural="stories"
            busyAction={bulkBusy}
          />

          <Dialog
            open={pendingBulkReject !== null}
            onOpenChange={(open) => !open && setPendingBulkReject(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Reject {pendingBulkReject?.length}{" "}
                  {pendingBulkReject?.length === 1 ? "story" : "stories"}?
                </DialogTitle>
                <DialogDescription>
                  They leave the queue and will not appear in any edition. The
                  message that follows carries an undo, so check the selection
                  before confirming rather than after.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <RadarButton
                  variant="outline"
                  onClick={() => setPendingBulkReject(null)}
                >
                  Cancel
                </RadarButton>
                <RadarButton
                  variant="accent"
                  disabled={bulkBusy !== null}
                  onClick={() => {
                    const ids = pendingBulkReject;
                    setPendingBulkReject(null);
                    if (ids) {
                      onBulk("reject", ids);
                      selection.clear();
                    }
                  }}
                >
                  {bulkBusy === "reject"
                    ? "Rejecting…"
                    : `Reject ${pendingBulkReject?.length ?? 0}`}
                </RadarButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Edit a story before deciding on it. */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit before approving</DialogTitle>
            <DialogDescription>
              The summary and topics travel into the newsletter. The title and link
              stay as published.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="flex flex-col gap-4">
              <div>
                <SectionLabel className="mb-1.5">Story</SectionLabel>
                <p className="m-0 text-[13px] font-medium text-radar-ink text-pretty">
                  {editing.title}
                </p>
                <a
                  href={editing.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-[11.5px] text-radar-ink3 hover:text-radar-accent"
                >
                  {editing.sourceUrl}
                </a>
              </div>

              <RadarField
                label="Summary"
                htmlFor="queue-summary"
                hint="Two or three sentences on why it matters, in the newsletter's voice."
              >
                <RadarTextarea
                  id="queue-summary"
                  value={editedSummary}
                  onChange={(event) => setEditedSummary(event.target.value)}
                  rows={4}
                  placeholder="What changed, and why a reader should care."
                />
              </RadarField>

              <div>
                <SectionLabel className="mb-2">Topics</SectionLabel>
                {editedCategories.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {editedCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setEditedCategories(
                            editedCategories.filter((c) => c !== cat)
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-radar-line2 bg-radar-surface2 px-2.5 py-0.5 text-[11px] text-radar-ink2 transition-colors hover:border-radar-err hover:text-radar-err focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                      >
                        {cat}
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">Remove topic {cat}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <RadarInput
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="Add a topic"
                    aria-label="Add a topic"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const trimmed = newCategory.trim();
                        if (trimmed && !editedCategories.includes(trimmed)) {
                          setEditedCategories([...editedCategories, trimmed]);
                          setNewCategory("");
                        }
                      }
                    }}
                  />
                  <RadarButton
                    onClick={() => {
                      const trimmed = newCategory.trim();
                      if (trimmed && !editedCategories.includes(trimmed)) {
                        setEditedCategories([...editedCategories, trimmed]);
                        setNewCategory("");
                      }
                    }}
                    disabled={!newCategory.trim()}
                  >
                    Add
                  </RadarButton>
                </div>

                {availableCategories.filter((c) => !editedCategories.includes(c))
                  .length > 0 && (
                  <div className="mt-2.5">
                    <p className="mt-0 mb-1.5 text-[11px] text-radar-ink3">
                      Already used elsewhere
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableCategories
                        .filter((c) => !editedCategories.includes(c))
                        .slice(0, 8)
                        .map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() =>
                              setEditedCategories([...editedCategories, cat])
                            }
                            className="rounded-full border border-radar-line bg-radar-surface px-2.5 py-0.5 text-[11px] text-radar-ink2 transition-colors hover:border-radar-accent hover:text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                          >
                            + {cat}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <RadarButton onClick={closeEdit} disabled={saving}>
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={() => void saveEdits()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

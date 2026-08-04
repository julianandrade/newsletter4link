"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  ScoreMeter,
  SectionLabel,
  SourceStamp,
  Tag,
} from "@/components/radar/primitives";
import {
  EmptyState,
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
import {
  LayoutToggle,
  useLayoutPreference,
} from "@/components/layout-toggle";
import {
  ArticleFiltersComponent,
  buildArticleQueryString,
  defaultArticleFilters,
  type ArticleFilters,
} from "@/components/article-filters";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  sourceUrl: string;
  author?: string;
  publishedAt: string;
  relevanceScore: number;
  summary: string | null;
  category: string[];
  status: string;
}

export default function ReviewPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [filters, setFilters] = useState<ArticleFilters>(defaultArticleFilters);
  const [layout, setLayout] = useLayoutPreference("review-layout", "cards");

  // Edit modal state
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [editedSummary, setEditedSummary] = useState("");
  const [editedCategories, setEditedCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Rows mid-decision, so a double click cannot fire two verdicts.
  const [deciding, setDeciding] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const queryString = buildArticleQueryString(filters);
      const res = await fetch(`/api/articles/pending?${queryString}`);
      const data = await res.json();
      if (data.success) {
        setArticles(data.data);
        if (data.meta?.categories) {
          setAvailableCategories(data.meta.categories);
        }
      } else {
        setLoadError(data.error || "The queue request failed");
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
      setLoadError(
        error instanceof Error ? error.message : "The queue request failed"
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const decide = async (article: Article, verdict: "approve" | "reject") => {
    if (deciding) return;

    setDeciding(article.id);
    try {
      const res = await fetch(`/api/articles/${article.id}/${verdict}`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setArticles((previous) => previous.filter((a) => a.id !== article.id));
        toast.success(
          verdict === "approve"
            ? "Approved, waiting for an edition"
            : "Rejected and out of the queue"
        );
      } else {
        toast.error(data.error || `Could not ${verdict} that story`);
      }
    } catch (error) {
      console.error(`Error running ${verdict}:`, error);
      toast.error(`Could not ${verdict} that story`);
    } finally {
      setDeciding(null);
    }
  };

  /**
   * Bulk verdicts.
   *
   * A queue after a collection run runs to hundreds of stories; deciding them
   * one at a time is why queues never get cleared. Ids are passed in render
   * order so shift-click ranges follow what is on screen.
   */
  const selection = useSelection(articles.map((article) => article.id));
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const runBulkVerdict = useCallback(
    async (action: "approve" | "reject", ids: string[]) => {
      setBulkBusy(action);
      const previous = articles;

      // Decided stories leave the queue, so drop them optimistically.
      setArticles((prev) => prev.filter((article) => !ids.includes(article.id)));

      try {
        const res = await fetch("/api/articles/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ids }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Could not ${action} those stories`);
        }

        toast.success(
          `${data.affected} ${data.affected === 1 ? "story" : "stories"} ${
            action === "approve" ? "approved" : "rejected"
          }` + (data.skipped > 0 ? `, ${data.skipped} already decided` : "")
        );

        // Someone else may have decided some of them first.
        if (data.skipped > 0) await fetchArticles();
        selection.clear();
      } catch (cause) {
        setArticles(previous);
        toast.error(
          cause instanceof Error ? cause.message : `Could not ${action} those stories`
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [articles, fetchArticles, selection]
  );

  const bulkActions: BulkAction[] = [
    {
      id: "approve",
      label: "Approve",
      onRun: (ids) => runBulkVerdict("approve", ids),
    },
    {
      id: "reject",
      label: "Reject",
      destructive: true,
      onRun: (ids) => runBulkVerdict("reject", ids),
    },
  ];

  const openEditModal = (article: Article) => {
    setEditingArticle(article);
    setEditedSummary(article.summary || "");
    setEditedCategories([...article.category]);
    setNewCategory("");
  };

  const closeEditModal = () => {
    setEditingArticle(null);
    setEditedSummary("");
    setEditedCategories([]);
    setNewCategory("");
  };

  const saveEdits = async () => {
    if (!editingArticle) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/articles/${editingArticle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: editedSummary,
          category: editedCategories,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setArticles(
          articles.map((a) =>
            a.id === editingArticle.id
              ? { ...a, summary: editedSummary, category: editedCategories }
              : a
          )
        );
        toast.success("Story updated");
        closeEditModal();
      } else {
        toast.error(data.error || "Could not save those edits");
      }
    } catch (error) {
      console.error("Error updating article:", error);
      toast.error("Could not save those edits");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !editedCategories.includes(trimmed)) {
      setEditedCategories([...editedCategories, trimmed]);
      setNewCategory("");
    }
  };

  const removeCategory = (cat: string) => {
    setEditedCategories(editedCategories.filter((c) => c !== cat));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const hasFilters =
    Boolean(filters.search) ||
    filters.categories.length > 0 ||
    filters.scoreMin > 0 ||
    filters.scoreMax < 10 ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  /** Verdict pair, shared by all three layouts so the shortcut never moves. */
  const Verdict = ({
    article,
    compact = false,
  }: {
    article: Article;
    compact?: boolean;
  }) => (
    <div className={cn("flex items-center gap-1.5", compact && "justify-end")}>
      <RadarButton
        size="sm"
        variant="ghost"
        onClick={() => openEditModal(article)}
      >
        Edit
      </RadarButton>
      <RadarButton
        size="sm"
        onClick={() => decide(article, "reject")}
        disabled={deciding === article.id}
        className="hover:border-radar-err hover:text-radar-err"
      >
        Reject
      </RadarButton>
      <RadarButton
        size="sm"
        variant="accent"
        onClick={() => decide(article, "approve")}
        disabled={deciding === article.id}
      >
        {deciding === article.id ? "Saving…" : "Approve"}
      </RadarButton>
    </div>
  );

  const renderCardsView = () => (
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
                />
              </div>
              <ScoreMeter score={article.relevanceScore} className="shrink-0" />
            </div>

            <h3 className="font-editorial m-0 text-[17px] font-medium leading-[1.25] tracking-[-0.01em] text-radar-ink text-balance">
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-radar-ink no-underline hover:text-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              >
                {article.title}
              </a>
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

            {/* The source already appears in the stamp above, so the footer is
                only the verdict. */}
            <div className="mt-4 flex justify-end border-t border-radar-line2 pt-3.5">
              <Verdict article={article} />
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderCompactView = () => (
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
            />
            <h3 className="font-editorial m-0 text-[15.5px] font-medium leading-[1.3] text-radar-ink text-pretty">
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-radar-ink no-underline hover:text-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              >
                {article.title}
              </a>
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
            <Verdict article={article} compact />
          </div>
        </article>
      ))}
    </div>
  );

  const renderTableView = () => (
    <TableShell>
      <table className={tableClass}>
        <caption className="sr-only">Stories waiting for review</caption>
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
              Published
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
              className={cn(trClass, selection.isSelected(article.id) && "bg-radar-surface2")}
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
                <a
                  href={article.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-radar-ink no-underline hover:text-radar-accent"
                >
                  {article.title}
                </a>
              </td>
              <td className={cn(tdClass, "whitespace-nowrap")}>
                {sourceIdentity(article.sourceUrl).name}
              </td>
              <td className={cn(tdClass, "whitespace-nowrap")}>
                {relativeTime(article.publishedAt)}
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
                <Verdict article={article} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );

  /**
   * Select-all strip for the layouts that have no table header to hang it off.
   * The table view carries its own header checkbox instead.
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
        return renderCompactView();
      case "table":
        return renderTableView();
      default:
        return renderCardsView();
    }
  };

  const topScore = articles.reduce(
    (max, article) => Math.max(max, article.relevanceScore ?? 0),
    0
  );

  return (
    <>
      <AppHeader />

      <RadarMain width="1240px">
        <PageHeading
          eyebrow="Review queue"
          title={
            loading && articles.length === 0
              ? "Review queue"
              : articles.length === 0
                ? "The queue is clear"
                : `${articles.length} ${articles.length === 1 ? "story" : "stories"} waiting on you`
          }
          subtitle={
            articles.length > 0 ? (
              <>
                Approving sends a story to the next edition. The best of this batch
                scores <Num>{topScore.toFixed(1)}</Num> out of 10.
              </>
            ) : (
              "Curation scores every story it collects; anything above your threshold lands here for a human verdict."
            )
          }
          actions={<LayoutToggle value={layout} onChange={setLayout} />}
        />

        <ArticleFiltersComponent
          filters={filters}
          onChange={setFilters}
          availableCategories={availableCategories}
          className="mb-5"
        />

        {loadError && !loading && (
          <EmptyState
            title="The queue could not be loaded"
            actions={
              <RadarButton variant="accent" onClick={() => void fetchArticles()}>
                Try again
              </RadarButton>
            }
          >
            {loadError}
          </EmptyState>
        )}

        {loading && articles.length === 0 && !loadError && (
          <SkeletonRows rows={5} />
        )}

        {!loading && !loadError && articles.length === 0 && (
          <EmptyState
            title={
              hasFilters ? "Nothing matches those filters" : "Nothing to review"
            }
            actions={
              hasFilters ? (
                <RadarButton
                  variant="accent"
                  onClick={() => setFilters(defaultArticleFilters)}
                >
                  Clear filters
                </RadarButton>
              ) : (
                <>
                  <Link href="/dashboard" className={radarButtonClass("accent")}>
                    Run curation on the feed
                  </Link>
                  <Link href="/dashboard/sources" className={radarButtonClass()}>
                    Check sources
                  </Link>
                </>
              )
            }
          >
            {hasFilters
              ? "Widen the score range or clear a topic, and the queue will fill back up."
              : "Either every story has had a verdict, or curation has not run since the last one. Running it from the feed collects and scores whatever your sources have published."}
          </EmptyState>
        )}

        {articles.length > 0 && !loadError && (
          <>
            {loading && (
              <p
                role="status"
                className="mb-2.5 text-[11.5px] text-radar-ink3"
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
          </>
        )}
      </RadarMain>

      {/* Edit story */}
      <Dialog
        open={!!editingArticle}
        onOpenChange={(open) => !open && closeEditModal()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit before approving</DialogTitle>
            <DialogDescription>
              The summary and topics travel into the newsletter. The title and link
              stay as published.
            </DialogDescription>
          </DialogHeader>

          {editingArticle && (
            <div className="flex flex-col gap-4">
              <div>
                <SectionLabel className="mb-1.5">Story</SectionLabel>
                <p className="m-0 text-[13px] font-medium text-radar-ink text-pretty">
                  {editingArticle.title}
                </p>
                <a
                  href={editingArticle.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-[11.5px] text-radar-ink3 hover:text-radar-accent"
                >
                  {editingArticle.sourceUrl}
                </a>
              </div>

              <RadarField
                label="Summary"
                htmlFor="review-summary"
                hint="Two or three sentences on why it matters, in the newsletter's voice."
              >
                <RadarTextarea
                  id="review-summary"
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
                        onClick={() => removeCategory(cat)}
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
                        addCategory();
                      }
                    }}
                  />
                  <RadarButton onClick={addCategory} disabled={!newCategory.trim()}>
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
            <RadarButton onClick={closeEditModal} disabled={saving}>
              Cancel
            </RadarButton>
            <RadarButton variant="accent" onClick={saveEdits} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

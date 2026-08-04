"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  ScoreMeter,
  SectionLabel,
  SkeletonBar,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import {
  BulkBar,
  SelectCheckbox,
  useSelection,
  type BulkAction,
} from "@/components/radar/selection";
import { relativeTime, sourceIdentity } from "@/lib/radar/source";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Edition {
  id: string;
  week: number;
  year: number;
  status: "DRAFT" | "FINALIZED" | "SENT";
  finalizedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  articleCount: number;
  projectCount: number;
  sharePointUrl: string | null;
  sharePointPublishedAt: string | null;
  sharePointError: string | null;
}

interface PipelineArticle {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  relevanceScore: number | null;
  category: string[];
  editionCount?: number;
}

type View = "pipeline" | "editions";

function currentWeekAndYear(): { week: number; year: number } {
  const now = new Date();
  const temp = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { week, year: temp.getUTCFullYear() };
}

function formatStamp(value: string | null): string {
  if (!value) return "not sent";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EditionsPage() {
  const router = useRouter();

  const [view, setView] = useState<View>("pipeline");
  const [editions, setEditions] = useState<Edition[]>([]);
  const [pending, setPending] = useState<PipelineArticle[]>([]);
  const [approved, setApproved] = useState<PipelineArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * RQ-005 action 7: the same selection the other lists have.
   *
   * Sent editions are held back by the endpoint unless explicitly included:
   * deleting one does not unsend the mail, it only removes the record that it
   * went out.
   */
  const selection = useSelection(editions.map((edition) => edition.id));
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(null);

  const runBulkDelete = async (ids: string[], includeSent: boolean) => {
    setBulkBusy("delete");
    const previous = editions;
    setEditions((prev) => prev.filter((edition) => !ids.includes(edition.id)));

    try {
      const res = await fetch("/api/editions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids, includeSent }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not delete those editions");
      }

      toast.success(
        `${data.affected} ${data.affected === 1 ? "edition" : "editions"} deleted` +
          (data.heldBackSent > 0
            ? `. ${data.heldBackSent} already sent and kept.`
            : "")
      );
      selection.clear();
      // The optimistic removal was wrong for anything held back.
      if (data.heldBackSent > 0 || data.skipped > 0) await load();
    } catch (cause) {
      setEditions(previous);
      toast.error(
        cause instanceof Error ? cause.message : "Could not delete those editions"
      );
    } finally {
      setBulkBusy(null);
      setPendingBulkDelete(null);
    }
  };

  const bulkActions: BulkAction[] = [
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      onRun: (ids) => setPendingBulkDelete(ids),
    },
  ];

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [editionsRes, pendingRes, approvedRes] = await Promise.all([
        fetch("/api/editions"),
        fetch("/api/articles/pending?sortBy=relevanceScore&sortOrder=desc"),
        fetch("/api/articles/approved"),
      ]);

      const editionsJson = await editionsRes.json();
      if (!editionsJson.success) {
        throw new Error(editionsJson.error || "Could not load editions");
      }
      setEditions(editionsJson.data ?? []);

      const pendingJson = await pendingRes.json();
      setPending(pendingJson.success ? (pendingJson.data ?? []) : []);

      const approvedJson = await approvedRes.json();
      setApproved(approvedJson.success ? (approvedJson.data ?? []) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load editions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const { week: w, year: y } = currentWeekAndYear();
    setWeek(w);
    setYear(y);
  }, [load]);

  const createEdition = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week, year, autoPopulate: true }),
      });
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Could not create the edition");
      }

      setShowCreate(false);
      router.push(`/dashboard/send/${json.data.id}`);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not create the edition"
      );
    } finally {
      setCreating(false);
    }
  };

  /* --------------------------------------------------------- derived pipeline */

  const waitingApproved = useMemo(
    () => approved.filter((a) => !a.editionCount),
    [approved]
  );
  const inEdition = useMemo(
    () => approved.filter((a) => Boolean(a.editionCount)),
    [approved]
  );
  const sentEditions = useMemo(
    () =>
      editions
        .filter((e) => e.status === "SENT")
        .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "")),
    [editions]
  );

  const openEdition = useMemo(
    () => editions.find((e) => e.status !== "SENT") ?? null,
    [editions]
  );

  const headline = openEdition
    ? `Week ${openEdition.week} · ${openEdition.year}`
    : "No edition in progress";

  const subtitle = openEdition ? (
    <>
      <Num>{openEdition.articleCount}</Num> stories and{" "}
      <Num>{openEdition.projectCount}</Num> projects in the draft ·{" "}
      <Num>{waitingApproved.length}</Num> approved and waiting ·{" "}
      <Num>{pending.length}</Num> still in review
    </>
  ) : (
    <>
      <Num>{waitingApproved.length}</Num> approved stories are waiting for an
      edition, and <Num>{pending.length}</Num> are still in review.
    </>
  );

  return (
    <>
      <AppHeader />

      <RadarMain width="1320px">
        <PageHeading
          eyebrow="Editions"
          title={headline}
          subtitle={subtitle}
          actions={
            <>
              <ChipGroup<View>
                label="Editions view"
                value={view}
                onChange={setView}
                options={[
                  { value: "pipeline", label: "Pipeline" },
                  { value: "editions", label: `All editions · ${editions.length}` },
                ]}
              />
              {openEdition ? (
                <Link
                  href={`/dashboard/send/${openEdition.id}`}
                  className={radarButtonClass("accent")}
                >
                  Open builder
                </Link>
              ) : (
                <RadarButton variant="accent" onClick={() => setShowCreate(true)}>
                  Create edition
                </RadarButton>
              )}
            </>
          }
        />

        {error && !isLoading && (
          <div className="rounded-xl border border-radar-err bg-radar-surface px-4 py-3.5">
            <p className="m-0 text-[13px] font-semibold text-radar-ink">
              Editions could not be loaded
            </p>
            <p className="mt-1 mb-3 text-[12.5px] text-radar-ink2">{error}</p>
            <RadarButton size="sm" onClick={() => void load()}>
              Try again
            </RadarButton>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 lg:grid-cols-4" aria-busy="true">
            <span className="sr-only">Loading the edition pipeline</span>
            {[0, 1, 2, 3].map((column) => (
              <div key={column} className="flex flex-col gap-2.5">
                <SkeletonBar width="70%" height={14} className="mb-2" />
                {[0, 1, 2].map((card) => (
                  <div
                    key={card}
                    className="radar-skeleton rounded-xl border border-radar-line bg-radar-surface p-3.5"
                  >
                    <SkeletonBar width="45%" height={10} />
                    <SkeletonBar width="92%" height={15} className="mt-2.5" />
                    <SkeletonBar width="60%" height={15} className="mt-1.5" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Pipeline board */}
        {!isLoading && !error && view === "pipeline" && (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PipelineColumn
              title="In review"
              dot="var(--r-warn)"
              count={pending.length}
              note="awaiting an editor"
              empty="Nothing waiting on a reader."
            >
              {pending.slice(0, 8).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
              {pending.length > 8 && (
                <Link
                  href="/dashboard/review"
                  className="rounded-xl border border-dashed border-radar-line px-3.5 py-3 text-center text-[12px] text-radar-ink3 no-underline transition-colors hover:border-radar-accent hover:text-radar-ink"
                >
                  {pending.length - 8} more in the review queue →
                </Link>
              )}
            </PipelineColumn>

            <PipelineColumn
              title="Approved"
              dot="var(--r-ok)"
              count={waitingApproved.length}
              note="ready for an edition"
              empty="Approve stories in the feed and they land here."
            >
              {waitingApproved.slice(0, 8).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </PipelineColumn>

            <PipelineColumn
              title="In edition"
              dot="var(--r-accent)"
              count={inEdition.length}
              note={openEdition ? `Week ${openEdition.week}` : "unscheduled"}
              empty="Create an edition to pull approved stories in."
            >
              {inEdition.slice(0, 8).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </PipelineColumn>

            <PipelineColumn
              title="Sent"
              dot="var(--r-primary2)"
              count={sentEditions.length}
              note={
                sentEditions[0]?.sentAt
                  ? `last ${relativeTime(sentEditions[0].sentAt)}`
                  : "none yet"
              }
              empty="Nothing has shipped yet."
            >
              {sentEditions.slice(0, 6).map((edition) => (
                <Link
                  key={edition.id}
                  href={`/dashboard/send/${edition.id}`}
                  className="block rounded-xl border border-radar-line bg-radar-surface p-3.5 no-underline shadow-radar transition-colors hover:border-radar-ink3"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] text-radar-ink3">
                      Week {edition.week} · {edition.year}
                    </span>
                    <span className="flex-1" />
                    {edition.sharePointUrl && (
                      <StatusChip tone="ok">archived</StatusChip>
                    )}
                  </div>
                  <div className="font-editorial text-[15px] leading-[1.3] text-radar-ink">
                    {edition.articleCount}{" "}
                    {edition.articleCount === 1 ? "story" : "stories"},{" "}
                    {edition.projectCount}{" "}
                    {edition.projectCount === 1 ? "project" : "projects"}
                  </div>
                  <div className="mt-2 text-[11px] text-radar-ink3">
                    Sent {formatStamp(edition.sentAt)}
                  </div>
                </Link>
              ))}
            </PipelineColumn>
          </div>
        )}

        {/* All editions */}
        {!isLoading && !error && view === "editions" && (
          <div>
            {editions.length === 0 ? (
              <div className="radar-enter mx-auto max-w-[560px] py-16 text-center">
                <h2 className="font-editorial m-0 text-[25px] font-medium text-radar-ink">
                  No editions yet
                </h2>
                <p className="mt-3 mb-6 text-[13.5px] text-radar-ink2 text-pretty">
                  An edition collects a week&rsquo;s approved stories and featured
                  projects into one send. Creating one pulls in whatever is already
                  approved.
                </p>
                <RadarButton variant="accent" onClick={() => setShowCreate(true)}>
                  Create the first edition
                </RadarButton>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-radar-line">
                  <table className="w-full border-collapse text-left">
                    <caption className="sr-only">
                      All newsletter editions, newest first
                    </caption>
                    <thead>
                      <tr className="border-b border-radar-line bg-radar-surface2 text-[10px] font-semibold uppercase tracking-[0.09em] text-radar-ink3">
                        <th scope="col" className="w-[36px] px-4 py-2.5 font-semibold">
                          <SelectCheckbox
                            checked={selection.allSelected}
                            indeterminate={selection.partiallySelected}
                            onToggle={() =>
                              selection.allSelected
                                ? selection.clear()
                                : selection.selectAll()
                            }
                            label={
                              selection.allSelected
                                ? "Clear selection"
                                : `Select all ${editions.length} editions`
                            }
                          />
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          Edition
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          Contents
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          Sent
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-2.5 text-right font-semibold"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {editions.map((edition) => (
                        <tr
                          key={edition.id}
                          className={cn(
                            "border-b border-radar-line2 transition-colors last:border-0",
                            selection.isSelected(edition.id)
                              ? "bg-radar-surface2"
                              : "hover:bg-radar-surface2"
                          )}
                        >
                          <td className="px-4 py-3">
                            <SelectCheckbox
                              checked={selection.isSelected(edition.id)}
                              onToggle={(modifiers) =>
                                selection.toggle(edition.id, modifiers)
                              }
                              label={`Select week ${edition.week} of ${edition.year}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/send/${edition.id}`}
                              className="text-[13px] font-medium text-radar-ink no-underline hover:text-radar-accent"
                            >
                              Week {edition.week} · {edition.year}
                            </Link>
                            <div className="mt-0.5 text-[11px] text-radar-ink3">
                              Created {formatStamp(edition.createdAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[12.5px] text-radar-ink2">
                            <Num>{edition.articleCount}</Num>{" "}
                            {edition.articleCount === 1 ? "story" : "stories"} ·{" "}
                            <Num>{edition.projectCount}</Num>{" "}
                            {edition.projectCount === 1 ? "project" : "projects"}
                          </td>
                          <td className="px-4 py-3 text-[12.5px] text-radar-ink2">
                            {edition.sentAt ? formatStamp(edition.sentAt) : "not sent"}
                            {edition.sharePointError && (
                              <div
                                className="mt-0.5 text-[11px] text-radar-err"
                                title={edition.sharePointError}
                              >
                                archive failed
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <StatusChip
                              tone={
                                edition.status === "SENT"
                                  ? "ok"
                                  : edition.status === "FINALIZED"
                                    ? "warn"
                                    : "neutral"
                              }
                            >
                              {edition.status === "SENT"
                                ? "Sent"
                                : edition.status === "FINALIZED"
                                  ? "Ready"
                                  : "Draft"}
                            </StatusChip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <BulkBar
                  selection={selection}
                  actions={bulkActions}
                  noun="edition"
                  busyAction={bulkBusy}
                />

                <div className="mt-3 flex items-center justify-between">
                  <SectionLabel>
                    {editions.length}{" "}
                    {editions.length === 1 ? "edition" : "editions"} total
                  </SectionLabel>
                  <RadarButton onClick={() => setShowCreate(true)}>
                    Create edition
                  </RadarButton>
                </div>
              </>
            )}
          </div>
        )}
      </RadarMain>

      {/* RQ-005: bulk delete, with sent editions held back by the endpoint. */}
      <Dialog
        open={pendingBulkDelete !== null}
        onOpenChange={(open) => !open && setPendingBulkDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {pendingBulkDelete?.length}{" "}
              {pendingBulkDelete?.length === 1 ? "edition" : "editions"}?
            </DialogTitle>
            <DialogDescription>
              Editions that have already been sent are kept: deleting one would
              not unsend the mail, only remove the record that it went out. The
              stories themselves are not deleted and return to the approved pool.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton
              variant="outline"
              onClick={() => setPendingBulkDelete(null)}
            >
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              disabled={bulkBusy !== null}
              onClick={() =>
                pendingBulkDelete && runBulkDelete(pendingBulkDelete, false)
              }
            >
              {bulkBusy === "delete"
                ? "Deleting…"
                : `Delete ${pendingBulkDelete?.length ?? 0}`}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an edition</DialogTitle>
            <DialogDescription>
              Approved stories and featured projects are pulled in automatically.
              You can reorder and cut them in the builder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {createError && (
              <p
                role="alert"
                className="m-0 rounded-lg border border-radar-err bg-radar-surface px-3 py-2 text-[12.5px] text-radar-err"
              >
                {createError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                  Week number
                </span>
                <input
                  type="number"
                  min={1}
                  max={53}
                  value={week}
                  onChange={(event) =>
                    setWeek(parseInt(event.target.value, 10) || 1)
                  }
                  className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                  Year
                </span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(event) =>
                    setYear(
                      parseInt(event.target.value, 10) || new Date().getFullYear()
                    )
                  }
                  className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                />
              </label>
            </div>
          </div>

          <DialogFooter>
            <RadarButton onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={createEdition}
              disabled={creating}
            >
              {creating ? "Creating…" : `Create Week ${week}`}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PipelineColumn({
  title,
  dot,
  count,
  note,
  empty,
  children,
}: {
  title: string;
  dot: string;
  count: number;
  note: string;
  empty: string;
  children: React.ReactNode;
}) {
  // Count is the authority on emptiness; inspecting children is unreliable.
  const hasCards = count > 0;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 border-b border-radar-line px-0.5 pb-2.5">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: dot }}
        />
        <h2 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-radar-ink">
          {title}
        </h2>
        <Num className="text-[11px] text-radar-ink3">{count}</Num>
        <span className="flex-1" />
        <span className="truncate text-[11px] text-radar-ink3">{note}</span>
      </div>

      {hasCards ? (
        children
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-radar-line px-3.5 py-6 text-center text-[12px] text-radar-ink3">
          {empty}
        </p>
      )}
    </section>
  );
}

function ArticleCard({ article }: { article: PipelineArticle }) {
  const identity = sourceIdentity(article.sourceUrl);

  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block rounded-xl border border-radar-line bg-radar-surface p-3.5 no-underline shadow-radar transition-colors",
        "hover:border-radar-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate text-[11px] text-radar-ink3">
          {identity.name}
        </span>
        <span className="flex-1" />
        <ScoreMeter score={article.relevanceScore} />
      </div>
      <div className="font-editorial text-[15px] leading-[1.3] text-radar-ink text-pretty">
        {article.title}
      </div>
      {article.category.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {article.category.slice(0, 2).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
    </a>
  );
}

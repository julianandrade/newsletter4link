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
import { isoWeekAndYear } from "@/lib/radar/week";
import { useOrgRole } from "@/components/radar/use-role";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Edition {
  id: string;
  week: number;
  year: number;
  status: "DRAFT" | "FINALIZED" | "SENT";
  finalizedAt: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
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

/** RQ-005 AC-8.3: archived editions are out of the way, not gone. */
type ArchivedFilter = "exclude" | "only" | "all";

const ARCHIVED_LABEL: Record<ArchivedFilter, string> = {
  exclude: "Live",
  only: "Archived",
  all: "All",
};

type EditionBulkAction = "archive" | "unarchive" | "delete" | "forceDelete";

const BULK_VERB: Record<EditionBulkAction, string> = {
  archive: "archive",
  unarchive: "unarchive",
  delete: "delete",
  forceDelete: "force delete",
};

/** What a confirmation needs to state. The three counts are only read for a force
 *  delete, where the numbers come from a dry run rather than from the selection. */
interface PendingBulk {
  action: EditionBulkAction;
  ids: string[];
  editions: number;
  events?: number;
  recipients?: number;
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
  const [archived, setArchived] = useState<ArchivedFilter>("exclude");
  const { atLeast } = useOrgRole();
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
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);

  /**
   * RQ-005 actions 7 and 8: one handler for the four outcomes the endpoint
   * supports, because they differ only in which rows they touch and what the
   * result is called.
   *
   * Nothing is removed optimistically. The endpoint decides by outcome, holding
   * back what an action cannot apply to, so guessing here and correcting after
   * would show a row leaving and coming back (AC-7.5).
   */
  const runBulk = async (action: EditionBulkAction, ids: string[]) => {
    setBulkBusy(action);

    try {
      const res = await fetch("/api/editions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Could not ${BULK_VERB[action]} those editions`);
      }

      // AC-7.6: the endpoint's own sentence, which names the numbers and the
      // reasons. Restating it here would be a second wording to keep in step.
      toast.success(data.message);
      selection.clear();
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : `Could not ${BULK_VERB[action]} those editions`
      );
    } finally {
      setBulkBusy(null);
      setPendingBulk(null);
    }
  };

  /**
   * AC-8.6: the confirmation for a force delete states numbers read at the moment
   * of asking. A dry run is what makes them real rather than a generic warning.
   */
  const askForceDelete = async (ids: string[]) => {
    setBulkBusy("forceDelete");

    try {
      const res = await fetch("/api/editions/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forceDelete", ids, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not read what that would destroy");
      }

      if (data.editions === 0) {
        toast.error(
          "None of those can be force deleted. Force delete is for editions that were sent."
        );
        return;
      }

      setPendingBulk({
        action: "forceDelete",
        ids,
        editions: data.editions,
        events: data.events,
        recipients: data.recipients,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not read what that would destroy"
      );
    } finally {
      setBulkBusy(null);
    }
  };

  /**
   * AC-7.4: the bar offers what the current selection can actually take.
   *
   * Offered when at least one selected edition qualifies, rather than only when
   * all of them do: a mixed selection is handled by outcome, and hiding the
   * action would make the user deselect rows to find out that (AC-7.5).
   */
  const selectedEditions = editions.filter((edition) =>
    selection.isSelected(edition.id)
  );
  const anySent = selectedEditions.some((edition) => edition.sentAt !== null);
  const anyUnsent = selectedEditions.some((edition) => edition.sentAt === null);
  const anyArchived = selectedEditions.some(
    (edition) => edition.archivedAt !== null
  );
  const anyLive = selectedEditions.some((edition) => edition.archivedAt === null);

  const bulkActions: BulkAction[] = [
    ...(anySent && anyLive
      ? [
          {
            id: "archive",
            label: "Archive",
            onRun: (ids: string[]) => runBulk("archive", ids),
          },
        ]
      : []),
    ...(anyArchived
      ? [
          {
            id: "unarchive",
            label: "Unarchive",
            onRun: (ids: string[]) => runBulk("unarchive", ids),
          },
        ]
      : []),
    ...(anyUnsent
      ? [
          {
            id: "delete",
            label: "Delete",
            destructive: true,
            onRun: (ids: string[]) =>
              setPendingBulk({ action: "delete", ids, editions: ids.length }),
          },
        ]
      : []),
    // AC-8.5: an OWNER's decision, and nobody else is offered it. The server
    // refuses 403 regardless of what is rendered here.
    ...(anySent && atLeast("OWNER")
      ? [
          {
            id: "forceDelete",
            label: "Force delete",
            destructive: true,
            onRun: (ids: string[]) => askForceDelete(ids),
          },
        ]
      : []),
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
        fetch(`/api/editions?archived=${archived}`),
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
    // Refetched when the archived filter changes: the server decides what is
    // visible, so the selection prunes to it rather than the client hiding rows
    // it still holds selected (AC-7.3).
  }, [archived]);

  useEffect(() => {
    void load();
    const { week: w, year: y } = isoWeekAndYear();
    setWeek(w);
    setYear(y);
  }, [load]);

  /**
   * RQ-005 AC-3.2: this screen is the destination every approval points at.
   *
   * The link is `/dashboard/send?view=pipeline#approved-waiting`, so the view in
   * the query decides which panel opens, and the anchor is scrolled to once the
   * data has arrived. Without the scroll the browser would look for the anchor
   * before the columns exist and land at the top of the page.
   */
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("view");
    if (param === "pipeline" || param === "editions") setView(param);
  }, []);

  useEffect(() => {
    if (isLoading || view !== "pipeline") return;
    if (window.location.hash !== "#approved-waiting") return;
    document
      .getElementById("approved-waiting")
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [isLoading, view]);

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
              {/* AC-8.3: archived editions are reachable, and out of the way by
                  default. Only meaningful on the list, so only shown there. */}
              {view === "editions" && (
                <ChipGroup<ArchivedFilter>
                  label="Archived"
                  value={archived}
                  onChange={setArchived}
                  options={(["exclude", "only", "all"] as ArchivedFilter[]).map(
                    (value) => ({ value, label: ARCHIVED_LABEL[value] })
                  )}
                />
              )}
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
            {/*
              RQ-005 action 4, AC-4.1: this column no longer builds a list.

              It showed the same pending-articles query as the Feed and the
              review screen, which is three copies of one list. Exactly one route
              renders that list now, and it is the proposal screen. The count
              stays, because knowing how many are waiting belongs on a pipeline.
            */}
            <PipelineColumn
              title="In review"
              dot="var(--r-warn)"
              count={pending.length}
              note="awaiting an editor"
              empty="Nothing waiting on a reader."
            >
              <Link
                href="/dashboard?view=queue"
                className="rounded-xl border border-dashed border-radar-line px-3.5 py-4 text-center text-[12px] text-radar-ink3 no-underline transition-colors hover:border-radar-accent hover:text-radar-ink"
              >
                {pending.length} {pending.length === 1 ? "story" : "stories"} in the
                queue →
              </Link>
            </PipelineColumn>

            {/* RQ-005 AC-3.2 and AC-3.6: the destination an approval points at.
                It exists already, so nothing is built for it. */}
            <PipelineColumn
              anchorId="approved-waiting"
              title="Approved"
              dot="var(--r-ok)"
              count={waitingApproved.length}
              note="ready for an edition"
              empty="Approve stories in the queue and they land here."
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
                      <StatusChip tone="ok">on SharePoint</StatusChip>
                    )}
                    {edition.archivedAt && (
                      <StatusChip tone="neutral">archived</StatusChip>
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
                            {/* BR-011: a sent edition can say who approved it.
                                Older ones cannot, because nothing recorded it. */}
                            {edition.approvedByEmail && (
                              <div className="mt-0.5 text-[11px] text-radar-ink3">
                                approved by {edition.approvedByEmail}
                              </div>
                            )}
                            {edition.archivedAt && (
                              <div className="mt-0.5 text-[11px] text-radar-ink3">
                                archived {formatStamp(edition.archivedAt)}
                              </div>
                            )}
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

      {/*
        RQ-005 AC-8.1, AC-8.4, AC-8.6: one confirmation for both destructive
        actions, worded from what the action actually destroys. A force delete
        states the numbers a dry run just read; a delete states that the stories
        return to the approved pool, because they do.
      */}
      <Dialog
        open={pendingBulk !== null}
        onOpenChange={(open) => !open && setPendingBulk(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingBulk?.action === "forceDelete"
                ? `Force delete ${pendingBulk.editions} sent ${
                    pendingBulk.editions === 1 ? "edition" : "editions"
                  }?`
                : `Delete ${pendingBulk?.editions ?? 0} ${
                    pendingBulk?.editions === 1 ? "edition" : "editions"
                  }?`}
            </DialogTitle>
            <DialogDescription>
              {pendingBulk?.action === "forceDelete" ? (
                <>
                  This also destroys <Num>{pendingBulk.events ?? 0}</Num> delivery{" "}
                  {pendingBulk.events === 1 ? "record" : "records"} for{" "}
                  <Num>{pendingBulk.recipients ?? 0}</Num>{" "}
                  {pendingBulk.recipients === 1 ? "recipient" : "recipients"}.
                  Opens, clicks and bounces for those editions are gone and cannot
                  be recovered. The mail itself was already delivered; this removes
                  only the record of it. Archiving keeps all of it.
                </>
              ) : (
                <>
                  Editions that were already sent are kept: deleting one would not
                  unsend the mail, only remove the record that it went out. The
                  stories themselves are not deleted and return to the approved
                  pool.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton variant="outline" onClick={() => setPendingBulk(null)}>
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              disabled={bulkBusy !== null}
              onClick={() =>
                pendingBulk && runBulk(pendingBulk.action, pendingBulk.ids)
              }
            >
              {bulkBusy !== null
                ? "Working…"
                : pendingBulk?.action === "forceDelete"
                  ? `Force delete ${pendingBulk.editions}`
                  : `Delete ${pendingBulk?.editions ?? 0}`}
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
  anchorId,
}: {
  title: string;
  dot: string;
  count: number;
  note: string;
  empty: string;
  children: React.ReactNode;
  /** RQ-005 AC-3.2: link target for the approved-and-waiting destination. */
  anchorId?: string;
}) {
  // Count is the authority on emptiness; inspecting children is unreliable.
  const hasCards = count > 0;

  return (
    <section id={anchorId} className="flex flex-col gap-2.5 scroll-mt-6">
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

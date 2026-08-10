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
import {
  SortableTh,
  SortAnnouncement,
  type SortState,
} from "@/components/radar/sortable";
import { sortBy } from "@/lib/list-sort";
import { mergeEditionArticles } from "@/lib/editions/add-to-edition";
import { relativeTime, sourceIdentity } from "@/lib/radar/source";
import { isoWeekAndYear, isoWeekStart } from "@/lib/radar/week";
import { useOrgRole } from "@/components/radar/use-role";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * RQ-008: open and sent, from one list, with a stable order for each.
 *
 * Exported and pure so the ordering rules are tested without rendering the page. Generic
 * over the row shape for the same reason: the test passes the four fields it cares about
 * rather than building a whole Edition.
 */
export function splitEditions<
  T extends { status: string; publishDate: string; sentAt: string | null },
>(editions: T[]): { open: T[]; sent: T[] } {
  const open = editions
    .filter((edition) => edition.status !== "SENT")
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  const sent = editions
    .filter((edition) => edition.status === "SENT")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  return { open, sent };
}

/** The Monday of `now`'s ISO week, which is what a weekly edition is dated. */
export function nextWeeklyDate(now: Date): Date {
  const { week, year } = isoWeekAndYear(now);
  return isoWeekStart(week, year);
}

interface Edition {
  id: string;
  week: number;
  year: number;
  /** RQ-008: the edition's own name, null on a weekly. */
  title: string | null;
  kind: "WEEKLY" | "SPECIAL";
  publishDate: string;
  /** The title, or the week label when there is none. Derived by the API. */
  label: string;
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

type EditionSortField = "publishDate" | "articleCount" | "sentAt" | "status";

/**
 * Draft, then Ready, then Sent, which is the order the work moves in.
 *
 * Alphabetically the enum reads DRAFT, FINALIZED, SENT and happens to agree, but the chip
 * says "Ready" for FINALIZED, so a reader sorting the Status column and getting D, R, S
 * would be looking at an accident. This makes it the intent.
 */
const EDITION_STATUS_ORDER: Record<Edition["status"], number> = {
  DRAFT: 0,
  FINALIZED: 1,
  SENT: 2,
};

const EDITION_SORT_LABELS: Record<EditionSortField, string> = {
  publishDate: "publication date",
  articleCount: "how many stories it holds",
  sentAt: "when it was sent",
  status: "status",
};

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

/**
 * A publication date, which is a day rather than an instant.
 *
 * RQ-008: read in UTC on purpose. `publishDate` is written as midnight UTC, so rendering
 * it in the viewer's timezone shows a time nobody chose ("01:00" in Lisbon) and, west of
 * UTC, shows the day before: midnight on 3 August reads as 2 August, 21:00 in São Paulo.
 * No time is shown for the same reason, there is not one.
 */
function formatDay(value: string | null): string {
  if (!value) return "no date";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function EditionsPage() {
  const router = useRouter();

  const [view, setView] = useState<View>("pipeline");
  const [archived, setArchived] = useState<ArchivedFilter>("exclude");
  const [editionSort, setEditionSort] = useState<SortState<EditionSortField>>({
    field: "publishDate",
    direction: "desc",
  });
  const { atLeast } = useOrgRole();
  const [editions, setEditions] = useState<Edition[]>([]);
  const [pending, setPending] = useState<PipelineArticle[]>([]);
  const [approved, setApproved] = useState<PipelineArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * The all-editions table's own order.
   *
   * In the browser because `/api/editions` has no `take` and no page: this array is every
   * edition, so there is no slice to mistake for the whole. Separate from `splitEditions`
   * deliberately, which orders the two pipeline columns and is not a thing a reader chooses.
   *
   * `publishDate` keeps `createdAt` as its tie-break, for the reason the route records: two
   * editions can share a week now, so the date alone is not a stable order.
   */
  const sortedEditions = useMemo(() => {
    if (editionSort.field === "publishDate") {
      const sign = editionSort.direction === "desc" ? -1 : 1;
      return [...editions].sort(
        (a, b) =>
          sign *
          (a.publishDate.localeCompare(b.publishDate) ||
            a.createdAt.localeCompare(b.createdAt))
      );
    }

    return sortBy(
      editions,
      (edition) =>
        editionSort.field === "articleCount"
          ? edition.articleCount
          : editionSort.field === "sentAt"
            ? edition.sentAt
            : EDITION_STATUS_ORDER[edition.status],
      editionSort.direction
    );
  }, [editions, editionSort]);

  /**
   * RQ-005 action 7: the same selection the other lists have.
   *
   * Sent editions are held back by the endpoint unless explicitly included:
   * deleting one does not unsend the mail, it only removes the record that it
   * went out.
   *
   * Ids in render order, so a shift-click range follows the rows on screen. The table is
   * reorderable now, so that is `sortedEditions` and not the order they arrived in.
   */
  const selection = useSelection(sortedEditions.map((edition) => edition.id));
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
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newKind, setNewKind] = useState<"WEEKLY" | "SPECIAL">("WEEKLY");

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
    // RQ-008: the Monday of the current ISO week, which is what a weekly edition is
    // dated. Sliced to yyyy-mm-dd because that is what a date input reads.
    setNewDate(nextWeeklyDate(new Date()).toISOString().slice(0, 10));
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
        body: JSON.stringify({
          title: newTitle.trim() || null,
          publishDate: newDate,
          kind: newKind,
          autoPopulate: true,
        }),
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
  const { open: openEditions, sent: sentEditions } = useMemo(
    () => splitEditions(editions),
    [editions]
  );

  /* ------------------------------------------- the approved column's own selection */

  /**
   * A second `useSelection`, not a shared one. The editions table and this column are
   * different lists of different things, and one selection across both would let a
   * bulk action reach rows that are not on screen.
   *
   * Ids in render order, which is every waiting story: the column scrolls rather than
   * slicing to eight, because "select all" over a slice of a hundred and twenty-eight
   * is the trap this whole change exists to remove.
   */
  const poolSelection = useSelection(waitingApproved.map((article) => article.id));
  const [poolBusy, setPoolBusy] = useState<string | null>(null);
  const [pendingVerdict, setPendingVerdict] = useState<{
    action: "reject" | "discard";
    ids: string[];
  } | null>(null);
  const [addingTo, setAddingTo] = useState<string[] | null>(null);

  const runVerdict = async (action: "reject" | "discard", ids: string[]) => {
    setPoolBusy(action);

    try {
      const res = await fetch("/api/articles/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "That did not go through");
      }

      const affected = data.data?.affected ?? ids.length;
      toast.success(
        `${affected} ${affected === 1 ? "story" : "stories"} ${
          action === "reject" ? "rejected" : "discarded"
        }.`
      );
      poolSelection.clear();
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "That did not go through"
      );
    } finally {
      setPoolBusy(null);
      setPendingVerdict(null);
    }
  };

  /**
   * Add the selection to an edition that already has contents.
   *
   * The read is not optional. `PATCH /api/editions/:id` replaces the whole article
   * array rather than appending, so sending the selection alone would leave the
   * edition holding only the selection. `mergeEditionArticles` carries the existing
   * rows through, and is unit-tested for exactly that.
   */
  const addSelectionToEdition = async (editionId: string, ids: string[]) => {
    setPoolBusy("add");

    try {
      const read = await fetch(`/api/editions/${editionId}`);
      const current = await read.json();
      if (!read.ok || !current.success) {
        throw new Error(current.error || "Could not read that edition");
      }

      const existing: string[] = (current.data?.articles ?? []).map(
        (article: { id: string }) => article.id
      );

      const res = await fetch(`/api/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articles: mergeEditionArticles(existing, ids) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not add those stories");
      }

      const added = data.data.articleCount - existing.length;
      toast.success(
        `${added} ${added === 1 ? "story" : "stories"} added to ${current.data.label}.`
      );
      poolSelection.clear();
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not add those stories"
      );
    } finally {
      setPoolBusy(null);
      setAddingTo(null);
    }
  };

  const poolActions: BulkAction[] = atLeast("EDITOR")
    ? [
        {
          id: "add",
          label: openEditions.length === 0 ? "No open edition" : "Add to edition…",
          onRun: (ids) => {
            if (openEditions.length === 0) {
              toast.error("Create an edition first, then add stories to it.");
              return;
            }
            // One open edition is the common case and needs no chooser.
            if (openEditions.length === 1) {
              void addSelectionToEdition(openEditions[0].id, ids);
              return;
            }
            setAddingTo(ids);
          },
        },
        {
          id: "reject",
          label: "Reject",
          destructive: true,
          onRun: (ids) => setPendingVerdict({ action: "reject", ids }),
        },
        {
          id: "discard",
          label: "Discard",
          destructive: true,
          onRun: (ids) => setPendingVerdict({ action: "discard", ids }),
        },
      ]
    : [];

  /**
   * RQ-008: the edition the "Open builder" shortcut points at, which is the soonest one.
   *
   * There can be several open editions now, and that is the change. Nothing else on this
   * screen treats this as "the" edition any more.
   */
  const nextEdition = openEditions[openEditions.length - 1] ?? null;

  const headline =
    openEditions.length === 0
      ? "No edition in progress"
      : openEditions.length === 1
        ? openEditions[0].label
        : `${openEditions.length} editions in progress`;

  const subtitle =
    openEditions.length === 0 ? (
      <>
        <Num>{waitingApproved.length}</Num> approved stories are waiting for an
        edition, and <Num>{pending.length}</Num> are still in review.
      </>
    ) : openEditions.length === 1 ? (
      <>
        <Num>{openEditions[0].articleCount}</Num> stories and{" "}
        <Num>{openEditions[0].projectCount}</Num> projects in the draft ·{" "}
        <Num>{waitingApproved.length}</Num> approved and waiting ·{" "}
        <Num>{pending.length}</Num> still in review
      </>
    ) : (
      <>
        {openEditions.map((edition) => edition.label).join(", ")} ·{" "}
        <Num>{waitingApproved.length}</Num> approved and waiting ·{" "}
        <Num>{pending.length}</Num> still in review
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
              {nextEdition && (
                <Link
                  href={`/dashboard/send/${nextEdition.id}`}
                  className={radarButtonClass()}
                >
                  Open builder
                </Link>
              )}
              {/* RQ-008: always reachable. This used to appear only when no edition was
                  open, which is what made a special edition impossible to create: with
                  the week's edition open there was no button to press. */}
              <RadarButton variant="accent" onClick={() => setShowCreate(true)}>
                Create edition
              </RadarButton>
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
            {/*
              The one column you can act on, so the only one that renders every card
              and carries a checkbox. Everything else here is a read-only summary.
            */}
            <PipelineColumn
              anchorId="approved-waiting"
              title="Approved"
              dot="var(--r-ok)"
              count={waitingApproved.length}
              note={
                poolSelection.count > 0
                  ? `${poolSelection.count} selected`
                  : "ready for an edition"
              }
              empty="Approve stories in the queue and they land here."
              scrolls
              lead={
                waitingApproved.length > 0 && atLeast("EDITOR") ? (
                  <SelectCheckbox
                    checked={poolSelection.allSelected}
                    indeterminate={poolSelection.partiallySelected}
                    onToggle={() =>
                      poolSelection.allSelected
                        ? poolSelection.clear()
                        : poolSelection.selectAll()
                    }
                    label={
                      poolSelection.allSelected
                        ? "Clear selection"
                        : `Select all ${waitingApproved.length} approved stories`
                    }
                  />
                ) : null
              }
            >
              {waitingApproved.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  selected={poolSelection.isSelected(article.id)}
                  onToggle={
                    atLeast("EDITOR")
                      ? (modifiers) => poolSelection.toggle(article.id, modifiers)
                      : undefined
                  }
                />
              ))}
            </PipelineColumn>

            <PipelineColumn
              title="In edition"
              dot="var(--r-accent)"
              count={inEdition.length}
              note={
                openEditions.length === 0
                  ? "unscheduled"
                  : openEditions.length === 1
                    ? openEditions[0].label
                    : `${openEditions.length} open editions`
              }
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
                      {edition.label}
                    </span>
                    {/* RQ-008: a named edition needs saying what kind it is, or a
                        special reads as an oddly titled weekly. */}
                    {edition.kind === "SPECIAL" && (
                      <StatusChip tone="neutral">special</StatusChip>
                    )}
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

        {/*
          Outside the grid, so the bar spans the board rather than sitting inside the
          one column it acts on and inheriting its scroll container.
        */}
        {!isLoading && !error && view === "pipeline" && (
          <BulkBar
            selection={poolSelection}
            actions={poolActions}
            noun="story"
            nounPlural="stories"
            busyAction={poolBusy}
          />
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
                <SortAnnouncement
                  sort={editionSort}
                  labels={EDITION_SORT_LABELS}
                  count={editions.length}
                  noun={editions.length === 1 ? "edition" : "editions"}
                />
                <div className="overflow-x-auto rounded-xl border border-radar-line">
                  <table className="w-full border-collapse text-left">
                    {/* No longer "newest first": the headers decide, so the caption says
                        what the table is and the live region says how it is ordered. */}
                    <caption className="sr-only">All newsletter editions</caption>
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
                        <SortableTh
                          field="publishDate"
                          sort={editionSort}
                          onSort={setEditionSort}
                          defaultDirection="desc"
                        >
                          Edition
                        </SortableTh>
                        {/* Orders by the story count, which is the number that decides
                            whether an edition is thin. Projects break the tie. */}
                        <SortableTh
                          field="articleCount"
                          sort={editionSort}
                          onSort={setEditionSort}
                          defaultDirection="desc"
                        >
                          Contents
                        </SortableTh>
                        <SortableTh
                          field="sentAt"
                          sort={editionSort}
                          onSort={setEditionSort}
                          defaultDirection="desc"
                        >
                          Sent
                        </SortableTh>
                        <SortableTh
                          field="status"
                          sort={editionSort}
                          onSort={setEditionSort}
                          defaultDirection="asc"
                          align="right"
                        >
                          Status
                        </SortableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEditions.map((edition) => (
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
                              label={`Select ${edition.label}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/send/${edition.id}`}
                              className="text-[13px] font-medium text-radar-ink no-underline hover:text-radar-accent"
                            >
                              {edition.label}
                            </Link>
                            {/* RQ-008: the publication date, so a named edition is
                                placed in time rather than floating. */}
                            <div className="mt-0.5 text-[11px] text-radar-ink3">
                              {edition.kind === "SPECIAL" ? "Special · " : ""}
                              {formatDay(edition.publishDate)}
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

            {/* RQ-008: a date and a name. This used to be two number inputs, Week and
                Year, and those two required numbers were the edition's whole identity,
                which is what made a special edition impossible to ask for. */}
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                Publication date
              </span>
              <input
                type="date"
                value={newDate}
                onChange={(event) => setNewDate(event.target.value)}
                className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              />
              <span className="mt-1 block text-[11.5px] text-radar-ink3">
                The week number is read from this date, so nothing has to be counted.
              </span>
            </label>

            <ChipGroup<"WEEKLY" | "SPECIAL">
              label="Edition kind"
              value={newKind}
              onChange={setNewKind}
              options={[
                { value: "WEEKLY", label: "Weekly" },
                { value: "SPECIAL", label: "Special" },
              ]}
            />

            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                Name {newKind === "WEEKLY" ? "(optional)" : ""}
              </span>
              <input
                type="text"
                maxLength={120}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder={
                  newKind === "WEEKLY"
                    ? "Left empty, it is labelled by its week"
                    : "AI Act special"
                }
                className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              />
              <span className="mt-1 block text-[11.5px] text-radar-ink3">
                {newKind === "SPECIAL"
                  ? "A special edition needs a name, so it can be told apart from the weekly one."
                  : "A weekly edition without a name is labelled from its date."}
              </span>
            </label>
          </div>

          <DialogFooter>
            <RadarButton onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={createEdition}
              // A special with no name is refused by the API, so it is refused here too
              // rather than sending a request that can only come back a 400.
              disabled={
                creating ||
                !newDate ||
                (newKind === "SPECIAL" && newTitle.trim().length === 0)
              }
            >
              {creating ? "Creating…" : "Create edition"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Which edition the selection goes to, when more than one is open. */}
      <Dialog
        open={addingTo !== null}
        onOpenChange={(open) => !open && setAddingTo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {addingTo?.length}{" "}
              {addingTo?.length === 1 ? "story" : "stories"} to which edition?
            </DialogTitle>
            <DialogDescription>
              They are appended after what the edition already holds, and nothing
              already in it is disturbed. Reorder them in the builder.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-2">
            {openEditions.map((edition) => (
              <button
                key={edition.id}
                type="button"
                disabled={poolBusy !== null}
                onClick={() =>
                  addingTo && void addSelectionToEdition(edition.id, addingTo)
                }
                className="flex items-center gap-2 rounded-xl border border-radar-line bg-radar-surface px-3.5 py-3 text-left transition-colors hover:border-radar-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-editorial block text-[14.5px] text-radar-ink">
                    {edition.label}
                  </span>
                  <span className="text-[11.5px] text-radar-ink3">
                    <Num>{edition.articleCount}</Num>{" "}
                    {edition.articleCount === 1 ? "story" : "stories"} ·{" "}
                    {edition.status.toLowerCase()}
                  </span>
                </span>
                {edition.kind === "SPECIAL" && (
                  <StatusChip tone="neutral">special</StatusChip>
                )}
              </button>
            ))}
          </div>

          <DialogFooter>
            <RadarButton
              onClick={() => setAddingTo(null)}
              disabled={poolBusy !== null}
            >
              Cancel
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Both verdicts confirm, on the rule in lib/articles/list-filter.ts. */}
      <Dialog
        open={pendingVerdict !== null}
        onOpenChange={(open) => !open && setPendingVerdict(null)}
      >
        <DialogContent>
          {pendingVerdict && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pendingVerdict.action === "reject" ? "Reject" : "Discard"}{" "}
                  {pendingVerdict.ids.length}{" "}
                  {pendingVerdict.ids.length === 1 ? "story" : "stories"}?
                </DialogTitle>
                <DialogDescription>
                  {pendingVerdict.action === "reject"
                    ? "They leave the approved pool and will not appear in any edition. Reversible from the All articles screen."
                    : "They leave every list, including the queue, and are pulled out of any edition that has not been sent. Collection will not bring them back; restore is on the All articles screen under Discarded."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <RadarButton
                  onClick={() => setPendingVerdict(null)}
                  disabled={poolBusy !== null}
                >
                  Cancel
                </RadarButton>
                <RadarButton
                  variant="accent"
                  disabled={poolBusy !== null}
                  onClick={() =>
                    void runVerdict(pendingVerdict.action, pendingVerdict.ids)
                  }
                >
                  {poolBusy === pendingVerdict.action
                    ? "Working…"
                    : `${pendingVerdict.action === "reject" ? "Reject" : "Discard"} ${pendingVerdict.ids.length}`}
                </RadarButton>
              </DialogFooter>
            </>
          )}
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
  lead,
  scrolls,
}: {
  title: string;
  dot: string;
  count: number;
  note: string;
  empty: string;
  children: React.ReactNode;
  /** RQ-005 AC-3.2: link target for the approved-and-waiting destination. */
  anchorId?: string;
  /** Sits before the column name. The select-all checkbox, where there is one. */
  lead?: React.ReactNode;
  /**
   * Render every card behind a scrollbar rather than letting the column run the
   * length of the page. Only the column you can act on needs it, and it needs it:
   * slicing to the first eight while offering "select all" is the trap.
   */
  scrolls?: boolean;
}) {
  // Count is the authority on emptiness; inspecting children is unreliable.
  const hasCards = count > 0;

  return (
    <section id={anchorId} className="flex flex-col gap-2.5 scroll-mt-6">
      <div className="flex items-center gap-2 border-b border-radar-line px-0.5 pb-2.5">
        {lead}
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
        <div
          className={cn(
            "flex flex-col gap-2.5",
            scrolls && "max-h-[68vh] overflow-y-auto pr-1"
          )}
        >
          {children}
        </div>
      ) : (
        <p className="m-0 rounded-xl border border-dashed border-radar-line px-3.5 py-6 text-center text-[12px] text-radar-ink3">
          {empty}
        </p>
      )}
    </section>
  );
}

/**
 * A pipeline card, selectable or not.
 *
 * The two shapes are not decoration. Unselectable, the whole card is one link to the
 * story, which is the right target when reading is all it does. Selectable, it cannot
 * be: a checkbox inside an anchor is not operable by keyboard, so the card becomes a
 * container and the headline carries the link.
 */
function ArticleCard({
  article,
  selected,
  onToggle,
}: {
  article: PipelineArticle;
  selected?: boolean;
  onToggle?: (modifiers: { shiftKey: boolean }) => void;
}) {
  const identity = sourceIdentity(article.sourceUrl);

  const meta = (
    <>
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
    </>
  );

  if (!onToggle) {
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
        {meta}
      </a>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border bg-radar-surface p-3.5 shadow-radar transition-colors",
        selected
          ? "border-radar-accent"
          : "border-radar-line hover:border-radar-ink3"
      )}
    >
      <SelectCheckbox
        checked={Boolean(selected)}
        onToggle={onToggle}
        label={`Select ${article.title}`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
        >
          {meta}
        </a>
      </div>
    </div>
  );
}

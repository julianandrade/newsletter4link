"use client";

/**
 * Finding D2: the emails that arrived, and what each one produced.
 *
 * There was no screen over `InboundEmail` at all. Fifty-seven real emails had been
 * received, read and processed in production and none of them was visible in the product,
 * so "what did this newsletter actually give us" could only be answered by querying the
 * database by hand.
 *
 * One row per email, expandable to the articles it produced. Expanding fetches, because a
 * list of fifty-seven emails does not need fifty-seven article lists loaded to show a
 * count, and the count is what most visits are looking for.
 */

import { useCallback, useEffect, useState } from "react";
import { ArticleTitleLink } from "@/components/article/article-title-link";
import {
  ExternalLink,
  Num,
  RadarButton,
  ScoreMeter,
  StatusChip,
} from "@/components/radar/primitives";
import {
  EmptyState,
  LoadError,
  RadarInput,
  RadarSelect,
  SkeletonRows,
} from "@/components/radar/controls";
import { SearchIcon } from "@/components/radar/icons";
import {
  SortSelect,
  SortAnnouncement,
  applySortParams,
  type SortOption,
  type SortState,
} from "@/components/radar/sortable";
import { relativeTime, sourceIdentity } from "@/lib/radar/source";

/** Mirrors `RECEIVED_SORT_FIELDS` in `lib/inbound/received.ts`. */
type ReceivedSortField = "receivedAt" | "from" | "status";

type StatusFilter =
  | "all"
  | "RECEIVED"
  | "CONTENT_PENDING"
  | "PROCESSED"
  | "FAILED"
  | "IGNORED_UNKNOWN_SENDER";

const STATUS_FILTERS: [StatusFilter, string][] = [
  ["all", "Every status"],
  ["PROCESSED", "Processed"],
  ["FAILED", "Failed"],
  ["CONTENT_PENDING", "Waiting for content"],
  ["RECEIVED", "Waiting for extraction"],
  ["IGNORED_UNKNOWN_SENDER", "Unclaimed sender"],
];

const RECEIVED_SORT_OPTIONS: SortOption<ReceivedSortField>[] = [
  { field: "receivedAt", direction: "desc", label: "Newest first" },
  { field: "receivedAt", direction: "asc", label: "Oldest first" },
  { field: "from", direction: "asc", label: "Grouped by sender" },
  { field: "status", direction: "asc", label: "Grouped by status" },
];

const RECEIVED_SORT_LABELS: Record<ReceivedSortField, string> = {
  receivedAt: "when it arrived",
  from: "sender",
  status: "status",
};

interface ReceivedEmail {
  id: string;
  from: string;
  subject: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: string;
  error: string | null;
  sourceId: string | null;
  sourceName: string | null;
  articleCount: number;
  unresolvedCount: number;
  hasContent: boolean;
}

interface ReceivedArticle {
  id: string;
  title: string;
  sourceUrl: string;
  status: string;
  relevanceScore: number | null;
  sourceUnresolved: boolean;
  capturedAt: string;
}

/**
 * What each status means in words, because the enum names are ours and not the reader's.
 *
 * `PROCESSED` with no articles is the case worth explaining rather than leaving blank: a
 * newsletter can legitimately be all sponsors and job listings, and every item can be a
 * duplicate of something already collected.
 */
function statusChip(email: ReceivedEmail) {
  if (email.status === "FAILED") {
    return <StatusChip tone="err">could not be read</StatusChip>;
  }
  if (email.status === "IGNORED_UNKNOWN_SENDER") {
    return <StatusChip tone="neutral">no source claimed it</StatusChip>;
  }
  if (email.status === "CONTENT_PENDING") {
    return <StatusChip tone="warn">body not fetched yet</StatusChip>;
  }
  if (email.status === "RECEIVED") {
    return <StatusChip tone="warn">waiting to be read</StatusChip>;
  }
  if (email.articleCount === 0) {
    return <StatusChip tone="neutral">nothing to take</StatusChip>;
  }
  return <StatusChip tone="ok">read</StatusChip>;
}

/**
 * Why a row has no articles, which is four different answers and used to be one.
 *
 * The panel said "This email produced no articles, a newsletter can be all sponsors and
 * job listings" for every empty row, including rows the job had never looked at. For an
 * email still waiting for its body that sentence is simply false, and it is the sentence a
 * reader would act on: it says the pipeline considered this email and found nothing worth
 * taking, when in fact nothing has happened to it yet.
 *
 * The ingest runs once a day, at 05:30. An email arriving during the day sits until the
 * next morning, and the copy has to say so rather than imply a verdict.
 */
function emptyReason(email: ReceivedEmail): string {
  if (email.status === "CONTENT_PENDING") {
    return "This email has not been read yet. Its body is still to be fetched, and the ingest runs once a day at 05:30, so an email that arrived during the day is read the next morning.";
  }

  if (email.status === "RECEIVED") {
    return "The body of this email is stored and it is queued to be read. Nothing has been extracted from it yet.";
  }

  if (email.status === "IGNORED_UNKNOWN_SENDER") {
    return "No source claimed this sender, so the email was set aside without being read. Create an email source for it and its held mail is put back in the queue.";
  }

  if (email.status === "FAILED") {
    return email.error
      ? `This email could not be read: ${email.error}`
      : "This email could not be read.";
  }

  return "This email was read and produced no articles. That is not necessarily a failure: a newsletter can be all sponsors and job listings, and every item in it can be a duplicate of something already collected.";
}

export function ReceivedEmails() {
  const [emails, setEmails] = useState<ReceivedEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Record<string, ReceivedArticle[]>>({});
  const [loadingArticles, setLoadingArticles] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<ReceivedSortField>>({
    field: "receivedAt",
    direction: "desc",
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /**
   * The filter and the order go to the server, because the route caps at 100 rows.
   *
   * That cap is what makes the difference matter: narrowing 100 of 340 emails to FAILED in
   * the browser shows the failures inside the last window, not the failures, and the
   * failures worth finding are exactly the ones that fell off the end of it.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      applySortParams(params, sort);

      const response = await fetch(`/api/inbound/received?${params.toString()}`);
      const json = await response.json();

      if (!json.success) throw new Error(json.error || "Could not load the emails");

      setEmails(json.emails ?? []);
      setTotal(json.total ?? 0);
      setLimit(json.limit ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the emails");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (email: ReceivedEmail) => {
    if (openId === email.id) {
      setOpenId(null);
      return;
    }

    setOpenId(email.id);

    // Fetched once and kept: reopening a row is free, and nothing about it changes while
    // the screen is open.
    if (articles[email.id]) return;

    setLoadingArticles(email.id);

    try {
      const response = await fetch(`/api/inbound/received?emailId=${email.id}`);
      const json = await response.json();
      setArticles((current) => ({
        ...current,
        [email.id]: json.success ? (json.data ?? []) : [],
      }));
    } catch {
      setArticles((current) => ({ ...current, [email.id]: [] }));
    } finally {
      setLoadingArticles(null);
    }
  };

  const narrowed = statusFilter !== "all" || Boolean(search);

  /**
   * Rendered above every state, including the empty one.
   *
   * A filter that returns nothing must not take its own undo off the screen with it. The
   * early returns below used to be the whole component, so putting the controls inside the
   * success branch would have made "Failed" with no failures a dead end.
   */
  const controls = (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
        <SearchIcon
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
        />
        <RadarInput
          type="search"
          aria-label="Search the received emails"
          placeholder="Search by sender or subject"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="pl-9"
        />
      </div>

      <RadarSelect
        aria-label="Filter by status"
        className="w-auto min-w-[170px]"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
      >
        {STATUS_FILTERS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </RadarSelect>

      <SortSelect
        label="Sort the received emails"
        options={RECEIVED_SORT_OPTIONS}
        sort={sort}
        onChange={setSort}
      />
    </div>
  );

  if (error) {
    return (
      <>
        {controls}
        <LoadError what="The received emails" message={error} onRetry={load} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        {controls}
        <SkeletonRows rows={4} />
      </>
    );
  }

  if (emails.length === 0) {
    return (
      <>
        {controls}
        <EmptyState title={narrowed ? "Nothing matches that" : "No emails yet"}>
          {narrowed
            ? "Widen the status, or clear the search, and the list will fill back up."
            : "When a newsletter arrives at the ingest address and one of your email sources claims its sender, it appears here with the articles it produced."}
        </EmptyState>
      </>
    );
  }

  return (
    <>
    {controls}
    <SortAnnouncement
      sort={sort}
      labels={RECEIVED_SORT_LABELS}
      count={emails.length}
      noun={emails.length === 1 ? "email" : "emails"}
    />
    <div className="rounded-xl border border-radar-line">
      <ul className="m-0 list-none p-0">
        {emails.map((email) => {
          const open = openId === email.id;
          const rows = articles[email.id];

          return (
            <li key={email.id} className="border-b border-radar-line2 last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void toggle(email)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-radar-ink">
                      {email.subject || "(no subject)"}
                    </span>
                    {statusChip(email)}
                    {/* Finding D4: worth saying on the list, not only on the article. */}
                    {email.unresolvedCount > 0 && (
                      <StatusChip tone="warn">
                        {email.unresolvedCount} unresolved{" "}
                        {email.unresolvedCount === 1 ? "link" : "links"}
                      </StatusChip>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-radar-ink3">
                    {email.sourceName ?? email.from} · arrived{" "}
                    {relativeTime(email.receivedAt)}
                    {email.processedAt && <> · read {relativeTime(email.processedAt)}</>}
                  </div>
                  {email.error && (
                    <div className="mt-1 text-[11.5px] text-radar-err">{email.error}</div>
                  )}
                </button>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[12px] text-radar-ink2">
                    <Num>{email.articleCount}</Num>{" "}
                    {email.articleCount === 1 ? "article" : "articles"}
                  </span>
                  <RadarButton size="sm" onClick={() => void toggle(email)}>
                    {open ? "Hide" : "Show"}
                  </RadarButton>
                </div>
              </div>

              {open && (
                <div className="border-t border-radar-line2 bg-radar-surface2 px-4 py-3">
                  {loadingArticles === email.id && <SkeletonRows rows={2} />}

                  {loadingArticles !== email.id && rows && rows.length === 0 && (
                    <p className="m-0 text-[12.5px] text-radar-ink2 text-pretty">
                      {emptyReason(email)}
                    </p>
                  )}

                  {loadingArticles !== email.id && rows && rows.length > 0 && (
                    <ol className="m-0 list-none p-0">
                      {rows.map((article) => (
                        <li
                          key={article.id}
                          className="flex flex-wrap items-start gap-3 border-b border-radar-line2 py-2.5 last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-radar-ink3">
                              {/* The publisher this points at, which is the whole reason
                                  provenance matters: the newsletter is above, the source
                                  is here, and finding D4 says when they are the same. */}
                              <ExternalLink
                                href={article.sourceUrl}
                                className="text-radar-ink3 no-underline hover:text-radar-accent"
                              >
                                {sourceIdentity(article.sourceUrl).name}
                              </ExternalLink>
                              {article.sourceUnresolved && (
                                <span className="text-radar-warn">
                                  {" "}
                                  · the newsletter&rsquo;s link, not the publisher&rsquo;s
                                </span>
                              )}
                            </div>
                            <div className="text-[13px] text-radar-ink">
                              <ArticleTitleLink
                                articleId={article.id}
                                title={article.title}
                              />
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <StatusChip
                              tone={
                                article.status === "APPROVED"
                                  ? "ok"
                                  : article.status === "REJECTED"
                                    ? "neutral"
                                    : "warn"
                              }
                            >
                              {article.status === "PENDING_REVIEW"
                                ? "awaiting a decision"
                                : article.status.toLowerCase()}
                            </StatusChip>
                            <ScoreMeter score={article.relevanceScore} />
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* No silent truncation: a list showing a window says so. And it now says which
          window, because the order decides which rows the cap keeps: under "Oldest first"
          these are the oldest 100, not the most recent. */}
      {total > emails.length && (
        <div className="border-t border-radar-line2 px-4 py-2.5 text-[11.5px] text-radar-ink3">
          Showing {limit} of <Num>{total}</Num>
          {narrowed ? " matching emails" : " emails"}, in the order chosen above.
        </div>
      )}
    </div>
    </>
  );
}

"use client";

/**
 * RQ-006_03: the check result on the screen, and the audit trail behind a disclosure.
 *
 * This exists because of a recorded decision, not because it is nice to have.
 * PLAN-REVIEW.md open question 1 was answered "a human may or may not read a generated
 * piece before it goes out", and the recorded consequence is that the mechanical checks
 * stop being a safety net and become the only control: "every generated piece must
 * carry its check result so a complaint can be answered with evidence rather than
 * intent". Evidence kept only in a database column is evidence nobody sees.
 *
 * The line is shown to anybody who can read the piece. The history is EDITOR and above,
 * because a failed past attempt with its reason is working material rather than
 * something a reader of one article needs.
 */

import { RadarDisclosure } from "@/components/radar/controls";
import { SectionLabel } from "@/components/radar/primitives";
import { shortDate } from "@/lib/radar/source";
import {
  formatInputMode,
  type RewriteHistoryEntry,
  type ViewRewrite,
} from "@/lib/rewrite/view";

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** One quiet line: what it was written from, how long it is, and how it was checked. */
export function LinkTakeEvidence({ rewrite }: { rewrite: ViewRewrite }) {
  const facts: string[] = [`Written from the ${formatInputMode(rewrite.inputMode)}`];

  if (rewrite.wordCount !== null) {
    facts.push(`${rewrite.wordCount} words`);
  }

  if (rewrite.longestSharedRun !== null) {
    // The number is the evidence, per the comment on the check itself: a piece whose
    // longest shared run is 1 is demonstrably not a reproduction, and "passed" alone
    // does not say that.
    facts.push(
      `longest run shared with the source ${rewrite.longestSharedRun} ${plural(rewrite.longestSharedRun, "word", "words")}`
    );
  }

  facts.push(rewrite.model);
  facts.push(shortDate(rewrite.generatedAt));

  return (
    <>
      <p className="m-0 text-[11.5px] text-radar-ink3 text-pretty">
        {facts.join(" · ")}
      </p>

      {/*
        Its own line rather than another fact in the list: it is a sentence somebody typed,
        of any length, and a middle dot between it and the model name would read as part of
        the ask. Shown at all because prose that reads differently from the version it
        replaced should say why where the piece is, not only in the history.
      */}
      {rewrite.instruction ? (
        <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3 text-pretty">
          {`Written to an instruction: "${rewrite.instruction}"`}
        </p>
      ) : null}
    </>
  );
}

/**
 * Every version ever written for this article, newest first.
 *
 * Nothing is overwritten in the database (review F5), and this is the surface that
 * makes that worth having. A `FAILED` row is shown with its reason: "why is there no
 * Link Take here" and "why was the one we had replaced" are both questions an editor
 * asks, and both are answered here rather than by a query.
 */
export function RewriteHistoryPanel({
  history,
  error,
  onFirstOpen,
}: {
  history?: RewriteHistoryEntry[] | null;
  error?: string | null;
  onFirstOpen?: () => void;
}) {
  return (
    <RadarDisclosure
      label="History, every version and every refusal"
      onFirstOpen={onFirstOpen}
      className="mt-4"
    >
      {error ? (
        <p className="m-0 text-[12.5px] text-radar-err">{error}</p>
      ) : !history ? (
        <p className="m-0 text-[12.5px] text-radar-ink3">Reading the history.</p>
      ) : history.length === 0 ? (
        <p className="m-0 text-[12.5px] text-radar-ink3">
          Nothing has been written for this article yet.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="border-b border-radar-line2 pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <SectionLabel
                  className={entry.checksPassed ? "text-radar-ok" : "text-radar-err"}
                >
                  {entry.checksPassed ? "Passed" : "Refused"}
                </SectionLabel>
                <span className="font-num text-[11px] text-radar-ink3">
                  {shortDate(entry.generatedAt)} · {formatInputMode(entry.inputMode)} ·{" "}
                  {entry.model}
                </span>
              </div>

              {entry.instruction ? (
                <p className="mt-1 mb-0 text-[12px] text-radar-ink3 text-pretty">
                  {`Asked for: "${entry.instruction}"`}
                </p>
              ) : null}

              {entry.checkSummary ? (
                <p className="mt-1 mb-0 text-[12px] text-radar-ink2 text-pretty">
                  {entry.checkSummary}
                </p>
              ) : null}

              {entry.error ? (
                <p className="mt-1 mb-0 text-[12px] text-radar-ink2 text-pretty">
                  {entry.error}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </RadarDisclosure>
  );
}

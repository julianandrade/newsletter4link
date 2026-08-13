"use client";

import {
  radarButtonClass,
  SkeletonBar,
  StatusChip,
} from "@/components/radar/primitives";
import { relativeTime } from "@/lib/radar/source";
import type {
  UnknownSenderGroup,
  UnknownState,
} from "@/components/sources/use-source-collections";

/**
 * The senders nobody claims, as a tab of its own.
 *
 * This was the last block on a page fifty viewports tall, below the email form and the
 * email list, which is the wrong place for the only queue on the screen where mail is being
 * dropped right now. Its count is in the tab row now, so it is visible without scrolling.
 *
 * The tab keeps rendering when the request answers 403. A tab that explains why it is empty
 * beats a tab row that changes shape once the response lands.
 */
export function UnknownSenders({
  groups,
  state,
  message,
  truncated,
  onPromote,
}: {
  groups: UnknownSenderGroup[];
  state: UnknownState;
  message: string | null;
  truncated: boolean;
  onPromote: (group: UnknownSenderGroup) => void;
}) {
  return (
    <div className="space-y-2">
      {state === "loading" && <SkeletonBar width="240px" />}

      {state === "forbidden" && (
        <p className="m-0 rounded-md border border-radar-line bg-radar-surface px-3 py-2 text-[12.5px] text-radar-ink2">
          {message}
        </p>
      )}

      {state === "error" && (
        <p className="m-0 rounded-md bg-radar-surface2 px-3 py-2 text-sm text-radar-err">
          {message}
        </p>
      )}

      {state === "ready" && (
        <>
          <p className="m-0 mb-3 text-[11.5px] text-radar-ink3">
            Senders no active source claims, so their emails would be dropped if the ingest
            ran now. This view is platform-wide: inbound mail arrives at a shared address and
            belongs to no organization until a source claims it.
            {truncated && " Showing a sample, not the whole backlog."}
          </p>

          {groups.length === 0 && (
            <p className="m-0 text-[12.5px] text-radar-ink3">
              Nothing unmatched. Every sender that has arrived has a source.
            </p>
          )}

          {groups.map((group) => (
            <div
              key={group.sender}
              className="flex flex-wrap items-start gap-3 rounded-xl border border-radar-line bg-radar-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-radar-ink">
                    {group.sender}
                  </span>
                  <StatusChip tone={group.alreadyIgnored ? "warn" : "neutral"}>
                    {group.count} {group.count === 1 ? "email" : "emails"}
                  </StatusChip>
                  {group.alreadyIgnored && (
                    <StatusChip tone="warn">already dropped</StatusChip>
                  )}
                  {group.tags.map((tag) => (
                    <StatusChip key={tag} tone="neutral">
                      +{tag}
                    </StatusChip>
                  ))}
                </div>

                {group.subjectSamples.length > 0 && (
                  <ul className="m-0 mt-1 list-none space-y-0.5 p-0">
                    {group.subjectSamples.map((subject, index) => (
                      <li
                        key={`${group.sender}-${index}`}
                        className="truncate text-[11.5px] text-radar-ink3"
                      >
                        {subject}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="m-0 mt-1 text-[11.5px] text-radar-ink3">
                  last {relativeTime(group.lastSeenAt)} · first{" "}
                  {relativeTime(group.firstSeenAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onPromote(group)}
                className={radarButtonClass("accent", "sm")}
              >
                Promote
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

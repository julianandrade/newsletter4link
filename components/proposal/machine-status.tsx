"use client";

/**
 * RQ-005 action 5: the machine says what it is doing.
 *
 * Story 5 exists so nobody ever has to start a collection run in order to find
 * out whether one is needed (AC-5.3). Everything here is read from the proposal
 * payload, which is tenant scoped, so no count shown to one organization
 * includes another's rows (AC-5.5).
 */

import {
  Num,
  RadarButton,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import { Callout, RadarProgress, StatTile } from "@/components/radar/controls";
import { relativeTime } from "@/lib/radar/source";
import { runReasonSentence } from "./copy";
import type { Assembly, PipelineStatus } from "./state";

export function MachineStatus({
  pipeline,
  assembly,
  liveMessage,
  canRun,
  onRun,
  onCancel,
  cancelling,
}: {
  pipeline: PipelineStatus | null;
  assembly: Assembly | null;
  /** Progress text from the live collector stream, when a run is in flight. */
  liveMessage?: string | null;
  /** RQ-005 AC-5.7: starting a run by hand stays available to EDITOR and above. */
  canRun: boolean;
  onRun: () => void;
  onCancel: () => void;
  cancelling?: boolean;
}) {
  if (!pipeline) {
    return (
      <Callout tone="info" title="The collector has not reported yet">
        Pipeline status arrives with the proposal. Reload if this persists.
      </Callout>
    );
  }

  const { lastRun } = pipeline;
  const failed = lastRun?.status === "FAILED";
  const percent =
    pipeline.current !== null && pipeline.total
      ? Math.min(100, Math.round((pipeline.current / pipeline.total) * 100))
      : null;

  return (
    <section
      aria-label="Collection status"
      className="mb-5 rounded-xl border border-radar-line bg-radar-surface px-4 py-4"
    >
      {/*
        The text takes the whole row on a phone, and shares it from `sm` up.

        It was `flex-1` with `min-w-0` against a chip and a button that do not shrink, so
        the browser never needed to wrap: the text column shrank instead, to about sixty
        pixels at 390px, one or two words per line under a full-width button. `basis-full`
        forces the wrap that `flex-wrap` alone could not.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className={dotClass(pipeline.running, failed)}
        />
        <div className="min-w-0 basis-[calc(100%-1.5rem)] sm:flex-1 sm:basis-auto">
          <p className="m-0 text-[13px] font-semibold text-radar-ink">
            {pipeline.running
              ? (liveMessage || "Collecting and scoring now")
              : failed
                ? /* RQ-005 AC-5.6: a failure says so, and says when. */
                  `The last collection failed ${stamp(lastRun?.completedAt ?? lastRun?.startedAt)}`
                : lastRun
                  ? `Collection last ran ${stamp(lastRun.completedAt ?? lastRun.startedAt)} and succeeded`
                  : "Collection has never run here"}
          </p>
          <p className="mt-1 mb-0 text-[12.5px] text-radar-ink2 text-pretty">
            {runReasonSentence(pipeline.runReason)}
          </p>
        </div>

        {pipeline.runNeeded && !pipeline.running && (
          <StatusChip tone="warn">a run is needed</StatusChip>
        )}
        {!pipeline.runNeeded && !pipeline.running && (
          <StatusChip tone="ok">no run needed</StatusChip>
        )}

        {canRun && !pipeline.running && (
          <RadarButton size="sm" onClick={onRun}>
            Run collection
          </RadarButton>
        )}
        {pipeline.running && canRun && (
          <RadarButton
            size="sm"
            onClick={onCancel}
            disabled={cancelling}
            className="hover:border-radar-err hover:text-radar-err"
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </RadarButton>
        )}
      </div>

      {/* RQ-005 AC-5.2: progress, without the person starting anything. */}
      {pipeline.running && percent !== null && (
        <div className="mt-3 flex items-center gap-3">
          <RadarProgress value={percent} className="flex-1" />
          <Num className="text-[12px] text-radar-ink2">
            {pipeline.current} / {pipeline.total}
          </Num>
        </div>
      )}

      {/* RQ-005 AC-5.1: what the run produced. */}
      {lastRun && (
        <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <StatTile label="Found" value={lastRun.totalFound} />
          <StatTile label="Curated" value={lastRun.curated} />
          <StatTile label="Duplicates" value={lastRun.duplicates} />
          <StatTile label="Below threshold" value={lastRun.lowScore} />
          <StatTile
            label="Errors"
            value={lastRun.errorsCount}
            color={lastRun.errorsCount > 0 ? "var(--r-err)" : undefined}
          />
        </div>
      )}

      {/* RQ-005 AC-5.4: the assembly state of this week's proposal. */}
      {assembly && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-radar-line2 pt-3">
          <SectionLabel>This week&rsquo;s proposal</SectionLabel>
          <span className="text-[12.5px] text-radar-ink2">
            {assembly.assembled
              ? `assembled from ${assembly.candidates} ${assembly.candidates === 1 ? "candidate" : "candidates"}`
              : "not assembled yet"}
            {assembly.refreshedAt
              ? `, last topped up ${relativeTime(assembly.refreshedAt)}`
              : ""}
          </span>
          {assembly.thin && <StatusChip tone="warn">thin</StatusChip>}
        </div>
      )}
    </section>
  );
}

function dotClass(running: boolean, failed: boolean): string {
  const base = "h-[7px] w-[7px] shrink-0 rounded-full";
  if (running) return `${base} animate-pulse bg-radar-primary2`;
  if (failed) return `${base} bg-radar-err`;
  return `${base} bg-radar-ok`;
}

function stamp(value: string | null | undefined): string {
  return value ? relativeTime(value) : "at an unrecorded time";
}

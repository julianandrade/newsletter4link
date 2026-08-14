"use client";

/**
 * RQ-006_03: the article detail view.
 *
 * Props in, markup out. It does no fetching, and the only state under it belongs to the
 * two controls that need their own, a disclosure and the instruction box, which is what
 * lets every state of the screen be a fixture in the preview harness and an assertion in a
 * test rather than something to click through.
 *
 * The one invariant: `AttributionBlock` is rendered before the branch, so there is no
 * path through this component that produces prose or summary without the publication
 * name and the source URL. That is the requirement's gate, and it is structural here
 * rather than remembered.
 */

import { useState } from "react";
import Link from "next/link";
import { AttributionBlock } from "@/components/article/attribution-block";
import {
  LinkTakeEvidence,
  RewriteHistoryPanel,
} from "@/components/article/link-take-evidence";
import {
  ExternalLink,
  PageHeading,
  RadarButton,
  RadarMain,
  radarButtonClass,
  Tag,
} from "@/components/radar/primitives";
import {
  Callout,
  RadarDisclosure,
  RadarTextarea,
  type CalloutTone,
} from "@/components/radar/controls";
import { MAX_INSTRUCTION_CHARS } from "@/lib/rewrite/config";
import {
  parseBlocks,
  type BulletBlock,
  type Span,
} from "@/lib/markdown/blocks";
import {
  aiLabelFor,
  resolveLinkTakeState,
  type LinkTakePayload,
  type RewriteHistoryEntry,
} from "@/lib/rewrite/view";

export interface LinkTakeNotice {
  tone: CalloutTone;
  title: string;
  detail?: string;
}

export interface LinkTakeViewProps {
  payload: LinkTakePayload;
  /** EDITOR and above. The server refuses a request from a lower role regardless. */
  canEdit: boolean;
  /** A generation is in flight, so the controls that would start another are disabled. */
  busy?: boolean;
  /** What the last generate attempt had to say, when it had something. */
  notice?: LinkTakeNotice | null;
  onGenerate: () => void;
  /**
   * Regenerate, optionally against one ask for this attempt only.
   *
   * Called with nothing by the plain buttons and with the typed text by the form below.
   * The two are one handler because they differ only in what goes in the body.
   */
  onRegenerate: (instruction?: string) => void;
  onLoadHistory?: () => void;
  history?: RewriteHistoryEntry[] | null;
  historyError?: string | null;
}

function Inline({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.strong) return <strong key={index}>{span.text}</strong>;
        if (span.emphasis) return <em key={index}>{span.text}</em>;
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

/**
 * The parsed body as elements.
 *
 * Blocks, never an HTML string: the body is model output, which is untrusted input, and
 * the reason there is nothing to sanitize here is that nothing is ever interpreted as
 * markup. See the parser in `lib/rewrite/view.ts`.
 */
function Prose({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  const rendered: React.ReactNode[] = [];

  // Consecutive bullets become one list. Anything else flushes it, so a stray bullet
  // between paragraphs does not swallow what follows. Typed to what it actually holds,
  // so the map below needs no narrowing check with an unreachable branch.
  let bullets: BulletBlock[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    rendered.push(
      <ul key={key} className="my-3 ml-5 list-disc text-[14.5px] text-radar-ink2">
        {bullets.map((bullet, index) => (
          <li key={index} className="mt-1.5">
            <Inline spans={bullet.spans} />
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  blocks.forEach((block, index) => {
    if (block.kind === "bullet") {
      bullets.push(block);
      return;
    }

    flushBullets(`bullets-${index}`);

    if (block.kind === "heading") {
      rendered.push(
        <h2
          key={index}
          className="font-editorial mt-7 mb-2 text-[19px] font-medium tracking-[-0.01em] text-radar-ink text-balance"
        >
          {block.text}
        </h2>
      );
      return;
    }

    rendered.push(
      <p
        key={index}
        className="mt-0 mb-3.5 text-[14.5px] leading-[1.62] text-radar-ink2 text-pretty last:mb-0"
      >
        <Inline spans={block.spans} />
      </p>
    );
  });

  flushBullets("bullets-last");

  return <div className="mt-5">{rendered}</div>;
}

/**
 * One ask, for one attempt.
 *
 * Its own component because it is the only stateful thing on this screen, and keeping the
 * state in here is what leaves `LinkTakeView` a function of its props: every state of the
 * screen stays a fixture in the preview harness rather than something to click through.
 *
 * The text is not kept after a submit. It is deliberately not a setting: what is typed
 * here applies to this version, and the standing instructions live in Settings under Brand
 * voice. Clearing it is how the screen says so.
 */
function InstructionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (instruction: string) => void;
}) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  return (
    <form
      className="mt-4 rounded-xl border border-radar-line2 p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || busy) return;
        onSubmit(trimmed);
        setText("");
      }}
    >
      <label
        htmlFor="rewrite-instruction"
        className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2"
      >
        Ask for a different version
      </label>

      <RadarTextarea
        id="rewrite-instruction"
        rows={2}
        maxLength={MAX_INSTRUCTION_CHARS}
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
        placeholder="Shorter, and lead on what it means for a compliance team."
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[11.5px] text-radar-ink3 text-pretty">
          Applies to this piece and this attempt only. For a standing rule, edit Brand
          voice in Settings.
        </p>
        <RadarButton
          type="submit"
          variant="accent"
          size="sm"
          disabled={busy || trimmed.length === 0}
          aria-busy={busy}
        >
          Write it again
        </RadarButton>
      </div>
    </form>
  );
}

export function LinkTakeView({
  payload,
  canEdit,
  busy = false,
  notice = null,
  onGenerate,
  onRegenerate,
  onLoadHistory,
  history,
  historyError,
}: LinkTakeViewProps) {
  const state = resolveLinkTakeState(payload);
  const hasProse = state.kind === "ready" || state.kind === "stale";
  const rewrite = hasProse ? state.rewrite : null;

  /**
   * The control that asks for another attempt, wherever it appears.
   *
   * One definition and one label parameter. It shows up in three places with three
   * labels, and the busy and disabled wiring must be the same in all of them: three
   * copies is three chances for one of them to keep working while the others stop.
   */
  const regenerateControl = (label: string, size: "sm" | "md" = "sm") =>
    canEdit ? (
      <RadarButton
        size={size}
        // Wrapped, not passed: the handler takes an optional instruction, and handing it
        // straight to onClick would call it with the click event as that instruction.
        onClick={() => onRegenerate()}
        disabled={busy}
        aria-busy={busy}
      >
        {label}
      </RadarButton>
    ) : undefined;

  return (
    <RadarMain width="reading">
      <PageHeading
        eyebrow="Article"
        title={rewrite ? rewrite.title : payload.attribution.originalTitle}
        actions={
          <>
            <Link href="/dashboard" className={radarButtonClass("ghost")}>
              Back to the feed
            </Link>
            <ExternalLink
              href={payload.attribution.url}
              className={radarButtonClass()}
            >
              View the original article
            </ExternalLink>
            {/*
              Only in the ready state. When the piece is stale the same control lives in
              the warning instead, next to the reason for pressing it, and having it in
              both places would mean two buttons doing one thing.
            */}
            {state.kind === "ready" ? regenerateControl("Regenerate", "md") : null}
          </>
        }
      />

      {/* Before the branch, deliberately. Rule 5, and this requirement's gate. */}
      <AttributionBlock
        attribution={payload.attribution}
        showOriginalTitle={hasProse}
      />

      {notice ? (
        <Callout tone={notice.tone} title={notice.title} className="mt-4">
          {notice.detail}
        </Callout>
      ) : null}

      {state.kind === "stale" ? (
        <Callout
          tone="warn"
          title="The article changed after this was written"
          className="mt-4"
          actions={regenerateControl("Regenerate")}
        >
          What you are reading was checked against the text it was written from, which
          is no longer the text on file. It is still accurate about that version.
        </Callout>
      ) : null}

      {state.kind === "refused" ? (
        <Callout
          tone="warn"
          title="No Link Take was written for this article"
          className="mt-4"
          actions={regenerateControl("Try again")}
        >
          {/*
            Two paragraphs, not one sentence built by concatenation. The reason is
            written elsewhere and arrives with whatever punctuation it arrives with, so
            appending to it produced "not in the source: 27, 2028 The summary below is"
            on screen.
          */}
          <p className="m-0">{state.reason}</p>
          <p className="mt-1.5 mb-0">
            The summary below is what the feed published.
          </p>
        </Callout>
      ) : null}

      {state.kind === "absent" ? (
        <Callout
          tone="info"
          title="No Link Take has been written yet"
          className="mt-4"
          actions={
            <RadarButton
              variant="accent"
              onClick={onGenerate}
              disabled={busy}
              aria-busy={busy}
            >
              Write the Link Take
            </RadarButton>
          }
        >
          Nothing has been attempted for this article. Writing one costs a model call
          and takes a few seconds.
        </Callout>
      ) : null}

      {rewrite ? (
        <>
          <div className="mt-6">
            <Tag>{aiLabelFor(rewrite.language)}</Tag>
          </div>

          <article>
            <Prose body={rewrite.body} />
          </article>

          <div className="mt-6 border-t border-radar-line2 pt-3.5">
            <LinkTakeEvidence rewrite={rewrite} />
          </div>

          {payload.summary ? (
            <RadarDisclosure
              label="The original summary, as the feed published it"
              className="mt-4"
            >
              <p className="m-0 text-[13px] text-radar-ink2 text-pretty">
                {payload.summary}
              </p>
            </RadarDisclosure>
          ) : null}
        </>
      ) : (
        // No prose, so the summary is the content rather than a secondary view of it,
        // and it is not put behind a disclosure. No AI label either: nothing here was
        // written by a model, and labelling it as though it was would be a lie.
        <div className="mt-6">
          {payload.summary ? (
            <p className="m-0 text-[14.5px] leading-[1.62] text-radar-ink2 text-pretty">
              {payload.summary}
            </p>
          ) : (
            <p className="m-0 text-[13px] text-radar-ink3">
              No summary was generated for this story either. The original article is
              linked above.
            </p>
          )}
        </div>
      )}

      {/*
        Not in the absent state, where the offer is already on screen as one button and a
        first attempt has nothing to be written differently from.
      */}
      {canEdit && state.kind !== "absent" ? (
        <InstructionForm busy={busy} onSubmit={onRegenerate} />
      ) : null}

      {/*
        Not in the absent state: nothing has ever been attempted there, so the panel
        could only ever say so.
      */}
      {canEdit && state.kind !== "absent" ? (
        <RewriteHistoryPanel
          history={history}
          error={historyError}
          onFirstOpen={onLoadHistory}
        />
      ) : null}
    </RadarMain>
  );
}

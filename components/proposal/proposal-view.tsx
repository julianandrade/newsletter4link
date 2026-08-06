"use client";

/**
 * RQ-005 actions 2 and 6: the open edition, and the one decision that sends it.
 *
 * RQ-008: every heading here said "this week", which stopped being true when an
 * organization could hold a special edition alongside the weekly one. The edition names
 * itself through `proposal.label`, which is its title when it has one.
 *
 * Everything an editor needs is on this view: the assembled edition, the
 * controls to change it, the rendered email, and one primary control that
 * approves and sends. No save step, no finalize step, no navigation to a preview
 * (AC-2.1, AC-2.2, AC-6.5).
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
  Num,
  RadarButton,
  ScoreMeter,
  SectionLabel,
  SourceStamp,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import {
  Callout,
  EmptyNote,
  LoadError,
  RadarPanel,
  SkeletonRows,
} from "@/components/radar/controls";
import { AddToProposal } from "./add-to-proposal";
import { sendConfirmation, sentBySentence } from "./copy";
import {
  isEditable,
  type Proposal,
  type ProposalArticle,
  type ProposalProject,
} from "./state";

export interface ProposalViewProps {
  proposal: Proposal;
  recipients: number;
  /** RQ-005 AC-6.8, AC-2.7: a VIEWER sees all of this and none of the controls. */
  canEdit: boolean;
  busy: boolean;
  onMoveArticle: (id: string, direction: -1 | 1) => void;
  onRemoveArticle: (article: ProposalArticle) => void;
  onRejectArticle: (article: ProposalArticle) => void;
  onMoveProject: (id: string, direction: -1 | 1) => void;
  onRemoveProject: (project: ProposalProject) => void;
  onAdd: (
    articles: ProposalArticle[],
    projects: ProposalProject[]
  ) => Promise<void> | void;
  onOpenQueue: () => void;
  previewHtml: string | null;
  previewLoading: boolean;
  previewError: string | null;
  onReloadPreview: () => void;
  onSend: () => Promise<void> | void;
  sending: boolean;
}

export function ProposalView({
  proposal,
  recipients,
  canEdit,
  busy,
  onMoveArticle,
  onRemoveArticle,
  onRejectArticle,
  onMoveProject,
  onRemoveProject,
  onAdd,
  onOpenQueue,
  previewHtml,
  previewLoading,
  previewError,
  onReloadPreview,
  onSend,
  sending,
}: ProposalViewProps) {
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const editable = isEditable(proposal);
  const showControls = canEdit && editable;
  const sent = !editable;

  return (
    <div className="flex flex-col gap-5">
      {/* RQ-005 AC-2.5, AC-6.7: a sent edition says so and offers no controls. */}
      {sent && (
        <Callout tone="ok" title="This edition has been sent">
          {sentBySentence(proposal.approvedByEmail, proposal.approvedAt ?? proposal.sentAt)}{" "}
          Nothing on a sent edition can be changed.
        </Callout>
      )}

      <RadarPanel
        title={`In ${proposal.label}`}
        note={
          proposal.articles.length === 0
            ? "Nothing has been assembled yet."
            : `${proposal.articles.length} ${proposal.articles.length === 1 ? "story" : "stories"}, in the order they will appear.`
        }
        actions={
          showControls ? (
            <RadarButton onClick={() => setPicking(true)} disabled={busy}>
              Add from what is waiting
            </RadarButton>
          ) : undefined
        }
        padded={false}
      >
        {proposal.articles.length === 0 ? (
          <div className="px-4 py-4">
            <EmptyNote>
              This proposal is empty. Nothing failed: either nothing cleared your
              relevance threshold, or every story is still awaiting a decision.
            </EmptyNote>
            <div className="mt-3 flex flex-wrap justify-center gap-2.5">
              <RadarButton onClick={onOpenQueue}>Open the queue</RadarButton>
              {showControls && (
                <RadarButton variant="accent" onClick={() => setPicking(true)}>
                  Add from what is waiting
                </RadarButton>
              )}
            </div>
          </div>
        ) : (
          <ol className="m-0 list-none p-0">
            {proposal.articles.map((article, index) => (
              <li
                key={article.id}
                className="flex flex-col gap-3 border-b border-radar-line2 px-4 py-4 last:border-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <Num className="shrink-0 pt-0.5 text-[12px] text-radar-ink3 sm:w-6">
                  {index + 1}
                </Num>

                <div className="min-w-0 flex-1">
                  <SourceStamp
                    sourceUrl={article.sourceUrl}
                    publishedAt={article.publishedAt}
                    capturedAt={article.capturedAt}
                    href={article.sourceUrl}
                  />
                  <h3 className="font-editorial m-0 text-[16px] font-medium leading-[1.3] text-radar-ink text-pretty">
                    <ArticleTitleLink articleId={article.id} title={article.title} />
                  </h3>
                  {article.summary && (
                    <p className="mt-1.5 mb-0 line-clamp-2 text-[12.5px] text-radar-ink2 text-pretty">
                      {article.summary}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {article.status === "PENDING_REVIEW" && (
                      <StatusChip tone="warn">no verdict yet</StatusChip>
                    )}
                    {article.category.slice(0, 3).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                  <ScoreMeter score={article.relevanceScore} />
                  {showControls && (
                    <RowControls
                      busy={busy}
                      canMoveUp={index > 0}
                      canMoveDown={index < proposal.articles.length - 1}
                      onUp={() => onMoveArticle(article.id, -1)}
                      onDown={() => onMoveArticle(article.id, 1)}
                      onRemove={() => onRemoveArticle(article)}
                      onReject={() => onRejectArticle(article)}
                      label={article.title}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </RadarPanel>

      {/* RQ-005 AC-6.6: projects get the same controls as stories. */}
      <RadarPanel
        title="From inside Link"
        note={
          proposal.projects.length === 0
            ? `No projects in ${proposal.label}.`
            : `${proposal.projects.length} ${proposal.projects.length === 1 ? "project" : "projects"}.`
        }
        padded={false}
      >
        {proposal.projects.length === 0 ? (
          <div className="px-4 py-4">
            <EmptyNote>
              Featured projects can be added from the same picker as stories.
            </EmptyNote>
          </div>
        ) : (
          <ol className="m-0 list-none p-0">
            {proposal.projects.map((project, index) => (
              <li
                key={project.id}
                className="flex flex-col gap-3 border-b border-radar-line2 px-4 py-4 last:border-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <Num className="shrink-0 pt-0.5 text-[12px] text-radar-ink3 sm:w-6">
                  {index + 1}
                </Num>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-radar-ink3">
                    {project.team}
                  </div>
                  <h3 className="font-editorial m-0 text-[16px] font-medium leading-[1.3] text-radar-ink text-pretty">
                    {project.name}
                  </h3>
                  <p className="mt-1.5 mb-0 line-clamp-2 text-[12.5px] text-radar-ink2 text-pretty">
                    {project.impact || project.description}
                  </p>
                </div>
                {showControls && (
                  <RowControls
                    busy={busy}
                    canMoveUp={index > 0}
                    canMoveDown={index < proposal.projects.length - 1}
                    onUp={() => onMoveProject(project.id, -1)}
                    onDown={() => onMoveProject(project.id, 1)}
                    onRemove={() => onRemoveProject(project)}
                    label={project.name}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </RadarPanel>

      {/* RQ-005 AC-2.2: the rendered edition is here, so opening a preview is
          not a step in the flow. Scripts are not allowed to run in the frame. */}
      <RadarPanel
        title="What the recipients will see"
        note="Rendered from this edition, with the template your organization has selected."
        actions={
          <RadarButton
            size="sm"
            onClick={onReloadPreview}
            disabled={previewLoading}
          >
            {previewLoading ? "Rendering…" : "Refresh"}
          </RadarButton>
        }
        padded={false}
      >
        <div className="px-4 py-4">
          {previewError && (
            <LoadError
              what="The rendered edition"
              message={previewError}
              onRetry={onReloadPreview}
            />
          )}
          {previewLoading && !previewError && <SkeletonRows rows={4} />}
          {!previewLoading && !previewError && previewHtml && (
            <iframe
              title="Rendered edition preview"
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              className="h-[560px] w-full rounded-lg border border-radar-line bg-white"
            />
          )}
          {!previewLoading && !previewError && !previewHtml && (
            <EmptyNote>
              Nothing to render yet. Add a story and the preview appears.
            </EmptyNote>
          )}
        </div>
      </RadarPanel>

      {/* RQ-005 AC-2.1: one primary control, and it is the whole decision. */}
      {!sent && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-radar-line bg-radar-surface px-4 py-4">
          <div className="min-w-0 flex-1">
            <SectionLabel>Approve and send</SectionLabel>
            <p className="mt-1 mb-0 text-[12.5px] text-radar-ink2 text-pretty">
              {canEdit
                ? "Approving is what sends it. There is nothing to finalize first, and what is on this screen is what goes out."
                : "Your role can read this proposal. Sending it needs an editor."}
            </p>
          </div>
          <RadarButton
            variant="accent"
            disabled={!canEdit || sending || proposal.articles.length === 0}
            onClick={() => setConfirming(true)}
          >
            {sending ? "Sending…" : "Approve and send"}
          </RadarButton>
        </div>
      )}

      <AddToProposal
        open={picking}
        onOpenChange={setPicking}
        busy={busy}
        onAdd={async (articles, projects) => {
          await onAdd(articles, projects);
          setPicking(false);
        }}
      />

      {/* RQ-005 AC-2.3: one confirmation, with the real numbers in it. */}
      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send {proposal.label}?
            </DialogTitle>
            <DialogDescription>
              {sendConfirmation({
                label: proposal.label,
                articles: proposal.articles.length,
                projects: proposal.projects.length,
                recipients,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton onClick={() => setConfirming(false)} disabled={sending}>
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              disabled={sending}
              onClick={async () => {
                setConfirming(false);
                await onSend();
              }}
            >
              {sending ? "Sending…" : "Approve and send"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Move, remove and reject, in the one order on every row. */
function RowControls({
  busy,
  canMoveUp,
  canMoveDown,
  onUp,
  onDown,
  onRemove,
  onReject,
  label,
}: {
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  onReject?: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <RadarButton
        size="sm"
        variant="ghost"
        onClick={onUp}
        disabled={busy || !canMoveUp}
        title={`Move ${label} up`}
      >
        <span aria-hidden="true">↑</span>
        <span className="sr-only">Move {label} up</span>
      </RadarButton>
      <RadarButton
        size="sm"
        variant="ghost"
        onClick={onDown}
        disabled={busy || !canMoveDown}
        title={`Move ${label} down`}
      >
        <span aria-hidden="true">↓</span>
        <span className="sr-only">Move {label} down</span>
      </RadarButton>
      <RadarButton size="sm" onClick={onRemove} disabled={busy}>
        Remove
      </RadarButton>
      {onReject && (
        <RadarButton
          size="sm"
          onClick={onReject}
          disabled={busy}
          className="hover:border-radar-err hover:text-radar-err"
        >
          Reject
        </RadarButton>
      )}
    </div>
  );
}

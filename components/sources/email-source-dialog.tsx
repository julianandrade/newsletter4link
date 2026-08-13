"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/components/radar/compat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayName } from "@/lib/inbound/address";
import { cn } from "@/lib/utils";
import type { UnknownSenderGroup } from "@/components/sources/use-source-collections";

/**
 * The form for a new email source, in a dialog.
 *
 * It opened inline before, above the list, which meant a Promote click at the bottom of a
 * long panel had to scroll the page to explain itself. The feed form was already a dialog,
 * so one job had two mechanics; this is the surviving one.
 *
 * Six fields, because an email source cannot be inferred from one URL the way a feed can:
 * the sender address is the match key, the tag is the fallback when a sender changes its
 * address, and the cadence is the only thing that makes silence measurable.
 */

export interface NewSourceDraft {
  name: string;
  senderAddress: string;
  inboundTag: string;
  parseMode: "DIGEST" | "ESSAY";
  expectedCadenceDays: string;
  category: string;
}

export const emptyDraft: NewSourceDraft = {
  name: "",
  senderAddress: "",
  inboundTag: "",
  parseMode: "DIGEST",
  expectedCadenceDays: "",
  category: "AI",
};

/**
 * A draft prefilled from a sender the mailbox has actually seen.
 *
 * The From header's display name when there is one, since it is the newsletter's own name.
 * The local part is the fallback, and a poor one: it turns "The Rundown AI" into "News".
 */
export function draftFromSender(group: UnknownSenderGroup): NewSourceDraft {
  const local = group.sender.split("@")[0] ?? group.sender;
  const fromLocal = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  return {
    ...emptyDraft,
    name: displayName(group.displayFrom) ?? fromLocal ?? group.sender,
    senderAddress: group.sender,
    inboundTag: group.tags[0] ?? "",
  };
}

export function EmailSourceDialog({
  draft,
  onDraftChange,
  onClose,
  onCreated,
}: {
  /** Open when this is a draft, closed when it is null. */
  draft: NewSourceDraft | null;
  onDraftChange: (draft: NewSourceDraft) => void;
  onClose: () => void;
  /**
   * Called with the normalised sender after the source exists.
   *
   * Requeueing whatever that sender already had held is the caller's job, because it is a
   * separate request and creating a source without reprocessing has to stay possible.
   */
  onCreated: (sender: string) => Promise<void>;
}) {
  const [isCreating, setIsCreating] = useState(false);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!draft) return;
      setIsCreating(true);

      try {
        const response = await fetch("/api/rss-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "EMAIL",
            name: draft.name,
            senderAddress: draft.senderAddress,
            inboundTag: draft.inboundTag || undefined,
            parseMode: draft.parseMode,
            expectedCadenceDays: draft.expectedCadenceDays || undefined,
            category: draft.category,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          toast.error(
            data?.error ?? `The source could not be created (${response.status})`
          );
          return;
        }

        const sender = draft.senderAddress.trim().toLowerCase();
        toast.success(`${data.name} is now a source for ${sender}`);
        onClose();
        await onCreated(sender);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "The source could not be created"
        );
      } finally {
        setIsCreating(false);
      }
    },
    [draft, onClose, onCreated]
  );

  if (!draft) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New email source</DialogTitle>
          <DialogDescription>
            Mail from this sender becomes articles. Anything arriving from an address no
            active source claims is held instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="es-name">Name</Label>
              <Input
                id="es-name"
                value={draft.name}
                onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
                placeholder="TLDR AI"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="es-sender">Sender address</Label>
              <Input
                id="es-sender"
                type="email"
                value={draft.senderAddress}
                onChange={(e) =>
                  onDraftChange({ ...draft, senderAddress: e.target.value })
                }
                placeholder="news@tldr.tech"
                required
              />
              <p className="m-0 text-[11.5px] text-radar-ink3">
                The address the newsletter sends <em>from</em>. This is the primary match
                key, and it must be exact.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="es-tag">Inbound tag</Label>
              <Input
                id="es-tag"
                value={draft.inboundTag}
                onChange={(e) => onDraftChange({ ...draft, inboundTag: e.target.value })}
                placeholder="tldr"
              />
              <p className="m-0 text-[11.5px] text-radar-ink3">
                Optional. The <code>+tag</code> used when subscribing, and the fallback if
                the sender ever changes its address.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="es-cadence">Expected cadence (days)</Label>
              <Input
                id="es-cadence"
                type="number"
                min={1}
                max={365}
                value={draft.expectedCadenceDays}
                onChange={(e) =>
                  onDraftChange({ ...draft, expectedCadenceDays: e.target.value })
                }
                placeholder="7"
              />
              <p className="m-0 text-[11.5px] text-radar-ink3">
                Optional, but without it silence cannot be judged and no warning will ever
                fire for this source.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="es-category">Category</Label>
              <Input
                id="es-category"
                value={draft.category}
                onChange={(e) => onDraftChange({ ...draft, category: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-radar-ink3">
                Parse mode
              </span>
              <div className="flex gap-2">
                {(
                  [
                    { value: "DIGEST", label: "Digest", hint: "many linked articles" },
                    { value: "ESSAY", label: "Essay", hint: "the email is the article" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onDraftChange({ ...draft, parseMode: option.value })}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
                      draft.parseMode === option.value
                        ? "border-radar-accent bg-radar-surface2"
                        : "border-radar-line hover:border-radar-ink3"
                    )}
                    aria-pressed={draft.parseMode === option.value}
                  >
                    <span className="block text-[12.5px] font-semibold text-radar-ink">
                      {option.label}
                    </span>
                    <span className="block text-[11.5px] text-radar-ink3">
                      {option.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isCreating}>
            {isCreating ? "Creating…" : "Create source"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

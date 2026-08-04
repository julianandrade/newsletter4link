"use client";

/**
 * RQ-005 BR-009: one place that says what happened.
 *
 * Every outcome on the proposal screen goes through here, so the destination and
 * the undo are rendered the same way whether the action was taken on one story or
 * on a selection of them (AC-3.4). The words themselves live in `copy.ts`.
 */

import { toast } from "sonner";
import type { Outcome } from "./copy";

export function announceOutcome(outcome: Outcome, undo?: () => void): void {
  toast.success(outcome.message, {
    description: outcome.description,
    // The destination is the primary action: AC-3.2 wants getting there to be
    // one step from the message that mentions it.
    action: outcome.destination
      ? {
          label: outcome.destination.label,
          onClick: () => window.location.assign(outcome.destination!.href),
        }
      : undefined,
    cancel:
      outcome.undo && undo
        ? { label: outcome.undo.label, onClick: undo }
        : undefined,
  });
}

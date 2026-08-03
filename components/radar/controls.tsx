"use client";

/**
 * The second half of the AI Radar vocabulary: containers, form controls, tables
 * and the states every screen needs. Extracted from the first four converted
 * screens, so the patterns are the ones already shipping rather than new ideas.
 *
 * Composition rules these encode:
 *  - one border weight (radar-line), one radius family, one focus ring
 *  - labels above controls, hints below them, errors spoken not coloured only
 *  - loading is a skeleton, empty is a sentence that teaches
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Num, RadarButton, SectionLabel } from "@/components/radar/primitives";

/* ------------------------------------------------------------------ surfaces */

/**
 * Bordered surface. Replaces shadcn Card. Never nest one inside another: if you
 * want to group inside a panel, use a SectionRule instead.
 */
export function RadarPanel({
  title,
  note,
  actions,
  footer,
  padded = true,
  children,
  className,
}: {
  title?: React.ReactNode;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  padded?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-radar-line bg-radar-surface shadow-radar",
        className
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-radar-line2 px-4 py-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="m-0 text-[13.5px] font-semibold tracking-[-0.005em] text-radar-ink">
                {title}
              </h2>
            ) : null}
            {note ? (
              <p className="mt-0.5 mb-0 text-[12px] text-radar-ink2 text-pretty">
                {note}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      )}

      <div className={padded ? "px-4 py-4" : undefined}>{children}</div>

      {footer ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-radar-line2 px-4 py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/** Horizontal rule with a label, for grouping inside a panel or a column. */
export function SectionRule({
  label,
  note,
  className,
}: {
  label: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3.5 pb-2.5", className)}>
      <SectionLabel>{label}</SectionLabel>
      <div aria-hidden="true" className="h-px flex-1 bg-radar-line2" />
      {note ? (
        <span className="shrink-0 text-[11px] text-radar-ink3">{note}</span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- notices */

export type CalloutTone = "info" | "ok" | "warn" | "err";

const CALLOUT_BORDER: Record<CalloutTone, string> = {
  info: "border-radar-primary2",
  ok: "border-radar-ok",
  warn: "border-radar-warn",
  err: "border-radar-err",
};

const CALLOUT_DOT: Record<CalloutTone, string> = {
  info: "bg-radar-primary2",
  ok: "bg-radar-ok",
  warn: "bg-radar-warn",
  err: "bg-radar-err",
};

/**
 * The one notice shape: a dot for tone, a headline that names the problem, a
 * body that names the recovery, and room for the action that performs it.
 */
export function Callout({
  tone = "info",
  title,
  children,
  actions,
  live,
  className,
}: {
  tone?: CalloutTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** Set for progress and other machine-driven updates. */
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={cn(
        "radar-enter flex items-start gap-3 rounded-xl border bg-radar-surface px-4 py-3.5",
        CALLOUT_BORDER[tone],
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          CALLOUT_DOT[tone]
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-semibold text-radar-ink">{title}</p>
        {children ? (
          <div className="mt-1 text-[12.5px] text-radar-ink2 text-pretty">
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Load failure with a retry, the shape every fetching screen needs. */
export function LoadError({
  what,
  message,
  onRetry,
}: {
  what: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <Callout
      tone="err"
      title={`${what} could not be loaded`}
      actions={
        onRetry ? (
          <RadarButton size="sm" onClick={onRetry}>
            Try again
          </RadarButton>
        ) : undefined
      }
    >
      {message || "The request failed. Retrying usually clears it."}
    </Callout>
  );
}

/* --------------------------------------------------------------------- states */

/**
 * Empty state. The heading is a sentence about this screen, never "No data",
 * and the body says what to do next.
 */
export function EmptyState({
  title,
  children,
  actions,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "radar-enter mx-auto max-w-[560px] py-16 text-center",
        className
      )}
    >
      <h2 className="font-editorial m-0 text-[25px] font-medium tracking-[-0.01em] text-radar-ink text-balance">
        {title}
      </h2>
      {children ? (
        <p className="mt-3 mb-0 text-[13.5px] text-radar-ink2 text-pretty">
          {children}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}

/** Inline emptiness inside a column or panel, where a full state would shout. */
export function EmptyNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "m-0 rounded-xl border border-dashed border-radar-line px-4 py-10 text-center text-[12.5px] text-radar-ink3",
        className
      )}
    >
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------------- forms */

const CONTROL_BASE =
  "w-full rounded-lg border border-radar-line bg-radar-bg text-[13px] text-radar-ink placeholder:text-radar-ink3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent disabled:cursor-not-allowed disabled:opacity-60";

/** Label, control, hint and error in the one order, every time. */
export function RadarField({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-radar-accent">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 mb-0 text-[11.5px] text-radar-err">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 mb-0 text-[11.5px] text-radar-ink3 text-pretty">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const RadarInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function RadarInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(CONTROL_BASE, "h-9 px-3", className)}
      {...props}
    />
  );
});

export const RadarTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function RadarTextarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL_BASE, "resize-y px-3 py-2 leading-[1.5]", className)}
      {...props}
    />
  );
});

/**
 * Native select with the platform arrow replaced by a drawn caret, so it keeps
 * mobile's native picker while matching the other controls.
 */
export const RadarSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function RadarSelect({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          CONTROL_BASE,
          "h-9 appearance-none pr-8 pl-3",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-radar-ink3"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" />
      </svg>
    </div>
  );
});

/** Checkbox with a drawn tick, sized to sit on a 13px line. */
export function RadarCheckbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5 text-[12.5px] text-radar-ink2",
        props.disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <input
        type="checkbox"
        className="h-[15px] w-[15px] shrink-0 cursor-pointer rounded border-radar-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
        style={{ accentColor: "var(--r-accent)" }}
        {...props}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/** Switch for a setting that applies immediately. */
export function RadarToggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block text-[12.5px] font-medium text-radar-ink"
        >
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 mb-0 text-[11.5px] text-radar-ink3 text-pretty">
            {hint}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-[20px] w-[34px] shrink-0 rounded-full border transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
          "disabled:cursor-not-allowed disabled:opacity-55",
          checked
            ? "border-radar-accent bg-radar-accent"
            : "border-radar-line bg-radar-surface2"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            // White knob is the familiar switch; the ring keeps its edge
            // visible against the accent track.
            "absolute top-[2px] h-[14px] w-[14px] rounded-full transition-[left] duration-150",
            checked
              ? "left-[17px] bg-white ring-1 ring-[rgba(14,21,23,0.35)]"
              : "left-[2px] bg-radar-ink3"
          )}
        />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- tables */

export const tableClass = "w-full border-collapse text-left";
export const theadClass =
  "border-b border-radar-line bg-radar-surface2 text-[10px] font-semibold uppercase tracking-[0.09em] text-radar-ink3";
export const thClass = "px-4 py-2.5 font-semibold whitespace-nowrap";
export const trClass =
  "border-b border-radar-line2 transition-colors last:border-0 hover:bg-radar-surface2";
export const tdClass = "px-4 py-3 align-top text-[12.5px] text-radar-ink2";

/** Scroll container, so a wide table never pushes the page sideways. */
export function TableShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-radar-line",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- readouts */

/** Determinate progress. Always paired with a figure by the caller. */
export function RadarProgress({
  value,
  tone = "info",
  className,
}: {
  value: number;
  tone?: "info" | "accent" | "ok";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div
      className={cn(
        "h-[5px] overflow-hidden rounded-full bg-radar-line2",
        className
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          tone === "info" && "bg-radar-primary2",
          tone === "accent" && "bg-radar-accent",
          tone === "ok" && "bg-radar-ok"
        )}
        style={{ width: `${Math.max(clamped, value > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

/** A single figure with its label. Grouped in threes or fours, never alone. */
export function StatTile({
  label,
  value,
  note,
  color,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-radar-line bg-radar-surface px-3.5 py-3",
        className
      )}
    >
      <div className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-radar-ink3">
        {label}
      </div>
      <Num
        className="mt-1 block text-[19px] leading-none text-radar-ink"
        style={color ? { color } : undefined}
      >
        {value}
      </Num>
      {note ? (
        <div className="mt-1.5 text-[11px] text-radar-ink3">{note}</div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- pagination */

export function Pagination({
  page,
  totalPages,
  onPage,
  busy,
  className,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  busy?: boolean;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <RadarButton
        size="sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1 || busy}
      >
        Previous
      </RadarButton>
      <SectionLabel>
        Page {page} of {totalPages}
      </SectionLabel>
      <RadarButton
        size="sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages || busy}
      >
        Next
      </RadarButton>
    </div>
  );
}

/* ------------------------------------------------------------------ skeletons */

/** Rows of placeholder text, shaped like the list they stand in for. */
export function SkeletonRows({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-radar-line", className)} aria-busy="true">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="radar-skeleton flex flex-col gap-2 border-b border-radar-line2 py-4"
        >
          <div
            className="h-[15px] rounded bg-radar-skel"
            style={{ width: `${58 + ((index * 7) % 30)}%` }}
          />
          <div
            className="h-[11px] rounded bg-radar-skel"
            style={{ width: `${34 + ((index * 5) % 24)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

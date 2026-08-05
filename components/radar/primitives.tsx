"use client";

/**
 * The AI Radar component vocabulary. Every control on a converted screen is
 * rebuilt here rather than borrowed from the generic shadcn set, so the
 * editorial surface stays consistent down to the button and the chip.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { sourceIdentity, relativeTime } from "@/lib/radar/source";

/* ---------------------------------------------------------------- typography */

/**
 * Screen locator. Retained deliberately: on these screens the h1 is editorial
 * content ("Today in AI", "Accelerating now"), so this label is the only thing
 * naming where the reader is.
 */
export function Eyebrow({
  children,
  tone = "accent",
  className,
}: {
  children: React.ReactNode;
  tone?: "accent" | "ink" | "muted";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[10.5px] font-semibold uppercase tracking-[0.1em]",
        tone === "accent" && "text-radar-accent",
        tone === "ink" && "text-radar-ink",
        tone === "muted" && "text-radar-ink3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="radar-enter flex flex-wrap items-end justify-between gap-6 pt-11 pb-6">
      <div className="min-w-0">
        <Eyebrow className="mb-2.5">{eyebrow}</Eyebrow>
        <h1 className="font-editorial m-0 text-[clamp(1.75rem,4vw,2.375rem)] font-medium leading-[1.06] tracking-[-0.02em] text-radar-ink text-balance">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2.5 mb-0 max-w-[68ch] text-[13px] text-radar-ink2 text-pretty">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.09em] text-radar-ink3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Num({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={cn("font-num tabular-nums", className)} style={style}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-num rounded border border-radar-line px-1.5 py-px text-[10px] text-radar-ink3">
      {children}
    </kbd>
  );
}

/* -------------------------------------------------------------------- buttons */

export type RadarButtonVariant = "accent" | "solid" | "outline" | "ghost";
export type RadarButtonSize = "sm" | "md";

/**
 * Shared button surface. Exported so links can wear the same skin without
 * nesting an anchor inside a button.
 */
export function radarButtonClass(
  variant: RadarButtonVariant = "outline",
  size: RadarButtonSize = "md",
  className?: string
) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap no-underline transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
    "disabled:cursor-not-allowed disabled:opacity-55",
    size === "md" ? "h-[34px] px-3.5 text-[12.5px]" : "h-7 px-2.5 text-[12px]",
    variant === "accent" &&
      "border-0 bg-radar-accent font-semibold text-radar-on-accent shadow-radar hover:brightness-[1.06]",
    variant === "solid" &&
      "border-0 bg-radar-primary font-semibold text-white hover:brightness-110",
    variant === "outline" &&
      "border border-radar-line bg-radar-surface text-radar-ink hover:border-radar-ink3",
    variant === "ghost" &&
      "border border-transparent bg-transparent text-radar-ink2 hover:border-radar-line hover:text-radar-ink",
    className
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: RadarButtonVariant;
  size?: RadarButtonSize;
};

export function RadarButton({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={radarButtonClass(variant, size, className)}
      {...props}
    />
  );
}

/** Pill-shaped filter trigger. */
export function FilterPill({
  children,
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border bg-radar-surface px-3 text-[12px] transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
        active
          ? "border-radar-accent font-medium text-radar-ink"
          : "border-radar-line text-radar-ink2 hover:border-radar-ink3 hover:text-radar-ink",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ segmented chips */

export interface ChipOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  idBase,
  kind = "tabs",
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  size?: "sm" | "md";
  /**
   * "tabs" switches between rendered views; "options" picks a value in a form.
   * They carry different ARIA, so a schedule picker is never announced as a tab.
   */
  kind?: "tabs" | "options";
  /**
   * Set when the group switches between rendered panels: each tab then points at
   * `${idBase}-panel-<value>`, which the caller puts on the matching panel.
   */
  idBase?: string;
}) {
  const isTabs = kind === "tabs";

  return (
    <div
      role={isTabs ? "tablist" : "radiogroup"}
      aria-label={label}
      className="flex shrink-0 gap-0.5 rounded-lg border border-radar-line bg-radar-surface2 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={isTabs ? "tab" : "radio"}
            aria-selected={isTabs ? active : undefined}
            aria-checked={isTabs ? undefined : active}
            id={idBase ? `${idBase}-tab-${option.value}` : undefined}
            aria-controls={idBase ? `${idBase}-panel-${option.value}` : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-radar-accent",
              size === "md" ? "px-2.5 py-1.5 text-[11.5px]" : "px-2 py-1 text-[11px]",
              active
                ? "bg-radar-surface font-semibold text-radar-ink shadow-radar"
                : "font-medium text-radar-ink3 hover:text-radar-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- metadata */

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-radar-line2 bg-radar-surface2 px-2.5 py-0.5 text-[11px] text-radar-ink2">
      {children}
    </span>
  );
}

/**
 * A link that leaves the application.
 *
 * One place owns `target` and `rel`, because `rel="noopener noreferrer"` is a security
 * attribute (reverse tabnabbing, CLAUDE.md A02) and hand-typing a security attribute in
 * a dozen files is how one of them ends up missing it.
 */
export function ExternalLink({
  href,
  children,
  className,
  title,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn(
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
        className
      )}
    >
      {children}
    </a>
  );
}

/**
 * Source stamp: brand square, publication name, age, optional cluster count.
 *
 * Pass `href` to make the whole stamp the route to the publication it names. Owned here
 * rather than by a wrapper elsewhere, for the same reason `radarButtonClass` is exported:
 * one widget, one name, whether or not it happens to be clickable.
 */
export function SourceStamp({
  sourceUrl,
  publishedAt,
  clusterCount,
  sourceName,
  href,
}: {
  sourceUrl: string;
  /** Web results often carry no date, so the stamp drops the age rather than faking one. */
  publishedAt?: string | null;
  clusterCount?: number;
  sourceName?: string;
  /** When set, the stamp is a link to here, usually the article on the publisher's site. */
  href?: string;
}) {
  const identity = sourceIdentity(sourceUrl);
  const name = sourceName || identity.name;

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <ExternalLink
        href={href}
        title="Open the original article"
        className="inline-flex no-underline"
      >
        {children}
      </ExternalLink>
    ) : (
      <>{children}</>
    );

  return (
    <Wrapper>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded text-[8px] font-bold"
          style={{ background: identity.color, color: identity.onColor }}
        >
          {(name || "?").charAt(0).toUpperCase()}
        </span>
        <span className="text-[11.5px] font-medium text-radar-ink2">{name}</span>
        {publishedAt ? (
          <>
            <span aria-hidden="true" className="text-radar-ink3">
              ·
            </span>
            <time
              dateTime={publishedAt}
              className="text-[11.5px] text-radar-ink3"
              title={new Date(publishedAt).toLocaleString("en-GB")}
            >
              {relativeTime(publishedAt)}
            </time>
          </>
        ) : null}
        {clusterCount && clusterCount > 1 ? (
          <span className="ml-0.5 inline-flex items-center gap-1.5 rounded-full border border-radar-line py-px pr-2 pl-1.5 text-[10.5px] text-radar-ink2">
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-radar-accent"
            />
            covered by {clusterCount} sources
          </span>
        ) : null}
      </div>
    </Wrapper>
  );
}

/**
 * Relevance score as four quartile bars plus the figure. The bars are a
 * redundant encoding of the number beside them, never the only carrier.
 */
export function ScoreMeter({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  if (score === null || score === undefined) {
    return <span className="font-num text-[12px] text-radar-ink3">not scored</span>;
  }

  const filled = Math.max(0, Math.min(4, Math.ceil((score / 10) * 4)));
  const heights = [4, 6, 8, 11];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span aria-hidden="true" className="flex h-[11px] items-end gap-[1.5px]">
        {heights.map((h, i) => (
          <span
            key={h}
            className={cn(
              "w-[3px] rounded-[1px]",
              i < filled ? "bg-radar-accent" : "bg-radar-line"
            )}
            style={{ height: h }}
          />
        ))}
      </span>
      <Num className="text-[12px] font-medium text-radar-ink">
        {score.toFixed(1)}
      </Num>
      <span className="sr-only">relevance score {score.toFixed(1)} of 10</span>
    </div>
  );
}

export function StatusChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "warn" | "err" | "info" | "neutral";
}) {
  return (
    <span
      className={cn(
        "rounded-full border bg-radar-surface px-2.5 py-0.5 text-[11px] font-semibold",
        tone === "ok" && "border-radar-ok text-radar-ok",
        tone === "warn" && "border-radar-warn text-radar-warn",
        tone === "err" && "border-radar-err text-radar-err",
        tone === "info" && "border-radar-primary2 text-radar-primary2",
        tone === "neutral" && "border-radar-line text-radar-ink3"
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- charts */

/**
 * Sparkline over a normalised series. Renders the trend as a shape and always
 * ships alongside the numeric delta, so it carries emphasis, not the only data.
 */
export function Sparkline({
  values,
  color,
  width = 132,
  height = 34,
  showEndpoint = true,
  className,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  showEndpoint?: boolean;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <div
        className={cn("text-[11px] text-radar-ink3", className)}
        style={{ width }}
      >
        not enough history
      </div>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 3;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={cn("overflow-visible", className)}
    >
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showEndpoint ? (
        <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ skeletons */

export function SkeletonBar({
  width,
  height = 11,
  className,
}: {
  width: string | number;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded bg-radar-skel", className)}
      style={{ width, height }}
    />
  );
}

/* -------------------------------------------------------------- page scaffold */

export function RadarMain({
  children,
  width = "820px",
  className,
}: {
  children: React.ReactNode;
  width?: string;
  className?: string;
}) {
  return (
    <main className={cn("flex-1 px-4 pb-24 sm:px-6 lg:px-7", className)}>
      <div className="mx-auto w-full" style={{ maxWidth: width }}>
        {children}
      </div>
    </main>
  );
}

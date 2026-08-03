"use client";

/**
 * Radar-skinned stand-ins for the shadcn primitives, with the same prop shapes.
 *
 * The four largest surfaces (the edition builder, the email editor, the RSS
 * source manager, the media library) carry thousands of lines of markup around
 * logic that must not change while a send is in flight. Swapping their imports
 * to this file moves them onto the AI Radar tokens, radii, type scale and
 * controls without touching that logic. New screens should use
 * `components/radar/primitives.tsx` and `controls.tsx` directly; this bridge
 * exists so the old ones stop looking like a different product, and each screen
 * can be reshaped properly afterwards without a second visual migration.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  radarButtonClass,
  type RadarButtonSize,
  type RadarButtonVariant,
} from "@/components/radar/primitives";

/* ------------------------------------------------------------------- surfaces */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-radar-line bg-radar-surface text-radar-ink shadow-radar",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1 px-4 pt-4 pb-3", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "m-0 text-[13.5px] font-semibold tracking-[-0.005em] text-radar-ink",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("m-0 text-[12px] text-radar-ink2 text-pretty", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-radar-line2 px-4 py-3",
        className
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------- buttons */

type ShadcnVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";
type ShadcnSize = "default" | "sm" | "lg" | "icon";

const VARIANT_MAP: Record<ShadcnVariant, RadarButtonVariant> = {
  default: "accent",
  secondary: "outline",
  outline: "outline",
  ghost: "ghost",
  destructive: "outline",
  link: "ghost",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadcnVariant;
  size?: ShadcnSize;
  /** Renders the single child with the button skin, as radix Slot did. */
  asChild?: boolean;
}

export function Button({
  variant = "default",
  size = "default",
  asChild = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const radarSize: RadarButtonSize = size === "lg" ? "md" : "sm";
  const skin = radarButtonClass(
    VARIANT_MAP[variant],
    size === "default" || size === "lg" ? "md" : radarSize,
    cn(
      size === "icon" && "h-[34px] w-[34px] px-0",
      // Destructive keeps its meaning without importing a second button shape.
      variant === "destructive" && "border-radar-err text-radar-err",
      variant === "link" && "h-auto border-0 px-0 underline",
      className
    )
  );

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: cn(skin, child.props.className),
    });
  }

  return (
    <button type="button" className={skin} {...props}>
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------- badges */

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success"
  | "warning";

const BADGE_TONE: Record<BadgeVariant, string> = {
  default: "border-radar-accent text-radar-ink",
  secondary: "border-radar-line2 bg-radar-surface2 text-radar-ink2",
  outline: "border-radar-line text-radar-ink2",
  destructive: "border-radar-err text-radar-err",
  success: "border-radar-ok text-radar-ok",
  warning: "border-radar-warn text-radar-warn",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border bg-radar-surface px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        BADGE_TONE[variant],
        className
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------------- forms */

const CONTROL =
  "w-full rounded-lg border border-radar-line bg-radar-bg text-[13px] text-radar-ink placeholder:text-radar-ink3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent disabled:cursor-not-allowed disabled:opacity-60";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn(CONTROL, "h-9 px-3", className)} {...props} />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL, "resize-y px-3 py-2 leading-[1.5]", className)}
      {...props}
    />
  );
});

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-[11.5px] font-medium text-radar-ink2",
        className
      )}
      {...props}
    />
  );
}

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked"> & {
    checked?: boolean;
    /** shadcn's Checkbox reported the next value, not an event. */
    onCheckedChange?: (checked: boolean) => void;
  }
>(function Checkbox({ className, checked, onCheckedChange, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn(
        "h-[15px] w-[15px] shrink-0 cursor-pointer rounded border-radar-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent",
        className
      )}
      style={{ accentColor: "var(--r-accent)" }}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------- progress */

export function Progress({
  value = 0,
  className,
}: {
  value?: number | null;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value ?? 0)));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-[5px] w-full overflow-hidden rounded-full bg-radar-line2",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-radar-primary2 transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- alerts */

export function Alert({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "destructive";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-radar-surface px-4 py-3.5",
        variant === "destructive" ? "border-radar-err" : "border-radar-line",
        className
      )}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("m-0 text-[13px] font-semibold text-radar-ink", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-[12.5px] text-radar-ink2 text-pretty", className)}
      {...props}
    />
  );
}

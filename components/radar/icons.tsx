/**
 * Drawn icon set for the AI Radar shell, transcribed from the Claude Design
 * source. One consistent 16px grid, 1.5 stroke, currentColor: no glyph or emoji
 * stands in for an icon anywhere in this layer.
 */

export type RadarIconName =
  | "feed"
  | "trends"
  | "search"
  | "editions"
  | "sources"
  | "analytics"
  | "settings";

const PATHS: Record<RadarIconName, string> = {
  feed: "M2 4h12M2 8h12M2 12h8",
  trends: "M2 12 6 7l3 3 5-7",
  search: "M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0M10.4 10.4 14 14",
  editions: "M3 3h10v10H3zM3 6.5h10",
  sources: "M8 2.5 14 6 8 9.5 2 6zM2 9.5 8 13l6-3.5",
  analytics: "M3 13V8M8 13V4M13 13v-6",
  settings:
    "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14",
};

export function RadarIcon({
  name,
  size = 16,
  className,
}: {
  name: RadarIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Search glyph drawn as separate primitives so the circle stays a true circle. */
export function SearchIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4 14 14" />
    </svg>
  );
}

/** The AI Radar mark: an open ring with an accent pip off-centre. */
export function RadarMark({ size = 22 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-radar-primary"
      style={{ width: size, height: size }}
    >
      <div
        className="rounded-full bg-radar-accent"
        style={{ width: Math.round(size * 0.27), height: Math.round(size * 0.27) }}
      />
    </div>
  );
}

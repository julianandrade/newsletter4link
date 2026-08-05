/**
 * Article records carry only a sourceUrl (there is no source relation on
 * Article), so publication identity is derived from the host. Known publications
 * get their real name and brand colour; anything else gets a stable derived
 * colour so the feed never shows two sources in the same accidental hue.
 */

export interface SourceIdentity {
  name: string;
  initial: string;
  color: string;
  /** Text colour that clears AA on `color`. */
  onColor: string;
  host: string;
}

const KNOWN: Record<string, { name: string; color: string }> = {
  "reuters.com": { name: "Reuters", color: "#1a4b8f" },
  "bloomberg.com": { name: "Bloomberg", color: "#2d4449" },
  "arxiv.org": { name: "arXiv", color: "#b31b1b" },
  "news.ycombinator.com": { name: "Hacker News", color: "#ff6600" },
  "ycombinator.com": { name: "Hacker News", color: "#ff6600" },
  "github.com": { name: "GitHub", color: "#24292e" },
  "githubblog.com": { name: "GitHub Blog", color: "#24292e" },
  "news.sap.com": { name: "SAP News", color: "#0e1517" },
  "sap.com": { name: "SAP", color: "#0e1517" },
  "techcrunch.com": { name: "TechCrunch", color: "#0a7d3e" },
  "theverge.com": { name: "The Verge", color: "#5200ff" },
  "wired.com": { name: "Wired", color: "#1a1a1a" },
  "ft.com": { name: "Financial Times", color: "#8f5c3f" },
  "politico.eu": { name: "Politico EU", color: "#d0021b" },
  "infoq.com": { name: "InfoQ", color: "#25607a" },
  "sifted.eu": { name: "Sifted", color: "#0f4c4c" },
  "theinformation.com": { name: "The Information", color: "#111111" },
  "eur-lex.europa.eu": { name: "EUR-Lex", color: "#003399" },
  "europa.eu": { name: "European Commission", color: "#003399" },
  "anthropic.com": { name: "Anthropic", color: "#3d3929" },
  "openai.com": { name: "OpenAI", color: "#0d0d0d" },
  "reddit.com": { name: "Reddit", color: "#ff4500" },
  "venturebeat.com": { name: "VentureBeat", color: "#c8102e" },
  "zdnet.com": { name: "ZDNET", color: "#c8102e" },
  "handelsblatt.com": { name: "Handelsblatt", color: "#0d3b66" },
  "expresso.pt": { name: "Expresso", color: "#1b365d" },
};

/** Deep, saturated hues only, so white text always clears AA on the chip. */
const FALLBACK_HUES = [
  "#2d4449",
  "#397b94",
  "#6b3fa0",
  "#8f3f2f",
  "#2f6b3f",
  "#7a3f6b",
  "#3f4f8f",
  "#8f6b1f",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function titleCaseHost(host: string): string {
  const core = host.split(".").slice(0, -1).join(".") || host;
  return core
    .split(/[.-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sourceIdentity(sourceUrl: string): SourceIdentity {
  const host = hostOf(sourceUrl);

  if (!host) {
    return {
      name: "Unknown source",
      initial: "?",
      color: "#575757",
      onColor: "#ffffff",
      host: "",
    };
  }

  // Longest-suffix match, so news.sap.com beats sap.com.
  const key = Object.keys(KNOWN)
    .filter((k) => host === k || host.endsWith(`.${k}`))
    .sort((a, b) => b.length - a.length)[0];

  if (key) {
    const hit = KNOWN[key];
    return {
      name: hit.name,
      initial: hit.name.charAt(0).toUpperCase(),
      color: hit.color,
      onColor: "#ffffff",
      host,
    };
  }

  let hash = 0;
  for (let i = 0; i < host.length; i += 1) {
    hash = (hash * 31 + host.charCodeAt(i)) % 100000;
  }
  const name = titleCaseHost(host);

  return {
    name,
    initial: name.charAt(0).toUpperCase(),
    color: FALLBACK_HUES[hash % FALLBACK_HUES.length],
    onColor: "#ffffff",
    host,
  };
}

/** "2h ago" / "yesterday" / "3 Aug" in the feed's own register. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";

  return new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** "Monday, 3 August" — the feed's day divider label. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * "5 Aug 2026" — an absolute date, for the places a relative one is not enough.
 *
 * Here, next to its siblings, rather than as a private helper in whichever component
 * needed it first. That `{ day: "numeric", month: "short", year: "numeric" }` options
 * object is currently written out by hand in eight other files; this is the one place a
 * ninth should not be added, and the one place the other eight can converge on.
 */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Stable YYYY-MM-DD bucket key for day grouping. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

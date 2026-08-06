/**
 * Turns the edition data the send routes already assemble into the shape the
 * AI Radar email template renders.
 *
 * Kept separate from the template so the layout can be tested against fixed
 * data, and the mapping (which story leads, how topics group, what the preheader
 * says) can be tested without parsing HTML.
 */

import { config } from "@/lib/config";
import type { EditionEmail, EmailArticle, EmailSection, EmailTrend } from "./edition-template";
import type { Trend } from "@/lib/trends/compute";

export interface SourceArticle {
  title: string;
  summary?: string | null;
  sourceUrl: string;
  category?: string[];
  relevanceScore?: number | null;
}

export interface SourceProject {
  name: string;
  description: string;
  team?: string;
  impact?: string | null;
  projectDate?: string | Date;
}

export interface EditionInput {
  articles: SourceArticle[];
  projects: SourceProject[];
  week: number;
  year: number;
  /** Computed trends for the radar block; omitted means the block is not rendered. */
  trends?: EmailTrend[];
  /** Retained for callers that pass the whole newsletter payload through. */
  subscriberId?: string;
  /** Absolute base URL. Defaults to config.app.url. */
  appUrl?: string;
  sourceCount?: number;
  dateLabel?: string;
  /**
   * RQ-008: what this edition is called, the title or the derived week label.
   *
   * Supplied by the caller rather than derived here, because this module is reachable
   * from client components through content-renderer and must not import the
   * Prisma-facing helpers. Absent falls back to the week, which is what every caller
   * produced before an edition could be named.
   */
  label?: string;
  /**
   * Pre-built, HMAC-signed unsubscribe URL. Passed in rather than built here:
   * signing needs node crypto, and this module is reachable from client
   * components through content-renderer. Without one, the generic unsubscribe
   * page is linked, which is correct for previews and test sends.
   */
  unsubscribeUrl?: string;
}

/** The order the design lays topics out in, when the data happens to use these names. */
const TOPIC_ORDER = [
  "models",
  "research",
  "agents",
  "tooling",
  "enterprise",
  "market",
  "regulation",
  "policy",
];

const COMPANY_LINE = "Linkroad Group, Av. Duque de Avila 23, 1000-138 Lisboa, Portugal";

/** Publication name from a URL host, since the schema stores no source name here. */
export function publicationName(url: string): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }

  const known: Record<string, string> = {
    "techcrunch.com": "TechCrunch",
    "theverge.com": "The Verge",
    "arstechnica.com": "Ars Technica",
    "wired.com": "Wired",
    "venturebeat.com": "VentureBeat",
    "technologyreview.com": "MIT Technology Review",
    "arxiv.org": "arXiv",
    "anthropic.com": "Anthropic",
    "openai.com": "OpenAI",
    "deepmind.google": "Google DeepMind",
    "blog.google": "Google",
    "microsoft.com": "Microsoft",
    "nvidia.com": "NVIDIA",
    "reuters.com": "Reuters",
    "ft.com": "Financial Times",
    "bloomberg.com": "Bloomberg",
    "nytimes.com": "The New York Times",
    "economist.com": "The Economist",
    "hai.stanford.edu": "Stanford HAI",
  };

  if (known[host]) return known[host];

  // Fall back to the registrable name, capitalised: "simonwillison.net" -> "Simonwillison".
  const parts = host.split(".");
  const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  if (!name) return undefined;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function topicRank(name: string): number {
  const lower = name.toLowerCase();
  const index = TOPIC_ORDER.findIndex((token) => lower.includes(token));
  return index === -1 ? TOPIC_ORDER.length : index;
}

function anchorFor(name: string): string {
  return "topic-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Truncate on a word boundary, so nothing is ever cut mid-word. */
function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** First sentence, so a bullet is a bullet and not a paragraph. */
function firstSentence(text: string, max = 130): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return truncate(match ? match[1] : trimmed, max);
}

function toEmailArticle(article: SourceArticle): EmailArticle {
  return {
    title: article.title,
    summary: (article.summary ?? "").trim(),
    url: article.sourceUrl,
    source: publicationName(article.sourceUrl),
  };
}

/** Maps computed trends to the radar block, keeping only ones that moved. */
export function trendsForEmail(trends: Trend[], limit = 3): EmailTrend[] {
  return trends
    .filter((trend) => trend.delta !== null && trend.delta > 0 && trend.mentions > 1)
    .slice(0, limit)
    .map((trend) => ({
      name: trend.name,
      delta: trend.delta,
      note: trend.drivers.length
        ? `${trend.mentions} mentions across ${trend.drivers.length} sources, led by ${trend.drivers[0].name}.`
        : `${trend.mentions} mentions in the last fortnight.`,
    }));
}

/**
 * True when the label is only the derived week label, so nothing was actually named.
 *
 * This is what keeps a weekly edition's subject line the wording subscribers already
 * recognise, while a named edition gets its name.
 */
function isWeekLabel(
  label: string | undefined,
  week: number,
  year: number
): boolean {
  return !label || label === `Week ${week} · ${year}`;
}

export function buildEditionEmail(input: EditionInput): EditionEmail {
  const appUrl = (input.appUrl ?? config.app.url).replace(/\/$/, "");
  const assets = `${appUrl}/email`;

  const articles = input.articles.filter((article) => article.title?.trim());

  // The lead is the highest-scoring story, falling back to running order when
  // nothing is scored, so a hand-built edition keeps the editor's ordering.
  const sorted = [...articles].sort(
    (a, b) => (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1)
  );
  const lead = sorted[0];
  const rest = articles.filter((article) => article !== lead);

  const grouped = new Map<string, EmailArticle[]>();
  for (const article of rest) {
    const topic = article.category?.find((value) => value?.trim())?.trim() || "This week";
    const list = grouped.get(topic) ?? [];
    list.push(toEmailArticle(article));
    grouped.set(topic, list);
  }

  const sections: EmailSection[] = [...grouped.entries()]
    .map(([name, items]) => ({ name, anchor: anchorFor(name), items }))
    .sort((a, b) => {
      const rank = topicRank(a.name) - topicRank(b.name);
      if (rank !== 0) return rank;
      if (a.items.length !== b.items.length) return b.items.length - a.items.length;
      return a.name.localeCompare(b.name);
    });

  // Headlines, not summaries: the summaries are already on the page a few
  // hundred pixels below, and a TL;DR that repeats them verbatim is not a TL;DR.
  const bullets = [lead, ...rest]
    .filter((article): article is SourceArticle => Boolean(article))
    .slice(0, 3)
    .map((article) => ({
      text: truncate(article.title, 110),
      anchor: article.sourceUrl,
    }))
    .filter((bullet) => bullet.text.length > 0);

  const project = input.projects.find((candidate) => candidate.name?.trim());

  const topStory = lead ? toEmailArticle(lead) : undefined;

  const previewText = lead
    ? firstSentence(lead.summary?.trim() || lead.title, 110)
    : `AI Radar, week ${input.week} of ${input.year}.`;

  return {
    editionLabel: input.label ?? `Week ${input.week}`,
    dateLabel: input.dateLabel ?? String(input.year),
    previewText,
    subject: isWeekLabel(input.label, input.week, input.year)
      ? `AI Radar Weekly - Week ${input.week}, ${input.year}`
      : `AI Radar - ${input.label}`,
    bullets,
    // A thin week says so, rather than letting the reader wonder whether the
    // pipeline broke. The design calls for this caption on light editions.
    bulletsNote:
      articles.length > 0 && articles.length < 4
        ? "A quieter week: we held back thin items rather than pad the brief."
        : undefined,
    topStory,
    sections,
    trends: input.trends ?? [],
    internal: project
      ? {
          title: project.name,
          body: [project.description, project.impact].filter(Boolean).join(" ").trim(),
          url: `${appUrl}/dashboard/projects`,
        }
      : undefined,
    portalUrl: `${appUrl}/dashboard`,
    unsubscribeUrl: input.unsubscribeUrl ?? `${appUrl}/unsubscribe`,
    logoOnLight: `${assets}/linkroad-h-on-light.png`,
    logoOnDark: `${assets}/linkroad-h-on-dark.png`,
    footerLogoOnLight: `${assets}/linkroad-v-on-light.png`,
    footerLogoOnDark: `${assets}/linkroad-v-on-dark.png`,
    sourceCount: input.sourceCount,
    companyLine: COMPANY_LINE,
  };
}

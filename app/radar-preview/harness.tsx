"use client";

/**
 * Verification harness. Renders the real dashboard screens behind a fetch stub
 * so the shipped markup can be inspected without a Supabase session.
 *
 * Reachable only in development: page.tsx returns a 404 otherwise. It used to be
 * a plain route, which meant it answered 200 to anyone in production and served
 * the whole dashboard shell with fixture data. The fixtures are invented, so
 * nothing leaked, but the screen inventory and the UI structure were public.
 */

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import FeedPage from "@/app/dashboard/page";
import TrendsPage from "@/app/dashboard/trends/page";
import EditionsPage from "@/app/dashboard/send/page";
import SearchPage from "@/app/dashboard/search/page";
import ProjectsPage from "@/app/dashboard/projects/page";
import CurationPage from "@/app/dashboard/curation/page";
import SubscribersPage from "@/app/dashboard/subscribers/page";
import TemplatesPage from "@/app/dashboard/templates/page";
import AnalyticsPage from "@/app/dashboard/analytics/page";
import GeneratePage from "@/app/dashboard/generate/page";
import SettingsPage from "@/app/dashboard/settings/page";
import BuilderPage from "@/app/dashboard/send/[id]/page";
import SourcesPage from "@/app/dashboard/sources/page";
import type { User } from "@supabase/supabase-js";

const DAY = 86400000;
const iso = (daysAgo: number, hour = 9) =>
  new Date(Date.now() - daysAgo * DAY - hour * 3600000).toISOString();

const ARTICLES = [
  {
    id: "a1",
    title:
      "EU AI Act high-risk obligations bite for banks as first conformity audits begin",
    sourceUrl: "https://www.reuters.com/technology/ai-act-banks",
    publishedAt: iso(0, 2),
    relevanceScore: 9.1,
    summary:
      "Credit-scoring and fraud models now need documented conformity assessments; supervisors in three member states have opened the first reviews. Vendors with unclear model provenance are the exposure.",
    category: ["Regulation", "Financial services", "Compliance"],
    status: "PENDING_REVIEW",
  },
  {
    id: "a2",
    title:
      "Retrieval-free long-context agents match RAG pipelines at a sixth of the serving cost",
    sourceUrl: "https://arxiv.org/abs/2608.01234",
    publishedAt: iso(0, 3),
    relevanceScore: 8.4,
    summary:
      "Benchmarked on 1.2M-token enterprise corpora with deterministic caching. If it holds outside the benchmark, a lot of RAG plumbing in current proposals becomes optional.",
    category: ["Agents", "RAG", "Cost"],
    status: "PENDING_REVIEW",
  },
  {
    id: "a3",
    title:
      "SAP folds agent orchestration into the S/4HANA cloud tier at no extra list price",
    sourceUrl: "https://news.sap.com/2026/08/agent-orchestration",
    publishedAt: iso(0, 6),
    relevanceScore: 8.0,
    summary:
      "Bundling pressures standalone orchestration vendors and changes the build-versus-configure conversation on every S/4 modernisation deal we are in.",
    category: ["ERP", "Vendor moves"],
    status: "PENDING_REVIEW",
  },
  {
    id: "a4",
    title:
      "The MCP server registry passes 10,000 entries, and hits its first supply-chain scare",
    sourceUrl: "https://news.ycombinator.com/item?id=99887766",
    publishedAt: iso(0, 8),
    relevanceScore: 7.4,
    summary:
      "A typosquatted connector shipped for nine days before removal. Expect client procurement to start asking who signs your tool manifests.",
    category: ["MCP", "Security"],
    status: "PENDING_REVIEW",
  },
  {
    id: "a5",
    title:
      "Iberian banks pilot AI underwriting under fresh DORA operational-resilience scrutiny",
    sourceUrl: "https://www.bloomberg.com/news/iberia-ai-underwriting",
    publishedAt: iso(1, 4),
    relevanceScore: 8.7,
    summary:
      "Two of the pilots use third-party model APIs, which puts exit plans and concentration risk back on the table for regulators.",
    category: ["Regulation", "Financial services", "Iberia"],
    status: "PENDING_REVIEW",
  },
  {
    id: "a6",
    title:
      "Deterministic replay lands in the main agent frameworks within a fortnight of each other",
    sourceUrl: "https://github.com/trending",
    publishedAt: iso(1, 7),
    relevanceScore: 7.6,
    summary:
      "Replayable traces are quietly becoming the thing enterprise architecture boards ask for first. Worth a slide in the agent governance deck.",
    category: ["Agents", "Tooling"],
    status: "PENDING_REVIEW",
  },
  {
    id: "a7",
    title: "Enterprise MCP gateways compared across seven deployments",
    sourceUrl: "https://www.infoq.com/articles/mcp-gateways",
    publishedAt: iso(2, 5),
    relevanceScore: 7.1,
    summary:
      "The pattern that survived production was narrow: one gateway per business domain, with deterministic fallbacks into the existing service layer.",
    category: ["MCP", "Tooling"],
    status: "PENDING_REVIEW",
  },
];

const APPROVED = [
  {
    ...ARTICLES[0],
    id: "ap1",
    status: "APPROVED",
    editionCount: 1,
  },
  {
    ...ARTICLES[4],
    id: "ap2",
    status: "APPROVED",
    editionCount: 1,
  },
  {
    ...ARTICLES[1],
    id: "ap3",
    status: "APPROVED",
    editionCount: 0,
  },
  {
    ...ARTICLES[5],
    id: "ap4",
    status: "APPROVED",
    editionCount: 0,
  },
];

const PROJECTS = [
  {
    id: "p1",
    name: "Claims triage agents in production for a European insurer",
    description:
      "Multi-agent first-notice-of-loss triage with human escalation on every declined case.",
    team: "Insurance",
    impact: "Cycle time down 41% on first-notice-of-loss. Reference approved.",
    featured: true,
    projectDate: iso(45),
    createdAt: iso(50),
  },
  {
    id: "p2",
    name: "Records copilot passes accessibility and DPIA review",
    description:
      "On-prem 8B model over 4M archived records; passed DPIA and accessibility review.",
    team: "Public sector",
    impact: "No data leaves the tenancy.",
    featured: true,
    projectDate: iso(120),
    createdAt: iso(130),
  },
  {
    id: "p3",
    name: "AI Radar now curates for four practices",
    description: "The platform you are looking at.",
    team: "Internal",
    impact: "1,412 items scored per day, 62 sources, 9 reviewers.",
    featured: true,
    projectDate: iso(14),
    createdAt: iso(20),
  },
];

const NAMED_SOURCES = [
  {
    id: "s1",
    url: "https://s1.example.com/rss",
    createdAt: iso(90),
    updatedAt: iso(1),
    name: "Reuters Technology",
    category: "News wire",
    active: true,
    lastFetchedAt: iso(0, 0.1),
    lastError: null,
  },
  {
    id: "s2",
    url: "https://s2.example.com/rss",
    createdAt: iso(90),
    updatedAt: iso(1),
    name: "arXiv cs.AI",
    category: "Research",
    active: true,
    lastFetchedAt: iso(0, 0.2),
    lastError: null,
  },
  {
    id: "s3",
    url: "https://s3.example.com/rss",
    createdAt: iso(90),
    updatedAt: iso(1),
    name: "The Information",
    category: "Paywalled",
    active: true,
    lastFetchedAt: iso(0, 5),
    lastError: "401 · credentials expired",
  },
  {
    id: "s4",
    url: "https://s4.example.com/rss",
    createdAt: iso(90),
    updatedAt: iso(1),
    name: "EU AI Newsroom",
    category: "Regulator",
    active: true,
    lastFetchedAt: iso(0, 5),
    lastError: "404 · feed moved",
  },
];

/**
 * The real account has 434 feeds. The bulk selection work is only meaningful at
 * that volume, so the handful of named fixtures above are padded out to it.
 */
const SOURCE_CATEGORIES = [
  "News wire",
  "Research",
  "Paywalled",
  "Vendor blog",
  "Security",
  "Community",
];

const SOURCES = [
  ...NAMED_SOURCES,
  ...Array.from({ length: 434 - NAMED_SOURCES.length }, (_, index) => {
    const n = index + 1;
    return {
      id: `sx${n}`,
      name: `Feed ${String(n).padStart(3, "0")}`,
      url: `https://feed-${n}.example.com/rss`,
      category: SOURCE_CATEGORIES[n % SOURCE_CATEGORIES.length],
      active: n % 3 !== 0,
      lastFetchedAt: n % 7 === 0 ? null : iso(0, (n % 20) / 10),
      lastError: n % 29 === 0 ? "404 Not Found" : null,
      createdAt: iso(60),
      updatedAt: iso(1),
    };
  }),
];


const EDITIONS = [
  {
    id: "e1",
    week: 32,
    year: 2026,
    status: "DRAFT",
    finalizedAt: null,
    sentAt: null,
    createdAt: iso(3),
    updatedAt: iso(0),
    articleCount: 6,
    projectCount: 2,
    sharePointUrl: null,
    sharePointPublishedAt: null,
    sharePointError: null,
    archivedAt: null,
    approvedAt: null,
    approvedByEmail: null,
  },
  {
    id: "e2",
    week: 31,
    year: 2026,
    status: "SENT",
    finalizedAt: iso(8),
    sentAt: iso(7),
    createdAt: iso(10),
    updatedAt: iso(7),
    articleCount: 7,
    projectCount: 1,
    sharePointUrl: "https://example.sharepoint.com/week31",
    sharePointPublishedAt: iso(7),
    sharePointError: null,
    archivedAt: null,
    approvedAt: null,
    approvedByEmail: null,
  },
  {
    id: "e3",
    week: 30,
    year: 2026,
    status: "SENT",
    finalizedAt: iso(15),
    sentAt: iso(14),
    createdAt: iso(17),
    updatedAt: iso(14),
    articleCount: 6,
    projectCount: 2,
    sharePointUrl: null,
    sharePointPublishedAt: null,
    sharePointError: "Graph API token expired",
  },
  // RQ-005: a send with its approval on the record, which is what BR-011 added.
  {
    id: "e-approved",
    week: 30,
    year: 2026,
    status: "SENT",
    finalizedAt: iso(15),
    sentAt: iso(14),
    createdAt: iso(17),
    updatedAt: iso(14),
    articleCount: 9,
    projectCount: 2,
    sharePointUrl: null,
    sharePointPublishedAt: null,
    sharePointError: null,
    archivedAt: null,
    approvedAt: iso(14),
    approvedByEmail: "julian.andrade@linkconsulting.com",
  },
  // RQ-005 AC-8.3: put away. Only visible under the Archived or All filter, and
  // Unarchive is the action the bar should offer for it.
  {
    id: "e-archived",
    week: 29,
    year: 2026,
    status: "SENT",
    finalizedAt: iso(22),
    sentAt: iso(21),
    createdAt: iso(24),
    updatedAt: iso(20),
    articleCount: 8,
    projectCount: 1,
    sharePointUrl: null,
    sharePointPublishedAt: null,
    sharePointError: null,
    archivedAt: iso(20),
    approvedAt: iso(21),
    approvedByEmail: "someone.else@linkconsulting.com",
  },
];

function buildTrends() {
  const topics = [
    { name: "MCP", base: [2, 3, 3, 4, 5, 6, 8, 11, 14, 19, 24, 31] },
    { name: "Regulation", base: [8, 9, 11, 10, 12, 14, 15, 18, 20, 23, 26, 29] },
    { name: "Agents", base: [6, 7, 7, 9, 10, 11, 13, 14, 16, 18, 20, 22] },
    { name: "Security", base: [4, 4, 5, 5, 6, 6, 7, 8, 9, 11, 12, 14] },
    { name: "Financial services", base: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 11, 12] },
    { name: "Vendor moves", base: [9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4] },
    { name: "RAG", base: [12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5] },
    { name: "Cost", base: [3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7] },
    { name: "ERP", base: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6] },
    { name: "Tooling", base: [7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 11] },
  ];

  const hosts = [
    "reuters.com",
    "arxiv.org",
    "github.com",
    "news.ycombinator.com",
    "bloomberg.com",
  ];

  return topics.map((topic, index) => {
    const recent = topic.base.slice(-2).reduce((a, b) => a + b, 0);
    const previous = topic.base.slice(-4, -2).reduce((a, b) => a + b, 0);
    return {
      key: topic.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: topic.name,
      series: topic.base,
      delta:
        previous > 0 ? Math.round(((recent - previous) / previous) * 100) : null,
      mentions: topic.base.reduce((a, b) => a + b, 0),
      spanDays: 88 - index * 3,
      drivers: hosts.slice(0, 4).map((host, i) => ({
        name: host,
        pct: 62 - i * 13 - index,
      })),
      articles: ARTICLES.slice(0, 4).map((a) => ({
        id: `${topic.name}-${a.id}`,
        title: a.title,
        sourceUrl: a.sourceUrl,
        publishedAt: a.publishedAt,
        relevanceScore: a.relevanceScore,
      })),
    };
  });
}

/* ---------------------------------------------------------------- search fixtures */

const SEARCH_RESULTS = [
  {
    url: "https://www.reuters.com/technology/eu-ai-act-banks-conformity",
    title:
      "Supervisors open the first EU AI Act conformity reviews at three European banks",
    snippet:
      "Credit scoring and fraud detection models are the first in scope for documented conformity assessments.",
    publishedAt: iso(1, 4),
    source: "reuters.com",
    aiScore: 9.2,
    aiSummary:
      "Three national supervisors have started conformity reviews of credit-scoring models. Banks with undocumented model provenance are the exposed group, and remediation timelines are being set case by case.",
    aiTopics: ["Regulation", "Financial services", "Compliance"],
    aiSentiment: "neutral",
    aiRelevanceNote:
      "Directly on your compliance and financial-services beat, and specific enough to cite in a client conversation.",
  },
  {
    url: "https://www.ft.com/content/agentic-banking-pilots",
    title: "Agentic workflows move from pilot to production in European retail banking",
    snippet:
      "Four of the ten largest retail banks now run agent orchestration in customer operations.",
    publishedAt: iso(3, 9),
    source: "ft.com",
    aiScore: 8.4,
    aiSummary:
      "Adoption has crossed from proof of concept into production for customer operations, with human review retained on any action that moves money. Vendor selection is consolidating around two orchestration stacks.",
    aiTopics: ["Agents", "Banking", "Adoption"],
    aiSentiment: "positive",
    aiRelevanceNote:
      "Matches the agentic-AI-in-banking thread and gives you named adopters rather than survey percentages.",
  },
  {
    url: "https://arxiv.org/abs/2608.04417",
    title:
      "Long-context agents match retrieval pipelines at a fraction of serving cost",
    snippet:
      "Benchmarked across 1.2M-token enterprise corpora with deterministic caching.",
    publishedAt: iso(6, 2),
    source: "arxiv.org",
    aiScore: 7.6,
    aiSummary:
      "A benchmark suggesting a lot of retrieval plumbing is optional once caching is deterministic. Holds on the published corpora; generalisation beyond them is untested.",
    aiTopics: ["RAG", "Cost", "Architecture"],
    aiSentiment: "neutral",
    aiRelevanceNote:
      "Useful for architecture decisions, though a single benchmark is thin ground for a recommendation.",
  },
  {
    url: "https://www.politico.eu/article/ai-liability-directive-revival",
    title: "AI Liability Directive returns to the Council agenda after two quiet years",
    snippet:
      "Member states are split on whether the directive survives the simplification agenda.",
    // Deliberately undated: plenty of web results carry no publication date.
    source: "politico.eu",
    aiScore: 6.8,
    aiSummary:
      "The directive is back on the agenda with member states divided. Nothing is settled, but a revival would change the liability picture for deployers rather than only providers.",
    aiTopics: ["Regulation", "Policy"],
    aiSentiment: "neutral",
    aiRelevanceNote:
      "Relevant but early: worth watching rather than briefing clients on this week.",
  },
  {
    url: "https://venturebeat.com/ai/orchestration-vendor-consolidation",
    title: "Two more agent orchestration vendors fold into platform suites",
    snippet: "Standalone orchestration is being bundled away at list price.",
    publishedAt: iso(9, 7),
    source: "venturebeat.com",
    aiScore: 5.9,
    aiSummary:
      "Consolidation continues, which pressures build-versus-configure conversations on modernisation deals. Light on detail about the terms.",
    aiTopics: ["Vendor moves"],
    aiSentiment: "negative",
    aiRelevanceNote:
      "Directionally useful, but the piece is closer to a press release than reporting.",
  },
];

const SEARCH_TOPICS = [
  {
    id: "t1",
    name: "DORA enforcement",
    query: "DORA regulation enforcement European banks 2026",
    schedule: "WEEKLY",
    timeRange: "month",
    isActive: true,
    lastRunAt: iso(2, 5),
    resultCount: 12,
  },
  {
    id: "t2",
    name: "Agentic AI in banking",
    query: "agentic AI production deployments retail banking",
    schedule: "DAILY",
    timeRange: "week",
    isActive: true,
    lastRunAt: iso(0, 6),
    resultCount: 8,
  },
  {
    id: "t3",
    name: "SAP modernisation moves",
    query: "SAP S/4HANA cloud AI orchestration announcements",
    schedule: "MANUAL",
    timeRange: "month",
    isActive: true,
    resultCount: 0,
  },
];

const SEARCH_HISTORY = [
  {
    id: "h1",
    query: "agentic AI in banking, last 6 months",
    queryExpanded: "agentic AI production banking Europe 2026 deployments",
    queryAnalysis: {
      intent: "recent developments",
      timeScope: "last 6 months",
      topics: ["Agents", "Banking", "Adoption"],
    },
    resultCount: 15,
    searchedAt: iso(0, 3),
    convertedToTopicId: "t2",
  },
  {
    id: "h2",
    query: "EU AI Act enforcement actions",
    queryExpanded: "EU AI Act enforcement supervisors conformity assessment 2026",
    queryAnalysis: {
      intent: "regulatory tracking",
      timeScope: "last 3 months",
      topics: ["Regulation", "Compliance"],
    },
    resultCount: 11,
    searchedAt: iso(4, 8),
    convertedToTopicId: null,
  },
  {
    id: "h3",
    query: "RAG versus long context, serving cost",
    resultCount: 9,
    searchedAt: iso(11, 10),
    convertedToTopicId: null,
  },
];

/* ------------------------------------------------- fixtures for the rest of the app */

const TEAMS = ["Data Science", "Innovation Lab", "Productivity Tools"];

const CURATION_JOBS = [
  {
    id: "job-1",
    status: "COMPLETED",
    totalFound: 148,
    processed: 148,
    duplicates: 31,
    lowScore: 92,
    curated: 25,
    errorsCount: 0,
    startedAt: iso(0, 3),
    completedAt: iso(0, 2),
    durationMs: 96_000,
  },
  {
    id: "job-2",
    status: "FAILED",
    totalFound: 12,
    processed: 4,
    duplicates: 0,
    lowScore: 2,
    curated: 2,
    errorsCount: 3,
    startedAt: iso(1, 4),
    completedAt: iso(1, 4),
    durationMs: 8_400,
  },
  {
    id: "job-3",
    status: "COMPLETED",
    totalFound: 132,
    processed: 132,
    duplicates: 26,
    lowScore: 84,
    curated: 22,
    errorsCount: 1,
    startedAt: iso(7, 3),
    completedAt: iso(7, 2),
    durationMs: 88_000,
  },
];

const SUBSCRIBERS = [
  {
    id: "s1",
    email: "ana.ribeiro@linkconsulting.com",
    name: "Ana Ribeiro",
    active: true,
    preferredLanguage: "pt-pt",
    preferredStyle: "executive",
    createdAt: iso(120),
  },
  {
    id: "s2",
    email: "joao.silva@linkconsulting.com",
    name: "João Silva",
    active: true,
    preferredLanguage: "en",
    preferredStyle: "technical",
    createdAt: iso(96),
  },
  {
    id: "s3",
    email: "marta.costa@linkconsulting.com",
    active: true,
    preferredLanguage: "en",
    preferredStyle: "comprehensive",
    createdAt: iso(40),
  },
  {
    id: "s4",
    email: "left.company@linkconsulting.com",
    name: "Former Colleague",
    active: false,
    preferredLanguage: "en",
    preferredStyle: "executive",
    createdAt: iso(320),
  },
];

const TEMPLATES = [
  {
    id: "builtin-ai-radar",
    name: "AI Radar Weekly",
    description:
      "The built-in edition. Editorial layout with the Linkroad masthead, a TL;DR block, topic sections, the trend radar and one accent call to action. Adapts to the content: sections with nothing in them do not render.",
    builtIn: true,
    // A stored template holds both flags in this fixture, so the built-in holds
    // neither. Flip t-weekly's flags to see the other state.
    isActive: false,
    isDefault: false,
    createdAt: iso(0),
    updatedAt: iso(0),
  },
  {
    id: "t-weekly",
    name: "Weekly brief",
    description: "The standard frame: masthead, stories, projects, sign-off.",
    isActive: true,
    isDefault: true,
    createdAt: iso(200),
    updatedAt: iso(9),
  },
  {
    id: "t-quarterly",
    name: "Quarterly review",
    description: "Wider layout for the longer end-of-quarter edition.",
    isActive: false,
    isDefault: false,
    createdAt: iso(150),
    updatedAt: iso(60),
  },
];

const ANALYTICS = {
  editions: [
    { id: "e1", week: 31, year: 2026, sentAt: iso(2) },
    { id: "e2", week: 30, year: 2026, sentAt: iso(9) },
  ],
  metrics: {
    sent: 412,
    delivered: 406,
    opened: 231,
    clicked: 88,
    bounced: 6,
    unsubscribed: 2,
    openRate: 56.9,
    clickRate: 21.7,
    bounceRate: 1.5,
    deliveryRate: 98.5,
    unsubscribeRate: 0.5,
  },
  topLinks: [
    {
      url: "https://www.reuters.com/technology/eu-ai-act-banks",
      clicks: 44,
      title: "Supervisors open the first EU AI Act conformity reviews",
      category: ["Regulation", "Financial services"],
      isArticle: true,
    },
    {
      url: "https://www.ft.com/content/agentic-banking-pilots",
      clicks: 29,
      title: "Agentic workflows move from pilot to production",
      category: ["Agents", "Banking"],
      isArticle: true,
    },
    {
      url: "https://linkconsulting.com/projects/claims-triage",
      clicks: 12,
      title: "Claims triage assistant",
      category: [],
      isArticle: false,
    },
  ],
  timeline: Array.from({ length: 14 }, (_, i) => ({
    date: iso(13 - i, 12),
    opens: [4, 9, 31, 58, 42, 26, 18, 12, 9, 22, 44, 61, 38, 21][i],
    clicks: [1, 3, 12, 24, 17, 9, 6, 4, 3, 8, 17, 26, 14, 7][i],
  })),
  segmentation: {
    byLanguage: [
      { language: "en", label: "English", count: 214, openRate: 58.1 },
      { language: "pt-pt", label: "Portuguese (PT)", count: 158, openRate: 61.4 },
      { language: "es", label: "Spanish", count: 40, openRate: 44.2 },
    ],
    byStyle: [
      { style: "executive", label: "Executive", count: 186, openRate: 63.2 },
      { style: "comprehensive", label: "Comprehensive", count: 152, openRate: 52.7 },
      { style: "technical", label: "Technical", count: 74, openRate: 49.8 },
    ],
  },
  engagementHealth: {
    active: { count: 268, percentage: 65.2 },
    dormant: { count: 84, percentage: 20.4 },
    atRisk: { count: 31, percentage: 7.5 },
    new: { count: 29, percentage: 7.0 },
  },
};

const SETTINGS = {
  relevanceThreshold: 6.5,
  maxArticlesPerEdition: 10,
  vectorSimilarityThreshold: 0.85,
  articleMaxAgeDays: 7,
  aiModel: "claude-sonnet-4-20250514",
  embeddingModel: "text-embedding-ada-002",
  brandVoicePrompt:
    "We advise financial-sector clients on digital transformation. Professional but plain. Concrete results over announcements.",
};

const USAGE = {
  plan: { name: "Enterprise", value: "ENTERPRISE", monthlyPrice: null },
  usage: {
    subscribers: {
      current: 412,
      limit: null,
      percentage: 0,
      isNearLimit: false,
      isAtLimit: false,
    },
    articles: { total: 1412, thisMonth: 96 },
    editions: { total: 31, sentThisMonth: 4 },
    rssSources: 7,
    searchTopics: 3,
  },
  features: {},
};

const API_KEYS = [
  {
    id: "k1",
    name: "Intranet sync",
    keyPrefix: "nl4l_7Fq2",
    lastUsedAt: iso(0, 5),
    expiresAt: null,
    createdAt: iso(64),
  },
];

const GENERATION_DRAFTS = [
  {
    id: "d1",
    status: "DRAFT",
    generatedAt: iso(0, 4),
    approvedAt: null,
    brandVoiceId: "bv1",
    content: {
      opening:
        "Three supervisors opened the first EU AI Act conformity reviews this week, and the models under the microscope are the ones every bank runs: credit scoring and fraud detection.",
      closing:
        "That is the week. If a client asks about conformity evidence before Friday, the Reuters piece is the one to send.",
      subjectLines: [
        "The AI Act stops being theoretical",
        "First conformity reviews land at three banks",
        "What the EU AI Act reviews mean for your credit models",
      ],
      sections: [
        {
          name: "Regulation",
          transition: "Start where the deadlines are real.",
          articles: [
            {
              id: "a1",
              title:
                "EU AI Act high-risk obligations bite for banks as first conformity audits begin",
              summary:
                "Credit-scoring and fraud models now need documented conformity assessments. Vendors with unclear model provenance are the exposure.",
              sourceUrl: "https://www.reuters.com/technology/ai-act-banks",
              isHero: true,
            },
          ],
        },
        {
          name: "Agents in production",
          articles: [
            {
              id: "a2",
              title:
                "Retrieval-free long-context agents match RAG pipelines at a sixth of the serving cost",
              summary:
                "Benchmarked on 1.2M-token enterprise corpora. If it holds outside the benchmark, a lot of RAG plumbing becomes optional.",
              sourceUrl: "https://arxiv.org/abs/2608.01234",
              isHero: false,
            },
          ],
        },
      ],
      plan: {
        heroArticle: { title: "EU AI Act high-risk obligations bite for banks" },
        totalArticles: 2,
      },
      generatedAt: iso(0, 4),
    },
  },
];

const BRAND_VOICES = [
  { id: "bv1", name: "Link house voice", isDefault: true },
  { id: "bv2", name: "Executive brief", isDefault: false },
];

const EDITION_DETAIL = {
  id: "ed-live",
  week: 31,
  year: 2026,
  status: "DRAFT",
  finalizedAt: null,
  sentAt: null,
  createdAt: iso(3),
  updatedAt: iso(0, 6),
  articles: ARTICLES.slice(0, 3).map((a, index) => ({ ...a, order: index })),
  projects: PROJECTS.slice(0, 2).map((p, index) => ({ ...p, order: index })),
  articleCount: 3,
  projectCount: 2,
  editorDesignJson: null,
  templateId: null,
  sharePointUrl: null,
  sharePointPageId: null,
  sharePointPublishedAt: null,
  sharePointError: null,
};

/**
 * RQ-005: this week's proposal, as `GET /api/editions/proposal` returns it.
 *
 * The fixture articles above are enough to make the proposal render, so nothing
 * new is invented here beyond the counts and the pipeline status.
 */
const PROPOSAL_PAYLOAD = {
  proposal: {
    id: "e1",
    week: 32,
    year: 2026,
    status: "DRAFT",
    thin: false,
    archivedAt: null,
    sentAt: null,
    approvedAt: null,
    approvedByEmail: null,
    articles: ARTICLES.slice(0, 5).map((article, index) => ({
      ...article,
      order: index + 1,
    })),
    projects: PROJECTS.slice(0, 2).map((project, index) => ({
      ...project,
      order: index + 1,
    })),
  },
  counts: {
    collected: 148,
    rejected: 12,
    belowThreshold: 92,
    inProposal: 5,
    approvedWaiting: 2,
    pending: ARTICLES.length,
  },
  pipeline: {
    running: false,
    current: null,
    total: null,
    lastRun: {
      status: "COMPLETED",
      startedAt: iso(0, 3),
      completedAt: iso(0, 2),
      totalFound: 148,
      curated: 25,
      duplicates: 31,
      lowScore: 92,
      errorsCount: 0,
    },
    runNeeded: false,
    runReason: "current",
  },
  recipients: { active: 412 },
  assembly: {
    assembled: true,
    candidates: 25,
    thin: false,
    refreshedAt: iso(0, 1),
  },
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Replays the shape of /api/search/stream, slowly enough to watch the stages. */
function searchStream(query: string) {
  const encoder = new TextEncoder();
  const frame = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const expansion = {
    original: query,
    expanded: `${query} enterprise Europe 2026`,
    intent: "recent developments",
    timeScope: "last 6 months",
    topics: ["Agents", "Banking", "Regulation"],
  };

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        frame("start", { jobId: "preview-job", message: "Starting search" })
      );
      await wait(500);
      controller.enqueue(
        frame("progress", {
          stage: "query_expanded",
          progress: 18,
          message: JSON.stringify(expansion),
        })
      );
      await wait(700);
      controller.enqueue(
        frame("progress", {
          stage: "searching",
          progress: 40,
          message: "Searching the web",
        })
      );
      await wait(700);

      for (let i = 0; i < 3; i += 1) {
        controller.enqueue(
          frame("progress", {
            stage: "analyzing",
            progress: 52 + i * 14,
            message: JSON.stringify({
              current: (i + 1) * 5,
              total: 15,
              title: SEARCH_RESULTS[i].title,
            }),
          })
        );
        await wait(600);
      }

      controller.enqueue(
        frame("complete", {
          result: {
            results: SEARCH_RESULTS,
            queryExpansion: {
              original: expansion.original,
              expanded: expansion.expanded,
              analysis: {
                intent: expansion.intent,
                timeScope: expansion.timeScope,
                topics: expansion.topics,
              },
            },
          },
        })
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// Patch before any component effect runs.
if (typeof window !== "undefined" && !(window as never as { __radarStub?: boolean }).__radarStub) {
  (window as never as { __radarStub?: boolean }).__radarStub = true;
  const real = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/api/articles/pending")) {
      const params = new URL(url, window.location.origin).searchParams;
      const min = parseFloat(params.get("scoreMin") || "0");
      const cats = (params.get("categories") || "").split(",").filter(Boolean);
      let data = ARTICLES.filter((a) => (a.relevanceScore ?? 0) >= min);
      if (cats.length) {
        data = data.filter((a) => a.category.some((c) => cats.includes(c)));
      }
      return json({
        success: true,
        data,
        count: data.length,
        meta: {
          categories: [
            "Regulation",
            "Agents",
            "Security",
            "MCP",
            "Financial services",
          ],
        },
      });
    }

    if (url.includes("/api/articles/approved")) {
      return json({ success: true, data: APPROVED, count: APPROVED.length });
    }
    if (url.includes("/api/projects?teams=true")) {
      return json({ success: true, data: TEAMS });
    }
    if (url.includes("/api/projects")) {
      return json({ success: true, data: PROJECTS, count: PROJECTS.length });
    }
    if (url.includes("/api/rss-sources")) {
      return json(SOURCES);
    }
    if (url.includes("/api/curation/jobs")) {
      return json({ jobs: CURATION_JOBS, page: 1, totalPages: 2 });
    }
    if (url.includes("/api/subscribers")) {
      const all = url.includes("all=true");
      const data = all ? SUBSCRIBERS : SUBSCRIBERS.filter((s) => s.active);
      return json({ success: true, data, count: data.length });
    }
    if (url.includes("/api/templates")) {
      return json(TEMPLATES);
    }
    if (url.includes("/api/analytics")) {
      return json(ANALYTICS);
    }
    if (url.includes("/api/settings/theme")) {
      return json({ userTheme: null, orgTheme: "linkroad-light", role: "OWNER" });
    }
    if (url.includes("/api/settings/branding")) {
      return json({ success: true, data: { logoUrl: null, bannerUrl: null } });
    }
    if (url.includes("/api/settings")) {
      return json(SETTINGS);
    }
    if (url.includes("/api/usage")) {
      return json({ success: true, data: USAGE });
    }
    if (url.includes("/api/api-keys")) {
      return json({ success: true, data: API_KEYS });
    }
    if (url.includes("/api/brand-voices")) {
      return json({ brandVoices: BRAND_VOICES });
    }
    if (url.includes("/api/drafts")) {
      const single = /\/api\/drafts\/[^/?]+/.test(url);
      return single
        ? json({ draft: GENERATION_DRAFTS[0] })
        : json({ drafts: GENERATION_DRAFTS });
    }
    // RQ-005: both proposal routes must precede the /api/editions/<id> branch,
    // which would otherwise match "proposal" as an edition id.
    if (url.includes("/api/editions/proposal/candidates")) {
      return json({
        success: true,
        data: {
          articles: APPROVED.filter((a) => !a.editionCount).map((a, index) => ({
            ...a,
            order: index + 1,
          })),
          projects: PROJECTS.slice(2).map((p, index) => ({ ...p, order: index + 1 })),
        },
      });
    }
    if (url.includes("/api/editions/proposal")) {
      return json({ success: true, data: PROPOSAL_PAYLOAD });
    }
    // The builder reads /api/editions/<id>; the harness has no route params, so
    // any id resolves to the same live edition.
    if (/\/api\/editions\/[^/?]+/.test(url)) {
      return json({ success: true, data: EDITION_DETAIL });
    }
    if (url.includes("/api/editions")) {
      // RQ-005 AC-8.3: the filter is applied here too, so the harness shows the
      // same three lists the server would and the selection prunes as it will.
      const mode = new URL(url, "http://preview").searchParams.get("archived");
      const rows =
        mode === "only"
          ? EDITIONS.filter((edition) => edition.archivedAt !== null)
          : mode === "all"
            ? EDITIONS
            : EDITIONS.filter((edition) => edition.archivedAt === null);
      return json({ success: true, data: rows, count: rows.length });
    }
    if (url.includes("/api/trends")) {
      const trends = buildTrends();
      return json({
        success: true,
        data: trends,
        meta: {
          days: 90,
          bucketCount: 12,
          articlesConsidered: 1412,
          topicsFound: trends.length,
          hasEnoughHistory: true,
        },
      });
    }
    if (url.includes("/api/search/stream")) {
      const q =
        new URL(url, window.location.origin).searchParams.get("query") || "";
      return searchStream(q);
    }
    const topicMatch = url.match(/\/api\/search\/topics\/([^/?]+)/);
    if (topicMatch) {
      const topic = SEARCH_TOPICS.find((t) => t.id === topicMatch[1]);
      const kept = SEARCH_RESULTS.slice(
        0,
        Math.min(topic?.resultCount ?? 0, SEARCH_RESULTS.length)
      ).map((r, i) => ({ ...r, id: `${topicMatch[1]}-${i}` }));
      return json({ success: true, data: { ...(topic ?? {}), results: kept } });
    }
    if (url.includes("/api/search/topics")) {
      return json({ success: true, data: SEARCH_TOPICS });
    }
    if (url.includes("/api/search/history/")) {
      return json({ results: SEARCH_RESULTS.slice(0, 5) });
    }
    if (url.includes("/api/search/history")) {
      return json({ history: SEARCH_HISTORY, page: 1, totalPages: 3 });
    }
    // Must precede the organizations list branch, which matches on the prefix.
    if (url.includes("/api/organizations/current")) {
      return json({
        organization: { id: "o1", name: "Link Consulting", plan: "ENTERPRISE" },
        // RQ-005: the proposal screen gates its controls on this role.
        membership: { role: "OWNER", joinedAt: iso(300) },
      });
    }
    if (url.includes("/api/organizations")) {
      return json({
        success: true,
        data: [
          {
            id: "o1",
            name: "Link Consulting",
            slug: "link",
            plan: "ENTERPRISE",
            industry: "IT consulting",
            logoUrl: null,
            role: "OWNER",
          },
        ],
        currentOrgId: "o1",
      });
    }
    if (url.includes("/api/jobs")) return json({ jobs: [] });
    if (url.includes("/api/settings/theme")) return json({ userTheme: null, orgTheme: null });
    if (url.includes("/api/")) return json({ success: true, data: [] });

    return real(input as RequestInfo, init);
  };
}

const FAKE_USER = {
  id: "preview",
  email: "julian.andrade@linkconsulting.com",
} as unknown as User;

const SCREENS = {
  feed: FeedPage,
  trends: TrendsPage,
  editions: EditionsPage,
  builder: BuilderPage,
  search: SearchPage,
  // RQ-005 action 4: there is no review screen any more. /dashboard/review is a
  // redirect to the proposal screen's queue view, so the "feed" entry above is
  // the only place that list is rendered.
  projects: ProjectsPage,
  curation: CurationPage,
  sources: SourcesPage,
  subscribers: SubscribersPage,
  templates: TemplatesPage,
  analytics: AnalyticsPage,
  generate: GeneratePage,
  settings: SettingsPage,
} as const;

type PreviewScreen = keyof typeof SCREENS;

export default function RadarPreviewHarness() {
  const [screen, setScreen] = useState<PreviewScreen>("feed");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("screen");
    if (param && param in SCREENS) {
      setScreen(param as PreviewScreen);
    }
  }, []);

  const Screen = SCREENS[screen];

  return (
    <DashboardShell user={FAKE_USER}>
      <Screen />
    </DashboardShell>
  );
}

// Application Configuration

export const config = {
  // Application
  app: {
    name: "Link AI Newsletter Engine",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    env: process.env.NODE_ENV || "development",
  },

  // Database
  database: {
    url: process.env.DATABASE_URL!,
    directUrl: process.env.DIRECT_URL,
  },

  // Auth (Auth.js + Microsoft Entra ID — docs/MIGRATION-GCP.md Phase 2)
  auth: {
    secret: process.env.AUTH_SECRET,
    entra: {
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // issuer: https://login.microsoftonline.com/<tenant-id>/v2.0
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    },
    // E2E/CI ONLY — must never be "true" in production.
    e2eTestMode: process.env.E2E_TEST_MODE === "true",
  },

  // Storage (Supabase Storage stays until Phase 3; these are NOT auth vars).
  storage: {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  // AI Services
  ai: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-sonnet-4-20250514",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      embeddingModel: "text-embedding-ada-002",
    },
  },

  // Email
  email: {
    provider: (process.env.EMAIL_PROVIDER || "resend") as "resend" | "graph",
    resend: {
      apiKey: process.env.RESEND_API_KEY!,
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    },
    graph: {
      tenantId: process.env.AZURE_TENANT_ID,
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      senderEmail: process.env.GRAPH_SENDER_EMAIL,
    },
    from: {
      email: process.env.FROM_EMAIL || "newsletter@linkconsulting.com",
      name: process.env.FROM_NAME || "AI Radar",
    },
    batchSize: 50, // Send emails in batches of 50
    rateLimitDelay: 1000, // Wait 1 second between batches
  },

  // Curation
  curation: {
    relevanceThreshold: 6.0, // Minimum relevance score (0-10)
    // Articles scoring at or above this skip human review and land as
    // APPROVED (the weekly send itself still requires a human-finalized
    // edition). Set AUTO_APPROVE_THRESHOLD > 10 to disable auto-approval.
    autoApproveThreshold: Number(process.env.AUTO_APPROVE_THRESHOLD ?? 8),
    maxArticlesPerEdition: 10,
    vectorSimilarityThreshold: 0.85, // For deduplication
  },

  // Cron
  cron: {
    secret: process.env.CRON_SECRET,
  },

  // RSS Sources (default AI/tech sources)
  rssSources: [
    {
      name: "TechCrunch AI",
      url: "https://techcrunch.com/category/artificial-intelligence/feed/",
      category: "AI News",
    },
    {
      name: "MIT Technology Review AI",
      url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
      category: "AI Research",
    },
    {
      name: "VentureBeat AI",
      url: "https://venturebeat.com/category/ai/feed/",
      category: "AI Business",
    },
    {
      name: "The Verge AI",
      url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml",
      category: "AI Tech",
    },
    {
      name: "OpenAI Blog",
      url: "https://openai.com/blog/rss.xml",
      category: "AI Updates",
    },
    {
      name: "Google AI Blog",
      url: "https://blog.google/technology/ai/rss/",
      category: "AI Research",
    },
    {
      name: "Anthropic News",
      url: "https://www.anthropic.com/news/rss.xml",
      category: "AI Updates",
    },
  ],
} as const;

// OPML Import Presets
export const OPML_PRESETS = [
  {
    name: "AllInfoSecNews",
    url: "https://raw.githubusercontent.com/malcolm-heath/allinfosecnews2opml/main/allinfosecnews_sources.opml",
    description: "458 InfoSec RSS feeds (news, podcasts, vendor blogs, advisories)",
    suggestedCategory: "Security",
  },
] as const;

// Validation helper
export function validateConfig() {
  const required = {
    "DATABASE_URL": config.database.url,
    "ANTHROPIC_API_KEY": config.ai.anthropic.apiKey,
    "OPENAI_API_KEY": config.ai.openai.apiKey,
    "RESEND_API_KEY": config.email.resend.apiKey,
    // Auth.js + Microsoft Entra ID (Phase 2). Required in every real
    // environment; in E2E_TEST_MODE the Entra provider is unused (credentials
    // path) but AUTH_SECRET is still required to sign session JWTs.
    "AUTH_SECRET": config.auth.secret,
    ...(config.auth.e2eTestMode
      ? {}
      : {
          "AUTH_MICROSOFT_ENTRA_ID_ID": config.auth.entra.clientId,
          "AUTH_MICROSOFT_ENTRA_ID_SECRET": config.auth.entra.clientSecret,
          "AUTH_MICROSOFT_ENTRA_ID_ISSUER": config.auth.entra.issuer,
        }),
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }
}

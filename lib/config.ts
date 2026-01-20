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

  // AI Services
  ai: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-3-5-sonnet-20241022",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      embeddingModel: "text-embedding-ada-002",
    },
  },

  // Email
  email: {
    resend: {
      apiKey: process.env.RESEND_API_KEY!,
    },
    from: {
      email: process.env.FROM_EMAIL || "newsletter@linkconsulting.com",
      name: process.env.FROM_NAME || "Link Consulting AI Newsletter",
    },
    batchSize: 50, // Send emails in batches of 50
    rateLimitDelay: 1000, // Wait 1 second between batches
  },

  // Curation
  curation: {
    relevanceThreshold: 6.0, // Minimum relevance score (0-10)
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

// Validation helper
export function validateConfig() {
  const required = {
    "DATABASE_URL": config.database.url,
    "ANTHROPIC_API_KEY": config.ai.anthropic.apiKey,
    "OPENAI_API_KEY": config.ai.openai.apiKey,
    "RESEND_API_KEY": config.email.resend.apiKey,
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

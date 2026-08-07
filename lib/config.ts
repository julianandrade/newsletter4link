// Application Configuration

import { DEFAULT_AI_MODEL, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai-models";

/**
 * An environment value, cleaned of the two ways a `.env` file lies about it.
 *
 * Both have already cost real time on this project. `RESEND_API_KEY` ends with a newline inside
 * its quotes, which Resend answers with `400 "API key is invalid"` and no hint that the key is
 * fine: an hour of misdiagnosis on 6 August 2026. `FROM_EMAIL` and `FROM_NAME` carry the same
 * thing, and a newline in an address is worse than useless, since it is where header injection
 * lives.
 *
 * Whether the escape arrives expanded depends on who read the file: `--env-file` and dotenv
 * expand `\n` inside double quotes, Vercel's dashboard does not. So both shapes are stripped, and
 * the same value works whichever side it came from.
 */
function envValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.trim().replace(/(?:\\n|\\r|\\t)+$/, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * The first word of an environment value.
 *
 * `EMAIL_PROVIDER` is set to `"resend  # resend (default) or graph (Microsoft Graph API)"`, with
 * the comment inside the quotes, so the value is that whole sentence. It happens to work, because
 * the sender only checks whether the provider is `graph` and falls through to Resend for anything
 * else, which means a genuine misconfiguration would also silently send through Resend.
 */
function envToken(raw: string | undefined): string | undefined {
  const cleaned = envValue(raw);
  if (!cleaned) return undefined;
  const [first] = cleaned.split(/[\s#]/, 1);
  return first || undefined;
}

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
      model: DEFAULT_AI_MODEL,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    },
  },

  // Email
  email: {
    provider: (envToken(process.env.EMAIL_PROVIDER) || "resend") as "resend" | "graph",
    resend: {
      apiKey: envValue(process.env.RESEND_API_KEY)!,
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
      // RQ-007: the email.received webhook has its own signing secret, separate from the
      // send-events one, because they are separate webhooks on Resend's side.
      inboundWebhookSecret: process.env.RESEND_INBOUND_WEBHOOK_SECRET,
    },
    graph: {
      tenantId: process.env.AZURE_TENANT_ID,
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      senderEmail: process.env.GRAPH_SENDER_EMAIL,
    },
    from: {
      email: envValue(process.env.FROM_EMAIL) || "newsletter@linkconsulting.com",
      name: envValue(process.env.FROM_NAME) || "AI Radar",
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

  /**
   * RQ-007: bounds on email ingestion.
   *
   * Every number here is a limit on something that could otherwise run away: a digest with
   * two hundred links, a redirect chain that never ends, a batch that creates a thousand
   * articles from one bad parse.
   */
  emailIngest: {
    /** Most items taken from one digest. */
    maxItemsPerDigest: 20,
    /** Visible text and links sent to the extractor, in characters. */
    maxInputChars: 32_000,
    /** Redirect hops followed when resolving a tracking wrapper. */
    maxRedirectHops: 5,
    /** Milliseconds allowed per hop. */
    redirectTimeoutMs: 5_000,
    /** Articles one run may create, across all emails. */
    maxArticlesPerRun: 200,
    /** Content fetch attempts before an email is marked FAILED. */
    maxContentAttempts: 3,
    /** Stored html is capped, because a newsletter can carry half a megabyte of markup. */
    maxHtmlBytes: 500_000,
    /**
     * Total token budget for one extraction call, covering the model's thinking as well
     * as its reply.
     *
     * It was 4000, and that is what silently lost the four largest newsletters on
     * 6 August 2026. Two were ESSAY sources whose bodies needed 4354 and 4654 output
     * tokens to echo, so the reply could not fit the budget however many times it was
     * retried. Two were DIGEST sources on inputs near the 32000-character cap, where
     * thinking consumed the whole allowance before any text was emitted.
     *
     * The echo is gone now, so the reply is small in both modes and this figure only has
     * to cover thinking plus a list of at most `maxItemsPerDigest` items.
     */
    maxExtractionTokens: 8_000,
    /**
     * Emails processed at once in phase two.
     *
     * Each one costs an extraction call of 20 to 25 seconds before its items begin, and
     * that call is per email and unavoidable, so this is the limit that decides how many
     * emails a 300-second window holds.
     */
    emailConcurrency: 4,
    /**
     * Items processed at once within one email.
     *
     * A digest item is a redirect chain to unwrap, an embedding and a relevance score,
     * which is 3 to 7 seconds of almost pure waiting.
     *
     * Four times the email limit is sixteen calls in flight at the worst moment, across
     * Anthropic and OpenAI. Both are rate limited per organization, and a 429 here costs
     * an article rather than a retry, so the product is kept small on purpose.
     */
    itemConcurrency: 4,
    /**
     * An essay's body, in characters, taken from the email rather than from the model.
     *
     * Everything downstream is bounded anyway: relevance scoring and the embedding read a
     * prefix, and the Link Take pipeline caps its own input at 24000 characters. Storing
     * less of somebody else's newsletter is also the posture RQ-006 argued for.
     */
    maxEssayBodyChars: 12_000,
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

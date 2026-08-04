import type { EntityKind } from "@prisma/client";

/**
 * RQ-004 phase A: the seed watchlist.
 *
 * Scoped to the five topics agreed as both high-volume and specific enough to
 * yield entities: Large Language Models, AI Tools, AI Research, Cloud AI and AI
 * Regulation. "AI Applications" and "AI Business" are the two largest categories in
 * the corpus and the two least useful for choosing entities, because almost
 * anything qualifies.
 *
 * Twenty-three entities. Small enough that every query can be validated by hand
 * before a single day is collected, which matters more here than anywhere else: the
 * series is forward-only, so a query that is wrong on day one cannot be repaired at
 * week twelve. There is no archive to re-query.
 *
 * On query design. A name is not a query. The rule applied throughout is to add the
 * cheapest disambiguating term rather than demand a full phrase:
 *
 * - `Claude` alone is a common given name, so the query pairs it with Anthropic.
 * - `Gemini` is a constellation, a crypto exchange and an Apollo programme.
 * - `Mistral` is a wind.
 * - `Cursor` is a UI element, and by far the hardest of these.
 * - `MCP`, measured rather than assumed: the phrase "model context protocol"
 *   returns almost nothing on Hacker News because nobody writes it out, while `MCP`
 *   returns real MCP discussion. Demanding the phrase would trade a live signal for
 *   silence, so the abbreviation stays and its precision is measured.
 *
 * On arXiv specifically, the disambiguator is not a second word, it is the category
 * filter applied centrally in `sources.ts`. Sampling the real API showed that a
 * quoted multi-word phrase there is not a phrase match, and that pairing a name with
 * "AI" makes a query worse because "AI" is in nearly every abstract. Confining the
 * search to cs.AI, cs.CL and cs.LG is what removes the nuclear-physics MISTRAL and
 * the astronomical Gemini, so the entity queries here are single distinctive tokens.
 *
 * A null query means the entity is not collected from that source. arXiv has no
 * papers about Claude Code and Hacker News has little to say about mixture of
 * experts, and a query that returns nothing every day is a series of zeros
 * pretending to be an observation.
 */

export interface SeedEntity {
  slug: string;
  name: string;
  kind: EntityKind;
  hnQuery: string | null;
  arxivQuery: string | null;
  /** Why the query is shaped this way, kept with the seed rather than in a commit. */
  note?: string;
}

export const SEED_WATCHLIST: SeedEntity[] = [
  // ---- Models and the labs behind them (Large Language Models) ----
  {
    slug: "gpt-5",
    name: "GPT-5",
    kind: "MODEL",
    hnQuery: "GPT-5",
    arxivQuery: 'all:"GPT-5"',
  },
  {
    slug: "claude",
    name: "Claude",
    kind: "MODEL",
    hnQuery: "Claude Anthropic",
    arxivQuery: "abs:Claude",
    note:
      "A given name. On Hacker News both terms must appear. On arXiv the field is " +
      "abs rather than all, because all includes the author list and would count " +
      "every computing paper written by anyone called Claude.",
  },
  {
    slug: "gemini",
    name: "Gemini",
    kind: "MODEL",
    hnQuery: "Gemini Google",
    arxivQuery: "abs:Gemini",
    note:
      "A constellation, a crypto exchange and an Apollo programme share the name. " +
      "The category filter removes the astronomy; abs rather than all keeps an author " +
      "named Gemini from counting as a mention.",
  },
  {
    slug: "llama",
    name: "Llama",
    kind: "MODEL",
    hnQuery: "Llama Meta",
    arxivQuery: 'all:LLaMA',
    note: "The animal is common on Hacker News; on arXiv the capitalised name is safe.",
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    kind: "COMPANY",
    hnQuery: "DeepSeek",
    arxivQuery: 'all:DeepSeek',
  },
  {
    slug: "mistral",
    name: "Mistral",
    kind: "COMPANY",
    hnQuery: "Mistral AI",
    arxivQuery: "abs:Mistral",
    note:
      "A wind, a Renault van, a nuclear-physics spectrometer and an AGN wind model. " +
      "The last two vanish under the category filter; abs rather than all excludes " +
      "the author list.",
  },
  {
    slug: "qwen",
    name: "Qwen",
    kind: "MODEL",
    hnQuery: "Qwen",
    arxivQuery: 'all:Qwen',
  },

  // ---- Protocols and techniques (AI Research) ----
  {
    slug: "model-context-protocol",
    name: "Model Context Protocol",
    kind: "PROTOCOL",
    hnQuery: "MCP",
    arxivQuery: 'all:"model context protocol"',
    note: "Abbreviation on HN because nobody writes the phrase; phrase on arXiv because papers do.",
  },
  {
    slug: "retrieval-augmented-generation",
    name: "Retrieval Augmented Generation",
    kind: "TECHNIQUE",
    hnQuery: "RAG retrieval",
    arxivQuery: 'all:"retrieval augmented generation"',
    note: "RAG alone matches rags, RAG rugby and Rag weeks.",
  },
  {
    slug: "mixture-of-experts",
    name: "Mixture of Experts",
    kind: "TECHNIQUE",
    hnQuery: null,
    arxivQuery: 'all:"mixture of experts"',
    note: "Barely discussed by name on HN; a live literature term on arXiv.",
  },
  {
    slug: "chain-of-thought",
    name: "Chain of Thought",
    kind: "TECHNIQUE",
    hnQuery: null,
    arxivQuery: 'all:"chain of thought"',
  },
  {
    slug: "rlhf",
    name: "Reinforcement Learning from Human Feedback",
    kind: "TECHNIQUE",
    hnQuery: "RLHF",
    arxivQuery: 'all:RLHF',
  },
  {
    slug: "agentic-ai",
    name: "Agentic AI",
    kind: "TECHNIQUE",
    hnQuery: "agentic",
    arxivQuery: 'all:agentic',
  },
  {
    slug: "diffusion-models",
    name: "Diffusion Models",
    kind: "TECHNIQUE",
    hnQuery: null,
    arxivQuery: 'all:"diffusion model"',
  },

  // ---- Tools (AI Tools) ----
  {
    slug: "claude-code",
    name: "Claude Code",
    kind: "PRODUCT",
    hnQuery: '"Claude Code"',
    arxivQuery: null,
    note: "A phrase, because both words are common apart. No arXiv presence.",
  },
  {
    slug: "cursor-editor",
    name: "Cursor",
    kind: "PRODUCT",
    hnQuery: "Cursor IDE",
    arxivQuery: null,
    note: "The hardest of these: a cursor is a UI element. Expect low precision and check it.",
  },
  {
    slug: "copilot",
    name: "Copilot",
    kind: "PRODUCT",
    hnQuery: "Copilot",
    arxivQuery: 'all:Copilot',
    note:
      "Named Copilot rather than GitHub Copilot because the Hacker News query counts " +
      "Microsoft Copilot too and there is no cheap way to separate them. Measuring " +
      "both and saying so beats a name that promises one. The arXiv query is the " +
      "narrower phrase, because papers do write it out, so the two series are not " +
      "the same population.",
  },
  {
    slug: "langchain",
    name: "LangChain",
    kind: "PRODUCT",
    hnQuery: "LangChain",
    arxivQuery: 'all:LangChain',
  },
  {
    slug: "ollama",
    name: "Ollama",
    kind: "PRODUCT",
    hnQuery: "Ollama",
    arxivQuery: null,
  },
  {
    slug: "vllm",
    name: "vLLM",
    kind: "PRODUCT",
    hnQuery: "vLLM",
    arxivQuery: 'all:vLLM',
  },

  // ---- Cloud AI ----
  {
    slug: "aws-bedrock",
    name: "AWS Bedrock",
    kind: "PRODUCT",
    hnQuery: "Bedrock AWS",
    arxivQuery: null,
    note: "Bedrock alone is geology and a cartoon town.",
  },
  {
    slug: "azure-openai",
    name: "Azure OpenAI",
    kind: "PRODUCT",
    hnQuery: '"Azure OpenAI"',
    arxivQuery: null,
  },

  // ---- AI Regulation ----
  {
    slug: "eu-ai-act",
    name: "EU AI Act",
    kind: "BENCHMARK",
    hnQuery: '"AI Act"',
    arxivQuery: 'all:"EU AI Act"',
    note: "Kind is a poor fit; regulation has no kind of its own yet and PROTOCOL would be worse.",
  },
];

/** Precision below this and the entity is deactivated rather than counted. */
export const PRECISION_THRESHOLD = 0.7;

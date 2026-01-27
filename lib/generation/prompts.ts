/**
 * Ghost Writer Prompts
 *
 * AI prompts for autonomous newsletter generation.
 */

import { BrandVoice } from "@prisma/client";

/**
 * Build the brand voice system prompt section
 */
export function buildBrandVoicePrompt(brandVoice: BrandVoice | null): string {
  if (!brandVoice) {
    return `
BRAND VOICE:
Write in a professional, informative tone. Be clear and direct.
Focus on delivering value to tech professionals and executives.
Avoid hype and marketing speak. Be factual and insightful.`;
  }

  const parts: string[] = [`BRAND VOICE: ${brandVoice.name}`];

  if (brandVoice.personality) {
    parts.push(`\nPersonality: ${brandVoice.personality}`);
  }

  if (brandVoice.toneAttributes.length > 0) {
    parts.push(`\nTone: ${brandVoice.toneAttributes.join(", ")}`);
  }

  if (brandVoice.styleGuidelines) {
    parts.push(`\nStyle Guidelines: ${brandVoice.styleGuidelines}`);
  }

  if (brandVoice.dos.length > 0) {
    parts.push(`\nDO: ${brandVoice.dos.join("; ")}`);
  }

  if (brandVoice.donts.length > 0) {
    parts.push(`\nDON'T: ${brandVoice.donts.join("; ")}`);
  }

  if (brandVoice.useEmoji) {
    parts.push(`\nEmojis: Use sparingly and appropriately`);
  } else {
    parts.push(`\nEmojis: Do not use emojis`);
  }

  if (brandVoice.examplePhrases) {
    const examples = brandVoice.examplePhrases as { good?: string[]; bad?: string[] };
    if (examples.good?.length) {
      parts.push(`\nGood examples: "${examples.good.join('", "')}"`);
    }
    if (examples.bad?.length) {
      parts.push(`\nAvoid phrases like: "${examples.bad.join('", "')}"`);
    }
  }

  return parts.join("");
}

/**
 * Prompt for generating the newsletter opening hook
 */
export function getOpeningHookPrompt(
  brandVoice: BrandVoice | null,
  heroArticle: { title: string; summary?: string | null },
  edition: { week: number; year: number },
  greeting?: string
): string {
  const brandPrompt = buildBrandVoicePrompt(brandVoice);
  const greetingLine = greeting || brandVoice?.greetings?.[0] || "Hello";

  return `You are writing the opening section of a newsletter.

${brandPrompt}

NEWSLETTER INFO:
- Edition: Week ${edition.week}, ${edition.year}
- Hero Story: "${heroArticle.title}"
${heroArticle.summary ? `- Hero Summary: ${heroArticle.summary}` : ""}

TASK:
Write an engaging opening paragraph (2-3 sentences) for this newsletter edition.

REQUIREMENTS:
1. Start with a greeting like "${greetingLine}"
2. Create intrigue about this week's content
3. Reference the hero story without giving everything away
4. Set the tone for the rest of the newsletter
5. Keep it concise and compelling

Write ONLY the opening paragraph. No headers or labels.`;
}

/**
 * Prompt for rewriting an article summary in brand voice
 */
export function getArticleSummaryPrompt(
  brandVoice: BrandVoice | null,
  article: {
    title: string;
    content: string;
    summary?: string | null;
    source?: string;
  },
  isHero: boolean = false
): string {
  const brandPrompt = buildBrandVoicePrompt(brandVoice);

  return `You are writing an article summary for a newsletter.

${brandPrompt}

ARTICLE:
Title: ${article.title}
${article.source ? `Source: ${article.source}` : ""}
${article.summary ? `Existing Summary: ${article.summary}` : ""}
Content: ${article.content.slice(0, 2000)}

TASK:
Write a ${isHero ? "compelling 3-4 sentence" : "concise 2-3 sentence"} summary of this article.

REQUIREMENTS:
1. Capture the key insight or development
2. Explain why it matters to the reader
3. ${isHero ? "Make it engaging as this is the featured story" : "Keep it informative but brief"}
4. Match the brand voice exactly
5. End with something that makes the reader want to click through

Write ONLY the summary paragraph. No headers or labels.`;
}

/**
 * Prompt for generating transitions between sections
 */
export function getTransitionPrompt(
  brandVoice: BrandVoice | null,
  fromSection: string,
  toSection: string,
  context?: string
): string {
  const brandPrompt = buildBrandVoicePrompt(brandVoice);

  return `You are writing a transition between newsletter sections.

${brandPrompt}

TRANSITION NEEDED:
From: ${fromSection}
To: ${toSection}
${context ? `Context: ${context}` : ""}

TASK:
Write a brief transition sentence (1-2 sentences max) that smoothly connects these sections.

REQUIREMENTS:
1. Keep it very short - this is just a bridge
2. Create a natural flow between topics
3. Match the brand voice
4. Don't be cheesy or forced

Write ONLY the transition. No headers or labels.`;
}

/**
 * Prompt for generating the newsletter closing
 */
export function getClosingPrompt(
  brandVoice: BrandVoice | null,
  articleCount: number,
  closing?: string
): string {
  const brandPrompt = buildBrandVoicePrompt(brandVoice);
  const closingLine = closing || brandVoice?.closings?.[0] || "Until next time";

  return `You are writing the closing section of a newsletter.

${brandPrompt}

NEWSLETTER INFO:
- Number of articles covered: ${articleCount}
- Sign-off style: "${closingLine}"

TASK:
Write a brief closing paragraph (2-3 sentences) for this newsletter.

REQUIREMENTS:
1. Thank the reader for their time
2. Optionally tease next week's content
3. Include a call-to-action (share, reply, or forward)
4. End with the sign-off
5. Match the brand voice

Write ONLY the closing paragraph. No headers or labels.`;
}

/**
 * Prompt for generating subject line variants
 */
export function getSubjectLinesPrompt(
  brandVoice: BrandVoice | null,
  heroArticle: { title: string; summary?: string | null },
  edition: { week: number; year: number },
  otherTopics: string[]
): string {
  const brandPrompt = buildBrandVoicePrompt(brandVoice);

  return `You are writing email subject lines for a newsletter.

${brandPrompt}

NEWSLETTER INFO:
- Edition: Week ${edition.week}, ${edition.year}
- Hero Story: "${heroArticle.title}"
${heroArticle.summary ? `- Hero Summary: ${heroArticle.summary}` : ""}
${otherTopics.length > 0 ? `- Other topics: ${otherTopics.join(", ")}` : ""}

TASK:
Generate 5 different subject line options for this newsletter email.

REQUIREMENTS FOR EACH:
1. Keep under 60 characters (ideally 40-50)
2. Create curiosity or urgency
3. Avoid spam trigger words (FREE, ACT NOW, etc.)
4. Match the brand voice
5. Each should use a different hook strategy:
   - #1: Question-based
   - #2: Number/list-based
   - #3: News/announcement style
   - #4: Benefit-focused
   - #5: Curiosity gap

FORMAT:
Return as a JSON array of 5 strings:
["Subject 1", "Subject 2", "Subject 3", "Subject 4", "Subject 5"]

Return ONLY the JSON array, no other text.`;
}

/**
 * Prompt for categorizing and grouping articles
 */
export function getCategoryGroupingPrompt(
  articles: Array<{ title: string; category?: string[]; summary?: string | null }>
): string {
  const articleList = articles
    .map((a, i) => `${i + 1}. "${a.title}" - Categories: ${a.category?.join(", ") || "uncategorized"}`)
    .join("\n");

  return `Analyze these newsletter articles and group them into coherent sections.

ARTICLES:
${articleList}

TASK:
Group these articles into 2-4 thematic sections for the newsletter.

REQUIREMENTS:
1. Each section should have a clear theme
2. Put the most impactful article first (hero story candidate)
3. Group related articles together
4. Create section names that are engaging, not generic

FORMAT:
Return as JSON:
{
  "heroIndex": <0-based index of hero article>,
  "sections": [
    {
      "name": "Section Name",
      "articleIndices": [<0-based indices>],
      "theme": "Brief description of theme"
    }
  ]
}

Return ONLY the JSON, no other text.`;
}

/**
 * Prompt for generating a complete newsletter in one shot (for simpler use cases)
 */
export function getFullNewsletterPrompt(
  brandVoice: BrandVoice | null,
  articles: Array<{
    title: string;
    content: string;
    summary?: string | null;
    sourceUrl: string;
  }>,
  edition: { week: number; year: number }
): string {
  const brandPrompt = buildBrandVoicePrompt(brandVoice);
  const greeting = brandVoice?.greetings?.[0] || "Hello";
  const closing = brandVoice?.closings?.[0] || "Until next time";

  const articleList = articles
    .map(
      (a, i) => `
ARTICLE ${i + 1}:
Title: ${a.title}
URL: ${a.sourceUrl}
${a.summary ? `Summary: ${a.summary}` : ""}
Content: ${a.content.slice(0, 1000)}
`
    )
    .join("\n---\n");

  return `You are a newsletter editor creating the full editorial content for a newsletter.

${brandPrompt}

NEWSLETTER INFO:
- Edition: Week ${edition.week}, ${edition.year}
- Greeting style: "${greeting}"
- Closing style: "${closing}"

ARTICLES TO INCLUDE:
${articleList}

TASK:
Write the complete newsletter editorial content including:
1. Opening paragraph (greeting + hook)
2. For each article: A rewritten summary in brand voice (2-3 sentences each)
3. Brief transitions between articles
4. Closing paragraph with call-to-action

FORMAT:
Return as JSON:
{
  "opening": "Opening paragraph text",
  "articles": [
    {
      "title": "Article title",
      "summary": "Rewritten summary in brand voice",
      "url": "Article URL"
    }
  ],
  "closing": "Closing paragraph text"
}

Return ONLY the JSON, no other text.`;
}

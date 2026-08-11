import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { rethrowIfModelRejected } from "@/lib/ai/model";
import { describeBlocks, messageText } from "@/lib/ai/message";
import { stripLongDashes } from "@/lib/ai/typography";
import {
  checkRewrite,
  describeCheck,
  type CheckFailure,
  type CheckResult,
} from "@/lib/rewrite/checks";
import {
  MAX_ATTEMPTS,
  MAX_INPUT_CHARS,
  MAX_REWRITE_WORDS,
} from "@/lib/rewrite/config";
import {
  buildRetryPrompt,
  buildRewritePrompt,
  hasUsableInput,
  type PromptInput,
  type RewriteMode,
} from "@/lib/rewrite/prompt";

/**
 * RQ-006_01: generate one rewrite, or refuse.
 *
 * The shape of this module is set by the answer to the requirement's first open
 * question. A human may or may not read a generated piece before it reaches a
 * subscriber, so the mechanical checks are not a safety net under a reviewer, they are
 * the only control. Three consequences, all visible in the code below:
 *
 * - It fails closed. A piece that does not pass is stored as FAILED and never
 *   returned as usable. There is no "publish with a warning" path.
 * - Every attempt's check result is recorded, so a complaint months later is answered
 *   with evidence rather than intent.
 * - One retry, told exactly what was wrong, then it stops. Retrying indefinitely
 *   against a check the model cannot satisfy is how a budget disappears.
 *
 * The persistence is the caller's, deliberately: this function is pure enough to test
 * with a fake model client and no database.
 */

/**
 * Constructed on first use, not at import.
 *
 * Importing this module must not open a network client: the pure parts of it, the JSON
 * parsing and the hashing and the staleness rule, are the parts most worth testing,
 * and the SDK refuses to instantiate in a test environment at all.
 */
let client: Anthropic | null = null;

function anthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface GenerateInput extends Omit<PromptInput, "source"> {
  /** Full article text, or the feed excerpt. */
  source: string;
  model: string;
}

export type GenerateOutcome =
  | {
      status: "GENERATED";
      title: string;
      body: string;
      inputMode: RewriteMode;
      check: CheckResult;
      checkSummary: string;
      sourceHash: string;
      attempts: number;
    }
  | {
      status: "REFUSED";
      /** Why nothing was generated, in one sentence, for the record and the UI. */
      reason: string;
      inputMode: RewriteMode;
      /** The last check result, when there was one to record. */
      check: CheckResult | null;
      checkSummary: string;
      sourceHash: string;
      attempts: number;
      /**
       * The head of what the model last replied.
       *
       * A refusal that cannot say what came back is undebuggable, which I found out by
       * writing one: two attempts produced no parsable JSON and there was no way to
       * see why without editing the module. Truncated, because this ends up in a
       * database column and the body is not the interesting part when parsing failed.
       */
      lastReplyHead?: string;
    };

/** Stable hash of the text a rewrite was made from, so STALE can be computed. */
export function hashSource(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 32);
}

/** The model's reply, which is JSON when it behaves and prose when it does not. */
export function parseRewriteJson(
  text: string
): { title: string; body: string } | null {
  // A fenced block, or the first object in the reply. Models wrap JSON in markdown
  // often enough that failing on it would be failing on nothing.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { title?: unknown }).title === "string" &&
      typeof (parsed as { body?: unknown }).body === "string"
    ) {
      const { title, body } = parsed as { title: string; body: string };
      if (title.trim().length === 0 || body.trim().length === 0) return null;
      /**
       * The house dash rule, applied here rather than trusted to rule 7.
       *
       * This is the single funnel every attempt passes through, the retry included, and
       * it is upstream of the checks, so what gets compared to the source and what gets
       * stored are the same text. Punctuation cannot affect the copy check either way:
       * `words()` in checks.ts strips it before comparing.
       */
      return {
        title: stripLongDashes(title.trim()),
        body: stripLongDashes(body.trim()),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Injected so the whole path is testable without a network. */
export type AskModel = (prompt: string, model: string) => Promise<string>;

const askAnthropic: AskModel = async (prompt, model) => {
  const message = await anthropicClient().messages.create({
    model,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  // messageText, not content[0]: a reply can open with a thinking block, and reading
  // index 0 then yields the empty string. This module is where that was found.
  const text = messageText(message);

  if (text.length === 0) {
    throw new Error(`the model returned no text (${describeBlocks(message)})`);
  }

  return text;
};

export async function generateRewrite(
  input: GenerateInput,
  ask: AskModel = askAnthropic
): Promise<GenerateOutcome> {
  const source = input.source.slice(0, MAX_INPUT_CHARS);
  const sourceHash = hashSource(source);
  const inputMode = input.mode;

  // Refused before any spend. Review F1: below a floor of usable input, generate
  // nothing and show the excerpt with its attribution instead.
  if (!hasUsableInput(source)) {
    return {
      status: "REFUSED",
      reason:
        "The source text is too short to write from, so nothing was generated. The excerpt is shown as published.",
      inputMode,
      check: null,
      checkSummary: "not attempted: input below the usable floor",
      sourceHash,
      attempts: 0,
    };
  }

  const promptInput: PromptInput = { ...input, source };

  let lastCheck: CheckResult | null = null;
  let lastFailures: CheckFailure[] = [];
  let lastReply = "";
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;

    const prompt =
      attempts === 1
        ? buildRewritePrompt(promptInput)
        : buildRetryPrompt(promptInput, lastFailures);

    let reply: string;

    try {
      reply = await ask(prompt, input.model);
    } catch (error) {
      // RQ-002: a retired model must not look like a content failure.
      rethrowIfModelRejected(error, input.model);

      return {
        status: "REFUSED",
        reason: `The model call failed: ${error instanceof Error ? error.message : "unknown error"}`,
        inputMode,
        check: lastCheck,
        checkSummary: lastCheck ? describeCheck(lastCheck) : "not reached: the call failed",
        sourceHash,
        attempts,
      };
    }

    lastReply = reply;

    const parsed = parseRewriteJson(reply);

    if (!parsed) {
      lastFailures = [
        { code: "empty", detail: "the reply was not the requested JSON object" },
      ];
      continue;
    }

    // Checked against the text it was written from, headline included: a lifted
    // headline is a lifted sentence.
    const check = checkRewrite({
      source,
      output: `${parsed.title}\n\n${parsed.body}`,
      limits: { maxWords: MAX_REWRITE_WORDS },
    });

    lastCheck = check;
    lastFailures = check.failures;

    if (check.ok) {
      return {
        status: "GENERATED",
        title: parsed.title,
        body: parsed.body,
        inputMode,
        check,
        checkSummary: describeCheck(check),
        sourceHash,
        attempts,
      };
    }
  }

  return {
    status: "REFUSED",
    reason:
      lastFailures.length > 0
        ? `The checks refused it after ${attempts} attempts: ${lastFailures.map((failure) => failure.code).join(", ")}.`
        : `Nothing usable was produced after ${attempts} attempts.`,
    inputMode,
    check: lastCheck,
    checkSummary: lastCheck
      ? describeCheck(lastCheck)
      : "failed: no parsable reply to check",
    sourceHash,
    attempts,
    lastReplyHead: lastReply.slice(0, 600) || undefined,
  };
}

/**
 * Whether a stored rewrite still matches the article it was written from.
 *
 * F6: STALE was a status nothing could assign, because nothing recorded what the
 * article said at the time. A rewrite with no recorded hash is treated as current
 * rather than stale, since there is nothing to compare and marking every old row stale
 * would regenerate the whole corpus on first read.
 */
export function isStale(
  rewrite: { sourceHash: string | null },
  articleHash: string | null
): boolean {
  if (!rewrite.sourceHash || !articleHash) return false;
  return rewrite.sourceHash !== articleHash;
}

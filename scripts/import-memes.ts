import "dotenv/config";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { prisma } from "../lib/db";
import { config } from "../lib/config";
import { structuredOutputTuning } from "../lib/ai-models";
import { messageText, describeBlocks } from "../lib/ai/message";
import {
  resolveAiModels,
  withModelRejection,
  UnusableModelError,
  modelRejectionMessage,
} from "../lib/ai/model";
import { sniffImageType } from "../lib/media/sniff";
import { parseSuggestions } from "../lib/asides/suggest";
import { parseAsideCreate, MAX_ASIDE_TEXT } from "../lib/asides/input";
import { NO_LONG_DASH_RULE } from "../lib/ai/typography";
import { uploadFile } from "../lib/storage";

/**
 * Land a folder of meme images in the closing-slot library.
 *
 * The images arrive as files on disk, which is nowhere: a meme reaches an edition only as
 * `Aside.imageUrl`, a public URL in the newsletter-media bucket. Doing it through the UI is
 * one MediaLibrary dialog and one AsideForm per file, which for 32 files is a chore that
 * looks like a review without being one.
 *
 * Three things here are load-bearing.
 *
 * The dry run is the default. The target is the shared Supabase instance, which is the one
 * collision a worktree does not prevent, so nothing is written until `--apply` and the
 * report is the thing you read first. This is the shape scripts/approve-asides.ts uses.
 *
 * Every image is re-encoded before it goes anywhere. These arrive as PNG-encoded
 * photographs at roughly twice the width the email renders, 24MB across 32 files, and the
 * aside form already warns above 1MB because the block reaches around 800 inboxes. The
 * email renders the image at 516px (`oneMoreThingBlock`), so 1032 is the retina ceiling and
 * anything above it is bytes nobody sees.
 *
 * The caption is written by a model, so the row is MODEL and PENDING. `asidePickerQuery`
 * only ever offers APPROVED rows, so nothing this script creates can reach a send until a
 * person moves it. The caption is also the image's alt text, which is why it has to carry
 * the joke on its own rather than describe the picture.
 *
 *     npx tsx scripts/import-memes.ts                 # report only, nothing written
 *     npx tsx scripts/import-memes.ts --limit=2       # try the prompt on two of them first
 *     npx tsx scripts/import-memes.ts --recaption     # discard cached captions, ask again
 *     npx tsx scripts/import-memes.ts --apply         # upload and create the rows
 *     npx tsx scripts/import-memes.ts --org=link      # when there is more than one org
 *
 * Safe to repeat. `--apply` skips any row that already carries an `asideId`, and falls back
 * to a `MediaAsset.filename` lookup when the manifest has been deleted.
 *
 * One presentation note: `.env` sets NODE_ENV=development, so lib/db.ts logs every query and
 * `--apply` interleaves three of them per row with the report. Pipe through
 * `grep -v prisma:query` if that gets in the way. Not worked around here, because the
 * alternatives are a second connection pool or overriding NODE_ENV for the process, and
 * neither is worth it to tidy a log.
 */

/** Where the images are. Nothing in the app reads this folder; that is the problem. */
const SOURCE_DIR = join(process.cwd(), "public/images/memes");

/** Normalized JPEGs and the manifest. Gitignored: intermediate output, not an artefact. */
const WORK_DIR = join(process.cwd(), "scripts/.meme-import");
const MANIFEST_PATH = join(WORK_DIR, "manifest.json");

/** 2x the 516px the email renders the block at. Above this is bytes nobody sees. */
const TARGET_WIDTH = 1032;

/** Photographs, none needing transparency, so JPEG rather than the PNG they arrived as. */
const JPEG_QUALITY = 82;

/**
 * The language AsidePicker asks for when nothing tells it otherwise
 * (components/aside-picker.tsx). An aside stored in any other language is invisible in the
 * send screen, so a mismatch against the org's own setting is worth saying out loud.
 */
const PICKER_DEFAULT_LANGUAGE = "pt-PT";

interface ManifestRow {
  /** The file as it sits in public/images/memes. */
  sourceFile: string;
  /** The re-encoded file in the work directory. */
  normalizedFile: string;
  /** Always .jpg, because that is what everything is re-encoded to. */
  uploadFilename: string;
  bytesBefore: number;
  bytesAfter: number;
  /** The pt-PT one-liner. Editable by hand before --apply. */
  text: string;
  /** Set by --apply. Its presence is what makes a second run a no-op. */
  asideId?: string;
  url?: string;
}

interface Manifest {
  organizationId: string;
  language: string;
  model: string;
  rows: ManifestRow[];
}

const apply = process.argv.includes("--apply");
const recaption = process.argv.includes("--recaption");
const orgArgument = process.argv
  .find((argument) => argument.startsWith("--org="))
  ?.slice("--org=".length);

/**
 * How many files to caption this run. Every one of them by default.
 *
 * For checking the prompt and the encode against two images before paying for thirty-two.
 * It limits captioning only: `--apply` imports whatever the manifest holds, and rows for
 * files outside the limit are carried through untouched rather than dropped.
 */
const limitArgument = process.argv
  .find((argument) => argument.startsWith("--limit="))
  ?.slice("--limit=".length);
const limit = limitArgument ? Number(limitArgument) : Infinity;

if (limitArgument && (!Number.isInteger(limit) || limit < 1)) {
  console.error(`--limit must be a positive integer, got "${limitArgument}".`);
  process.exit(1);
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * The organization to import into.
 *
 * Refuses rather than guesses when there is more than one and no `--org`. Picking the first
 * row would put 32 rows in someone else's library, and the fix for that is manual.
 */
async function resolveOrganization(): Promise<{ id: string; name: string }> {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (organizations.length === 0) {
    throw new Error("No organizations found. Nothing to import into.");
  }

  if (orgArgument) {
    const match = organizations.find(
      (organization) => organization.slug === orgArgument || organization.id === orgArgument
    );
    if (!match) {
      const known = organizations.map((organization) => organization.slug).join(", ");
      throw new Error(`No organization matches "${orgArgument}". Known slugs: ${known}.`);
    }
    return match;
  }

  if (organizations.length > 1) {
    const known = organizations.map((organization) => organization.slug).join(", ");
    throw new Error(
      `${organizations.length} organizations exist, so the target is ambiguous. ` +
        `Pass --org=<slug>. Known slugs: ${known}.`
    );
  }

  return organizations[0];
}

/**
 * The caption prompt.
 *
 * The model is looking at a meme whose text is baked into the pixels in English, and what
 * comes back has to work as the aside's `text`: a line that stands on its own for a reader
 * whose client blocked the image, in the newsletter's own language. So this is not a
 * transcription and not a description of the picture, and the prompt has to say both.
 *
 * Inline rather than in lib/asides/suggest.ts because that module writes lines from
 * nothing, and this one reads a line off an image that already exists. The parsing, which
 * is the part with rules worth testing, is `parseSuggestions` and is shared.
 */
function buildCaptionPrompt(language: string): string {
  return `You are looking at a meme image made for an internal newsletter at an IT consultancy. Its joke is about AI and software engineering: the gap between what the tools promise and what the week actually looked like, agentic everything, slop, and how normal all of this became so fast.

Write the one-line caption that will sit next to this image in the email, in ${language}.

That line is also the image's alt text. A reader whose mail client blocks images sees only your line and never the picture, so it has to land the joke on its own rather than describe what is in the frame.

Rules:
- One line. No preamble, no closing remark, no quotes around it, no numbering.
- Under ${MAX_ASIDE_TEXT} characters, and much shorter is better.
- Do not narrate the image. "Two panels showing" or "A man holding" is a failure.
- The image's own text is in English. Do not translate it word for word; write the line that carries the same joke naturally in ${language}.
- Dry and self-deprecating about our own industry, never about a named company, product or person.
- ${NO_LONG_DASH_RULE}`;
}

function readManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch (error) {
    throw new Error(
      `${MANIFEST_PATH} is not readable JSON (${
        error instanceof Error ? error.message : error
      }). Delete it to start over.`
    );
  }
}

function writeManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Re-encode one image for email.
 *
 * The sniff is the same one POST /api/media/upload trusts, and for the same reason: a name
 * is not evidence of anything. Two of these files are JPEG wearing a .png name, which the
 * re-encode makes moot, but a renamed SVG would not be, and the route's comment records why
 * that mattered.
 *
 * Output is always JPEG, so the stored name always ends .jpg. One consequence worth naming:
 * an animated GIF would come out as its first frame. That is what Outlook on Windows shows
 * anyway, which is what the aside form warns about, so the loss is smaller than it sounds -
 * but it is a loss, and there are no GIFs in this folder today.
 */
async function normalize(
  sourceFile: string
): Promise<{ normalizedFile: string; uploadFilename: string; bytesBefore: number; bytesAfter: number }> {
  const original = readFileSync(join(SOURCE_DIR, sourceFile));

  const detected = sniffImageType(original);
  if (!detected) {
    throw new Error(
      "not a PNG, JPEG or GIF by its bytes. SVG can carry script and WebP does not render in Outlook on Windows, so neither is accepted here either."
    );
  }

  const base = sourceFile.replace(/\.[^.]+$/, "");
  const uploadFilename = `${base}.jpg`;
  const normalizedFile = uploadFilename;

  const output = await sharp(original)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  writeFileSync(join(WORK_DIR, normalizedFile), output);

  return {
    normalizedFile,
    uploadFilename,
    bytesBefore: original.byteLength,
    bytesAfter: output.byteLength,
  };
}

/**
 * Ask the model to caption one image.
 *
 * The normalized JPEG is what gets sent, not the original: it is the image the reader will
 * see, and it is a quarter of the bytes.
 *
 * `parseSuggestions` then `parseAsideCreate`, in that order, so a caption cannot enter the
 * library in a shape the editor screen could not have produced. The first strips the long
 * dashes, numbering and wrapping quotes the model adds despite being told not to; the
 * second is the validation the API route applies.
 */
async function caption(
  anthropic: Anthropic,
  model: string,
  language: string,
  normalizedFile: string
): Promise<string> {
  const bytes = readFileSync(join(WORK_DIR, normalizedFile));

  const message = await withModelRejection(model, () =>
    anthropic.messages.create({
      model,
      // One short line. Thinking is disabled below, for the reason the suggest route
      // records: the 5-family models think unless told not to, and thinking scales to fill
      // whatever max_tokens allows.
      max_tokens: 400,
      ...structuredOutputTuning(model),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: bytes.toString("base64") },
            },
            { type: "text", text: buildCaptionPrompt(language) },
          ],
        },
      ],
    })
  );

  const reply = messageText(message);
  if (reply.length === 0) {
    throw new Error(`the model returned no text (${describeBlocks(message)})`);
  }

  const [line] = parseSuggestions(reply);
  if (!line) {
    throw new Error(`nothing usable in the reply: ${JSON.stringify(reply.slice(0, 200))}`);
  }

  const parsed = parseAsideCreate({ text: line, kind: "JOKE", language });
  if (!parsed.ok) {
    throw new Error(`the caption failed the aside parser: ${parsed.error}`);
  }

  return parsed.value.text;
}

/** Normalize and caption every image, reusing captions already in the manifest. */
async function report(organization: { id: string; name: string }): Promise<Manifest> {
  const files = readdirSync(SOURCE_DIR)
    .filter((file) => !file.startsWith("."))
    .sort()
    .slice(0, limit);

  if (files.length === 0) {
    throw new Error(`No files in ${SOURCE_DIR}.`);
  }

  // The row rather than getSettings(), which returns AppSettings and does not carry this
  // field. The same read lib/rewrite/pipeline.ts does, and the same fallback.
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId: organization.id },
    select: { rewriteLanguage: true },
  });
  const language = settings?.rewriteLanguage || PICKER_DEFAULT_LANGUAGE;
  const { model } = await resolveAiModels(organization.id);
  const anthropic = new Anthropic({ apiKey: config.ai.anthropic.apiKey });

  const existing = readManifest();
  const cached = new Map(
    existing?.rows.map((row) => [row.sourceFile, row] as const) ?? []
  );

  /**
   * Rows the manifest already holds for files this run is not looking at.
   *
   * Only `--limit` produces any, and without carrying them a smoke test on three files
   * would silently drop the other twenty-nine captions, including any hand-edited one.
   */
  const targeted = new Set(files);
  const carried = (existing?.rows ?? []).filter((row) => !targeted.has(row.sourceFile));

  console.log(`${organization.name}: ${files.length} files to caption.`);
  console.log(`Captioning in ${language} with ${model}.\n`);

  const rows: ManifestRow[] = [];
  const failures: Array<{ file: string; reason: string }> = [];
  const manifest: Manifest = { organizationId: organization.id, language, model, rows: [] };

  const persist = () => {
    manifest.rows = [...carried, ...rows].sort((a, b) =>
      a.sourceFile.localeCompare(b.sourceFile)
    );
    writeManifest(manifest);
  };

  for (const [index, sourceFile] of files.entries()) {
    const position = `[${index + 1}/${files.length}]`;

    try {
      const normalized = await normalize(sourceFile);

      // A caption already written, either by an earlier run or by hand, is kept. Regenerating
      // it would silently discard an edit, and the edit is the whole reason the manifest is a
      // file rather than a variable.
      const previous = cached.get(sourceFile);
      const keep = previous?.text && !recaption ? previous.text : null;
      const text =
        keep ?? (await caption(anthropic, model, language, normalized.normalizedFile));

      rows.push({
        sourceFile,
        ...normalized,
        text,
        ...(previous?.asideId ? { asideId: previous.asideId } : {}),
        ...(previous?.url ? { url: previous.url } : {}),
      });

      // After every row, not at the end. A failure on the thirtieth image otherwise throws
      // away twenty-nine paid-for captions, and the next run asks for them again.
      persist();

      const savings = `${kb(normalized.bytesBefore)} -> ${kb(normalized.bytesAfter)}`;
      console.log(`${position} ${sourceFile}  ${savings}${keep ? "  (cached caption)" : ""}`);
      console.log(`        ${text}`);
    } catch (error) {
      if (error instanceof UnusableModelError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ file: sourceFile, reason });
      console.log(`${position} ${sourceFile}  SKIPPED: ${reason}`);
    }
  }

  persist();

  const before = manifest.rows.reduce((total, row) => total + row.bytesBefore, 0);
  const after = manifest.rows.reduce((total, row) => total + row.bytesAfter, 0);
  const heaviest = manifest.rows.reduce((worst, row) => Math.max(worst, row.bytesAfter), 0);

  console.log(`\nThis run: ${rows.length} captioned, ${failures.length} skipped.`);
  console.log(
    `Manifest holds ${manifest.rows.length} rows, ${
      manifest.rows.filter((row) => row.asideId).length
    } of them already imported.`
  );
  console.log(
    `${mb(before)} of source became ${mb(after)} of JPEG. Heaviest single image: ${kb(heaviest)}.`
  );

  if (language !== PICKER_DEFAULT_LANGUAGE) {
    console.log(
      `\nWarning: these will be stored as ${language}, but the send screen's picker asks for ` +
        `${PICKER_DEFAULT_LANGUAGE} and has no language control. They would not be offered.`
    );
  }

  console.log(`\nManifest: ${MANIFEST_PATH}`);
  console.log("Read the captions. Edit any you do not like, then run again with --apply.");

  return manifest;
}

/**
 * Upload and create the rows.
 *
 * MediaAsset as well as Aside, so the images show up in the MediaLibrary dialog like every
 * other upload rather than existing only as a URL on one row.
 */
async function applyManifest(manifest: Manifest): Promise<void> {
  const pending = manifest.rows.filter((row) => !row.asideId);

  if (pending.length === 0) {
    console.log(`Nothing to do: all ${manifest.rows.length} rows already have an aside.`);
    return;
  }

  console.log(`${pending.length} of ${manifest.rows.length} rows to import.\n`);

  let created = 0;
  let skipped = 0;

  for (const row of pending) {
    // The manifest is the fast path; this is the one that survives it being deleted.
    const already = await prisma.mediaAsset.findFirst({
      where: { organizationId: manifest.organizationId, filename: row.uploadFilename },
      select: { id: true, url: true },
    });

    if (already) {
      console.log(`${row.sourceFile}  already uploaded, skipping.`);
      row.url = already.url;
      skipped += 1;
      continue;
    }

    const bytes = readFileSync(join(WORK_DIR, row.normalizedFile));
    const { url } = await uploadFile(bytes, row.uploadFilename, "image/jpeg");

    await prisma.mediaAsset.create({
      data: {
        filename: row.uploadFilename,
        url,
        type: "image/jpeg",
        size: bytes.byteLength,
        organizationId: manifest.organizationId,
      },
    });

    const parsed = parseAsideCreate({
      text: row.text,
      kind: "JOKE",
      language: manifest.language,
      imageUrl: url,
    });

    if (!parsed.ok) {
      throw new Error(`${row.sourceFile}: the manifest caption is no longer valid (${parsed.error}).`);
    }

    const aside = await prisma.aside.create({
      data: {
        ...parsed.value,
        // The model wrote the line, so the row says so for ever. PENDING because
        // asidePickerQuery only offers APPROVED, which is the whole gate.
        status: "PENDING",
        source: "MODEL",
        organizationId: manifest.organizationId,
      },
    });

    row.asideId = aside.id;
    row.url = url;
    created += 1;
    writeManifest(manifest);

    console.log(`${row.sourceFile}  uploaded, aside ${aside.id}`);
  }

  const pendingTotal = await prisma.aside.count({
    where: { organizationId: manifest.organizationId, status: "PENDING" },
  });

  console.log(`\n${created} created, ${skipped} already there.`);
  console.log(`${pendingTotal} asides now pending for this organization.`);
  console.log("Nothing has been sent. Approve what you want at /dashboard/asides?status=PENDING.");
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    throw new Error(`${SOURCE_DIR} does not exist.`);
  }
  mkdirSync(WORK_DIR, { recursive: true });

  const organization = await resolveOrganization();
  const manifest = await report(organization);

  if (!apply) {
    console.log("\nReport only. Nothing was uploaded and no rows were created.");
    return;
  }

  if (manifest.rows.length === 0) {
    console.log("\nNothing usable to import.");
    return;
  }

  console.log("");
  await applyManifest(manifest);
}

main()
  .catch((error) => {
    if (error instanceof UnusableModelError) {
      console.error(modelRejectionMessage(error));
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

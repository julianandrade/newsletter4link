import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { composeMeme, renderMeme, MAX_WIDTH } from "../lib/memes/render";
import {
  MEME_TEMPLATES,
  findTemplate,
  validateTemplate,
  type MemeTemplate,
} from "../lib/memes/templates";


/**
 * Render one meme and look at it.
 *
 * The gate on the rest of the meme work. A renderer that passes its tests can still produce
 * something nobody would send: an outline too thin against a busy photo, a caption sitting
 * over a face, type so shrunk by a long line that it reads as a caption rather than a joke.
 * None of that is visible from an assertion, so this writes a file and you open it.
 *
 *     npx tsx scripts/render-meme.ts --list
 *     npx tsx scripts/render-meme.ts <template-id> "top line" "bottom line"
 *     npx tsx scripts/render-meme.ts --stress <template-id>
 *     npx tsx scripts/render-meme.ts --selftest
 *     npx tsx scripts/render-meme.ts --sheet
 *
 * `--sheet` renders every template at once and tiles them into one image, captioning each
 * zone with its own `role` string. That is the fastest way to check a whole manifest: a box
 * in the wrong place is obvious, and so is a role that describes a different panel from the
 * one its text landed in.
 *
 * `--stress` renders the same template three times, with a short caption, a realistic one
 * and an absurd one, so the autofit range can be judged at a glance rather than believed.
 *
 * `--selftest` needs no template at all: it composes onto a generated canvas, which is how
 * the outline and the placement can be checked before any real template exists.
 */

const WORK_DIR = join(process.cwd(), "scripts/.meme-import");

/** Three lengths that between them show what autofit does to the type size. */
const STRESS = [
  { label: "short", text: "A IA JA SABE O TEU CARGO" },
  {
    label: "real",
    text: "QUANDO A IA APRENDE O TEU CARGO MAIS DEPRESSA DO QUE TU CONSEGUES ALMOCAR",
  },
  {
    label: "absurd",
    text: "QUANDO A IA APRENDE O TEU CARGO MAIS DEPRESSA DO QUE TU CONSEGUES ALMOCAR E AINDA MARCA A REUNIAO DE SEGUIMENTO PARA AS OITO DA MANHA DE SEXTA COM QUARENTA SLIDES ANEXADOS AO CONVITE E TODA A EQUIPA EM COPIA",
  },
];

/** The stand-in used by --selftest, so the renderer is checkable with an empty registry. */
const SELFTEST_TEMPLATE: MemeTemplate = {
  id: "selftest",
  file: "selftest.png",
  width: 1200,
  height: 960,
  format: "A generated canvas. Two boxes, top and bottom, the way most meme formats sit.",
  zones: [
    {
      x: 40,
      y: 30,
      w: 1120,
      h: 190,
      align: "centre",
      valign: "centre",
      ink: "white-outlined",
      role: "the setup",
    },
    {
      x: 40,
      y: 740,
      w: 1120,
      h: 190,
      align: "centre",
      valign: "centre",
      ink: "white-outlined",
      role: "the payoff",
    },
  ],
};

/** A mid-grey gradient: busy enough that a missing outline is obvious, plain enough to read over. */
async function selftestCanvas(): Promise<Buffer> {
  const { width, height } = SELFTEST_TEMPLATE;

  return sharp({
    create: { width, height, channels: 3, background: { r: 96, g: 116, b: 132 } },
  })
    .composite([
      {
        input: {
          create: {
            width,
            height: Math.round(height / 2),
            channels: 3,
            background: { r: 176, g: 182, b: 168 },
          },
        },
        top: Math.round(height / 4),
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

async function write(name: string, bytes: Buffer): Promise<void> {
  const path = join(WORK_DIR, name);
  writeFileSync(path, bytes);
  const meta = await sharp(bytes).metadata();
  console.log(`  ${name}  ${meta.width}x${meta.height}  ${Math.round(bytes.byteLength / 1024)}KB`);
}

function list(): void {
  if (MEME_TEMPLATES.length === 0) {
    console.log("No templates registered yet.");
    console.log("Drop the images in public/meme-templates/ and add entries to lib/memes/templates.ts.");
    console.log("Meanwhile: npx tsx scripts/render-meme.ts --selftest");
    return;
  }

  console.log(`${MEME_TEMPLATES.length} templates:\n`);
  for (const template of MEME_TEMPLATES) {
    const problems = validateTemplate(template);
    const flag = problems.length ? "  BAD ZONES" : "";
    console.log(`  ${template.id.padEnd(24)} ${template.width}x${template.height}  ${template.zones.length} zones${flag}`);
    for (const problem of problems) console.log(`      ${problem}`);
  }
}

async function selftest(): Promise<void> {
  console.log("Rendering the built-in stand-in template. No template files needed.\n");
  const canvas = await selftestCanvas();

  for (const { label, text } of STRESS) {
    const bytes = await composeMeme(canvas, SELFTEST_TEMPLATE, [
      text,
      "E A NEWSLETTER SAI NA SEXTA",
    ]);
    await write(`selftest-${label}.jpg`, bytes);
  }

  console.log(`\nWritten to ${WORK_DIR}. Open them.`);
  console.log("What to look for: the outline separating the type from both bands, the top");
  console.log("caption inside its box, and the absurd one shrunk rather than cut off.");
}

async function stress(id: string): Promise<void> {
  const template = findTemplate(id);
  if (!template) throw new Error(`No template with id "${id}". Try --list.`);

  const problems = validateTemplate(template);
  if (problems.length) {
    throw new Error(`Template "${id}" has bad zones:\n  ${problems.join("\n  ")}`);
  }

  console.log(`Stressing "${id}" across three caption lengths.\n`);

  for (const { label, text } of STRESS) {
    // The same text in every zone: this is about the type size, not about the joke.
    const captions = template.zones.map(() => text);
    await write(`${id}-${label}.jpg`, await renderMeme(template, captions));
  }

  console.log(`\nWritten to ${WORK_DIR}.`);
}

async function one(id: string, captions: string[]): Promise<void> {
  const template = findTemplate(id);
  if (!template) throw new Error(`No template with id "${id}". Try --list.`);

  const problems = validateTemplate(template);
  if (problems.length) {
    throw new Error(`Template "${id}" has bad zones:\n  ${problems.join("\n  ")}`);
  }

  // Caught here rather than inside composeMeme so the message can say what the zones are for.
  if (captions.length !== template.zones.length) {
    const roles = template.zones.map((zone, index) => `${index + 1}. ${zone.role}`).join("\n  ");
    throw new Error(
      `"${id}" needs ${template.zones.length} captions, got ${captions.length}.\n  ${roles}`
    );
  }

  /**
   * A template whose stated dimensions do not match the file is worth catching here: every
   * zone box was measured against the real pixels, so a mismatch means every box is wrong.
   */
  const actual = await sharp(readFileSync(join(process.cwd(), "public/meme-templates", template.file))).metadata();
  if (actual.width !== template.width || actual.height !== template.height) {
    throw new Error(
      `"${id}" claims ${template.width}x${template.height} but the file is ${actual.width}x${actual.height}. ` +
        `The zone boxes are in the file's own space, so fix the manifest before rendering.`
    );
  }

  await write(`${id}.jpg`, await renderMeme(template, captions));
  console.log(`\nWritten to ${WORK_DIR}. Downscaled to at most ${MAX_WIDTH}px wide, as the email gets it.`);
}

/**
 * Every template in one image, each zone captioned with what that zone is for.
 *
 * Using the `role` string as the caption rather than a lorem line is the point: it checks
 * the box and the description together. A zone whose role says "what is preferred instead"
 * sitting in the top panel is a bug you can see, and no assertion would ever have caught it.
 */
async function sheet(): Promise<void> {
  if (MEME_TEMPLATES.length === 0) {
    console.log("No templates registered. Nothing to tile.");
    return;
  }

  const COLS = 4;
  const CELL = 420;
  const LABEL = 30;

  console.log(`Rendering ${MEME_TEMPLATES.length} templates...\n`);

  const cells: Array<{ id: string; buffer: Buffer }> = [];
  const failures: string[] = [];

  for (const template of MEME_TEMPLATES) {
    const problems = validateTemplate(template);
    if (problems.length) {
      failures.push(`${template.id}: ${problems.join("; ")}`);
      continue;
    }

    try {
      const captions = template.zones.map((zone) => zone.role.toUpperCase());
      cells.push({ id: template.id, buffer: await renderMeme(template, captions) });
      console.log(`  ${template.id}`);
    } catch (error) {
      failures.push(`${template.id}: ${error instanceof Error ? error.message : error}`);
      console.log(`  ${template.id} FAILED`);
    }
  }

  const rows = Math.ceil(cells.length / COLS);
  const layers: sharp.OverlayOptions[] = [];

  for (const [index, cell] of cells.entries()) {
    const left = (index % COLS) * CELL;
    const top = Math.floor(index / COLS) * (CELL + LABEL);

    const thumb = await sharp(cell.buffer)
      .resize({ width: CELL - 8, height: CELL - 8, fit: "contain", background: "#1b1b1b" })
      .png()
      .toBuffer();

    const label = await sharp({
      text: {
        text: `<span foreground="white">${index + 1}. ${cell.id}</span>`,
        fontfile: join(process.cwd(), "public/fonts/Anton-Regular.ttf"),
        font: "Anton",
        width: CELL - 14,
        height: LABEL - 8,
        align: "left",
        rgba: true,
      },
    })
      .png()
      .toBuffer();

    layers.push({ input: thumb, left: left + 4, top: top + LABEL });
    layers.push({ input: label, left: left + 7, top: top + 4 });
  }

  const out = await sharp({
    create: {
      width: COLS * CELL,
      height: rows * (CELL + LABEL),
      channels: 3,
      background: "#1b1b1b",
    },
  })
    .composite(layers)
    .png()
    .toBuffer();

  writeFileSync(join(WORK_DIR, "sheet.png"), out);

  console.log(`\n${cells.length} rendered, ${failures.length} failed.`);
  for (const failure of failures) console.log(`  ${failure}`);
  console.log(`\n${join(WORK_DIR, "sheet.png")}`);
  console.log("Check each caption is in the panel its role describes.");
}

async function main() {
  mkdirSync(WORK_DIR, { recursive: true });

  const args = process.argv.slice(2);

  if (args.includes("--sheet")) {
    await sheet();
    return;
  }

  if (args.length === 0 || args.includes("--list")) {
    list();
    return;
  }

  if (args.includes("--selftest")) {
    await selftest();
    return;
  }

  if (args[0] === "--stress") {
    const id = args[1];
    if (!id) throw new Error("--stress needs a template id.");
    await stress(id);
    return;
  }

  const [id, ...captions] = args;
  await one(id, captions);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

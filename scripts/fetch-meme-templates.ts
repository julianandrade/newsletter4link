import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { sniffImageType } from "../lib/media/sniff";

/**
 * Fetch blank meme templates into public/meme-templates/.
 *
 * The templates have to be blank, and that is harder to satisfy by hand than it sounds. The
 * first batch supplied here was 46 browser screenshots of imgflip pages: every file exactly
 * 1540x784, each one a finished meme carrying somebody else's caption and an imgflip.com
 * watermark, with the actual picture sitting in about 450px of a black letterbox. Unusable
 * twice over, and not obviously so until measured.
 *
 * api.imgflip.com/get_memes answers with the blank image behind each format, its true
 * dimensions, and `box_count`: how many captions the format takes. That last field is the
 * one worth having, because it is the thing a person guesses wrong.
 *
 *     npx tsx scripts/fetch-meme-templates.ts              # report only
 *     npx tsx scripts/fetch-meme-templates.ts --apply      # download them
 *     npx tsx scripts/fetch-meme-templates.ts --apply --min-width=1032
 *
 * Downloaded files keep their original size. They are the space the zone boxes in
 * lib/memes/templates.ts are measured in, so resizing here would silently move every
 * caption. `lib/memes/render.ts` downscales at render time instead.
 */

const API = "https://api.imgflip.com/get_memes";
const TEMPLATE_DIR = join(process.cwd(), "public/meme-templates");
const CATALOG = join(TEMPLATE_DIR, "catalog.json");

/**
 * The email renders the block 516px wide, so 1032 is the retina ceiling. 800 is roughly
 * 1.55x: a little soft on a phone, which for a meme is a fair trade against a library so
 * small the formats repeat every month.
 */
const DEFAULT_MIN_WIDTH = 800;

const apply = process.argv.includes("--apply");
const minWidth = Number(
  process.argv.find((a) => a.startsWith("--min-width="))?.slice("--min-width=".length) ??
    DEFAULT_MIN_WIDTH
);

interface ImgflipMeme {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
}

export interface CatalogEntry {
  /** Slug used as both the filename stem and the template id. */
  id: string;
  name: string;
  file: string;
  width: number;
  height: number;
  /** How many captions the format takes. The zone count in lib/memes/templates.ts. */
  boxCount: number;
  /** Kept so a template can be traced back to what it came from. */
  sourceUrl: string;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Remove the previous contents, so a re-run cannot leave a stale template behind. */
function clearTemplates(): string[] {
  const removed: string[] = [];

  for (const file of readdirSync(TEMPLATE_DIR)) {
    // README.md is documentation for this folder, not a template.
    if (file === "README.md") continue;
    unlinkSync(join(TEMPLATE_DIR, file));
    removed.push(file);
  }

  return removed;
}

async function main() {
  if (!Number.isFinite(minWidth) || minWidth < 1) {
    throw new Error(`--min-width must be a positive number, got "${minWidth}".`);
  }

  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const response = await fetch(API);
  if (!response.ok) throw new Error(`${API} answered ${response.status}.`);

  const payload = (await response.json()) as { success: boolean; data: { memes: ImgflipMeme[] } };
  if (!payload.success) throw new Error(`${API} reported failure.`);

  const all = payload.data.memes;
  const wanted = all
    .filter((meme) => meme.width >= minWidth)
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`${all.length} templates offered, ${wanted.length} at ${minWidth}px or wider.\n`);

  for (const meme of wanted) {
    console.log(
      `  ${String(meme.width).padStart(4)}x${String(meme.height).padEnd(4)}  ${String(
        meme.box_count
      )} captions  ${meme.name}`
    );
  }

  if (!apply) {
    console.log(`\nReport only. Pass --apply to download into ${TEMPLATE_DIR}.`);
    return;
  }

  const removed = clearTemplates();
  if (removed.length) console.log(`\nRemoved ${removed.length} existing files.`);

  console.log("");
  const catalog: CatalogEntry[] = [];
  const failures: string[] = [];

  for (const meme of wanted) {
    try {
      const image = await fetch(meme.url);
      if (!image.ok) throw new Error(`${image.status}`);

      const bytes = Buffer.from(await image.arrayBuffer());

      /**
       * The bytes decide the extension, not the URL. The same rule the upload route follows,
       * and the same reason: the last batch arrived as JPEG wearing .png, which is exactly
       * the kind of thing that makes a later "why does this not load" hard to see.
       */
      const detected = sniffImageType(bytes);
      if (!detected) throw new Error("not a PNG, JPEG or GIF by its bytes");

      const extension = detected === "image/png" ? "png" : detected === "image/gif" ? "gif" : "jpg";
      const id = slug(meme.name);
      const file = `${id}.${extension}`;

      writeFileSync(join(TEMPLATE_DIR, file), bytes);

      /**
       * Measured from the file rather than trusted from the API. The zone boxes are written
       * against these numbers, so a disagreement here would put every caption in the wrong
       * place, and `scripts/render-meme.ts` refuses a template whose manifest and file
       * disagree.
       */
      const meta = await sharp(bytes).metadata();

      catalog.push({
        id,
        name: meme.name,
        file,
        width: meta.width ?? meme.width,
        height: meta.height ?? meme.height,
        boxCount: meme.box_count,
        sourceUrl: meme.url,
      });

      console.log(`  ${file.padEnd(38)} ${meta.width}x${meta.height}  ${meme.box_count} captions`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${meme.name}: ${reason}`);
      console.log(`  ${meme.name} FAILED: ${reason}`);
    }
  }

  writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  console.log(`\n${catalog.length} downloaded, ${failures.length} failed.`);
  console.log(`Catalog: ${CATALOG}`);
  console.log("Next: give each one a format and per-zone roles in lib/memes/templates.ts,");
  console.log("then look at the output with: npx tsx scripts/render-meme.ts --stress <id>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

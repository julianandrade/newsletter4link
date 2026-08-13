/**
 * Compositing a caption onto a meme template.
 *
 * The reason this exists rather than an API call: the tool that produced the first batch of
 * memes clipped its own captions. Three of the thirty-two have text running off an edge or
 * under a watermark, which is a renderer being handed more text than it left room for. No
 * paid tier fixes that.
 *
 * This cannot do it. libvips sizes text to a box when given both a width and a height, so
 * the font shrinks and the line count grows until the caption fits the zone. Long text comes
 * out small, never cut. That single property is the whole argument for owning the render.
 *
 * The font travels with the repo and is passed to pango by absolute path, so nothing depends
 * on a font being installed where this runs. That is the usual way server-side text
 * rendering breaks on a serverless host, and `fontfile` sidesteps it: no FONTCONFIG_PATH, no
 * system font, no difference between a laptop and a Vercel function.
 *
 * Output matches what scripts/import-memes.ts produces, 1032px wide JPEG, because both feed
 * the same 516px-wide email block and there is no reason for two answers.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import type { MemeTemplate, MemeZone } from "./templates";

/** Bundled with the repo. Anton, SIL OFL 1.1: the open stand-in for Impact, which is not ours. */
export const FONT_PATH = join(process.cwd(), "public/fonts/Anton-Regular.ttf");

/** Templates live here because Next ships public/ with the deployment, so this path resolves at runtime. */
export const TEMPLATE_DIR = join(process.cwd(), "public/meme-templates");

/**
 * A ceiling, not a target: 2x the 516px the email renders, and the same one the import
 * script uses. A template narrower than this keeps its own width rather than being blown up,
 * so the render is never softer than the source.
 */
export const MAX_WIDTH = 1032;

const JPEG_QUALITY = 82;

/**
 * Pango reads its input as markup, so a caption is untrusted text going into a parser.
 *
 * An unescaped `&` makes pango fail the whole render, and an unescaped `<b>` silently
 * restyles the line. Captions come from a model, which CLAUDE.md LLM05 says to treat as
 * untrusted input, and from an editor's keyboard, where an ampersand is ordinary.
 *
 * Ampersand first: escaping it after the angle brackets would re-escape the entities the
 * bracket replacements just introduced.
 */
export function escapePango(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * How thick the black outline is, in pixels.
 *
 * Proportional to the fitted text rather than fixed, because autofit means the same zone can
 * hold 90pt text or 20pt text depending on the caption, and a 3px outline that reads as bold
 * on the small one disappears on the large one. The bounds are taste: below 2 it stops
 * separating the text from a busy photo, above 10 it starts closing up the counters.
 */
function strokeWidth(textHeight: number): number {
  return Math.min(10, Math.max(2, Math.round(textHeight / 28)));
}

/** The eight directions an outline is painted in. A cardinal-only pass leaves the diagonals thin. */
const OUTLINE_OFFSETS: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

interface TextBitmap {
  buffer: Buffer;
  width: number;
  height: number;
}

/** One pango render of the caption, sized to the zone, in a single colour. */
async function renderText(
  text: string,
  zone: MemeZone,
  colour: "white" | "black"
): Promise<TextBitmap> {
  const { data, info } = await sharp({
    text: {
      // The colour goes in the markup rather than through a tint, so one pango pass produces
      // a finished bitmap and the alpha edges stay anti-aliased.
      text: `<span foreground="${colour}">${escapePango(text)}</span>`,
      fontfile: FONT_PATH,
      font: "Anton",
      // Both, and this is the load-bearing line: with a width and a height, libvips fits the
      // text to the box. With width alone it would wrap and grow past the bottom.
      width: Math.round(zone.w),
      height: Math.round(zone.h),
      align: zone.align,
      wrap: "word",
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height };
}

/**
 * The caption as one bitmap, outlined, on its own transparent canvas.
 *
 * Built in its own canvas rather than composited straight onto the base so the outline has
 * somewhere to go: a caption sitting flush against the top of the frame would push its
 * offset copies to a negative coordinate, which sharp refuses. Padding by the stroke width
 * means the nine passes always land inside, and the caller then places one bitmap.
 */
async function outlinedText(text: string, zone: MemeZone): Promise<TextBitmap> {
  if (zone.ink === "black") {
    return renderText(text, zone, "black");
  }

  const white = await renderText(text, zone, "white");
  const black = await renderText(text, zone, "black");

  // Same text in the same box, so the two agree; taking the max costs nothing and means a
  // disagreement crops nothing.
  const textWidth = Math.max(white.width, black.width);
  const textHeight = Math.max(white.height, black.height);
  const stroke = strokeWidth(textHeight);

  const { data, info } = await sharp({
    create: {
      width: textWidth + stroke * 2,
      height: textHeight + stroke * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      ...OUTLINE_OFFSETS.map(([dx, dy]) => ({
        input: black.buffer,
        left: stroke + dx * stroke,
        top: stroke + dy * stroke,
      })),
      { input: white.buffer, left: stroke, top: stroke },
    ])
    .png()
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height };
}

/** Where the fitted bitmap sits in its zone, clamped so it cannot fall outside the frame. */
function place(
  bitmap: TextBitmap,
  zone: MemeZone,
  frame: { width: number; height: number }
): { left: number; top: number } {
  const slackX = zone.w - bitmap.width;
  const slackY = zone.h - bitmap.height;

  const alignFactor = zone.align === "left" ? 0 : zone.align === "right" ? 1 : 0.5;
  const valignFactor = zone.valign === "top" ? 0 : zone.valign === "bottom" ? 1 : 0.5;

  const left = Math.round(zone.x + slackX * alignFactor);
  const top = Math.round(zone.y + slackY * valignFactor);

  return {
    left: Math.max(0, Math.min(left, frame.width - bitmap.width)),
    top: Math.max(0, Math.min(top, frame.height - bitmap.height)),
  };
}

export class MemeRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemeRenderError";
  }
}

/**
 * Composite captions onto a base image already in memory.
 *
 * Separate from `renderMeme` so the compositing can be tested against a generated canvas
 * with no template file on disk, which is what the unit tests do.
 *
 * The caption count has to match the zones exactly. A missing caption would render a
 * template with an empty panel, which reads as a bug rather than as a joke, and a spare one
 * would be silently dropped.
 */
export async function composeMeme(
  base: Buffer,
  template: MemeTemplate,
  captions: string[]
): Promise<Buffer> {
  if (captions.length !== template.zones.length) {
    throw new MemeRenderError(
      `Template "${template.id}" has ${template.zones.length} zones but ${captions.length} captions were given.`
    );
  }

  const blank = captions.findIndex((caption) => caption.trim().length === 0);
  if (blank !== -1) {
    throw new MemeRenderError(
      `Caption ${blank} for template "${template.id}" is empty. Every zone needs text.`
    );
  }

  const metadata = await sharp(base).metadata();
  const frame = { width: metadata.width ?? 0, height: metadata.height ?? 0 };

  if (frame.width === 0 || frame.height === 0) {
    throw new MemeRenderError(`Could not read the dimensions of template "${template.id}".`);
  }

  const layers = await Promise.all(
    template.zones.map(async (zone, index) => {
      const bitmap = await outlinedText(captions[index].trim(), zone);
      return { input: bitmap.buffer, ...place(bitmap, zone, frame) };
    })
  );

  /**
   * Two pipelines, and it has to be two.
   *
   * sharp applies its operations in a fixed order rather than the order they are called in,
   * and resize comes before composite. Chaining them would downscale the base to MAX_WIDTH
   * first and then drop text sized for the original frame onto it: every zone coordinate
   * would be in the wrong space, and a caption wider than the shrunken base fails outright
   * with "Image to composite must have same dimensions or smaller".
   *
   * So compose at the template's own scale, where the zone boxes were measured, and downscale
   * the finished image afterwards. The intermediate PNG keeps the text edges clean; a JPEG
   * here would compress them twice.
   */
  const composed = await sharp(base).composite(layers).png().toBuffer();

  return sharp(composed)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/** Read a template off disk and render it. The path callers use. */
export async function renderMeme(
  template: MemeTemplate,
  captions: string[]
): Promise<Buffer> {
  let base: Buffer;

  try {
    base = await readFile(join(TEMPLATE_DIR, template.file));
  } catch {
    throw new MemeRenderError(
      `Template file "${template.file}" is missing from public/meme-templates/.`
    );
  }

  return composeMeme(base, template, captions);
}

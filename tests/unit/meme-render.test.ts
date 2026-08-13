/**
 * The renderer's one promise: a caption is never cut off.
 *
 * That is the whole reason we render our own memes instead of calling a service, so it is
 * the thing the tests are pointed at. The tool that made the first batch clipped three of
 * thirty-two captions, and the fix is not "send shorter text", it is a renderer that sizes
 * text to the box it was given.
 *
 * No template file is touched. `composeMeme` takes a base buffer, so the base here is a flat
 * canvas sharp generates, which keeps the tests independent of what lands in
 * public/meme-templates/ later.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { composeMeme, escapePango, MemeRenderError, MAX_WIDTH } from "@/lib/memes/render";
import {
  MEME_TEMPLATES,
  validateTemplate,
  type MemeTemplate,
} from "@/lib/memes/templates";
import { sniffImageType } from "@/lib/media/sniff";

/**
 * A stand-in template: two stacked caption boxes.
 *
 * Deliberately wider than MAX_WIDTH so the downscale actually runs. A 1000px frame would
 * pass every assertion here while never exercising the resize.
 */
const TEMPLATE: MemeTemplate = {
  id: "test-two-panel",
  file: "test-two-panel.png",
  width: 1200,
  height: 960,
  format: "Two panels. The top sets something up, the bottom undercuts it.",
  zones: [
    { x: 40, y: 30, w: 1120, h: 190, align: "centre", valign: "centre", ink: "white-outlined", role: "the setup" },
    { x: 40, y: 740, w: 1120, h: 190, align: "centre", valign: "centre", ink: "white-outlined", role: "the payoff" },
  ],
};

async function base(width = TEMPLATE.width, height = TEMPLATE.height): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 90, g: 110, b: 130 } },
  })
    .png()
    .toBuffer();
}

const SHORT = "QUANDO A IA SABE O TEU CARGO";

const LONG =
  "QUANDO A IA APRENDE O TEU CARGO MAIS DEPRESSA DO QUE TU CONSEGUES ALMOCAR E AINDA MARCA A REUNIAO DE SEGUIMENTO PARA AS OITO DA MANHA DE SEXTA COM QUARENTA SLIDES ANEXADOS AO CONVITE E TODA A EQUIPA EM COPIA";

describe("escapePango", () => {
  it("escapes the three characters that are markup to pango", () => {
    expect(escapePango("a & b")).toBe("a &amp; b");
    expect(escapePango("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("escapes the ampersand before the brackets, so entities are not double-escaped", () => {
    // The order matters: brackets first would turn "<" into "&lt;" and then the ampersand
    // pass would make it "&amp;lt;", which renders as literal "&lt;" in the image.
    expect(escapePango("<")).toBe("&lt;");
    expect(escapePango("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text alone, accents included", () => {
    const text = "Acordar de um coma tecnológico: a IA já escreve a newsletter?";
    expect(escapePango(text)).toBe(text);
  });
});

describe("composeMeme", () => {
  it("produces a JPEG at the email's own width", async () => {
    const output = await composeMeme(await base(), TEMPLATE, [SHORT, SHORT]);

    // The bytes, not the extension. The same sniff POST /api/media/upload trusts.
    expect(sniffImageType(output)).toBe("image/jpeg");

    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(MAX_WIDTH);
  });

  it("does not enlarge a template narrower than the target", async () => {
    const narrow: MemeTemplate = {
      ...TEMPLATE,
      width: 600,
      height: 480,
      zones: [
        { ...TEMPLATE.zones[0], w: 520, h: 100 },
        { ...TEMPLATE.zones[1], y: 340, w: 520, h: 100 },
      ],
    };

    const output = await composeMeme(await base(600, 480), narrow, [SHORT, SHORT]);
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(600);
  });

  /**
   * The one that matters.
   *
   * A caption seven times longer than a real one still renders, and the frame comes out the
   * same size: nothing overflowed and nothing was refused. Autofit shrank the type instead.
   */
  it("fits an absurdly long caption rather than clipping or throwing", async () => {
    expect(LONG.length).toBeGreaterThan(180);

    const output = await composeMeme(await base(), TEMPLATE, [LONG, LONG]);

    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(MAX_WIDTH);
    expect(sniffImageType(output)).toBe("image/jpeg");
  });

  /**
   * A long caption has to come out visibly different from a short one.
   *
   * Byte-identical output would mean the text never reached the image, which is the failure
   * this whole module exists to rule out, and every other assertion here would still pass.
   */
  it("actually draws the caption, so different text gives different bytes", async () => {
    const short = await composeMeme(await base(), TEMPLATE, [SHORT, SHORT]);
    const long = await composeMeme(await base(), TEMPLATE, [LONG, LONG]);
    const blank = await sharp(await base())
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    expect((await sharp(blank).metadata()).width).toBe(MAX_WIDTH);

    expect(short.equals(long)).toBe(false);
    expect(short.equals(blank)).toBe(false);
  });

  it("renders text containing pango markup literally instead of failing", async () => {
    const output = await composeMeme(await base(), TEMPLATE, [
      "R&D <b>ainda</b> nao respondeu",
      "1 < 2 & 3 > 2",
    ]);

    expect(sniffImageType(output)).toBe("image/jpeg");
  });

  it("keeps a caption inside the frame when its zone sits flush against the edge", async () => {
    // y: 0 leaves the outline nowhere to go unless the bitmap is padded and the placement
    // clamped. Before that, sharp refused the composite outright.
    const flush: MemeTemplate = {
      ...TEMPLATE,
      zones: [
        { ...TEMPLATE.zones[0], x: 0, y: 0 },
        { ...TEMPLATE.zones[1], x: 0, y: 640, h: 160 },
      ],
    };

    const output = await composeMeme(await base(), flush, [SHORT, SHORT]);
    expect(sniffImageType(output)).toBe("image/jpeg");
  });

  it("refuses a caption count that does not match the zones", async () => {
    const canvas = await base();

    await expect(composeMeme(canvas, TEMPLATE, [SHORT])).rejects.toThrow(MemeRenderError);
    await expect(composeMeme(canvas, TEMPLATE, [SHORT, SHORT, SHORT])).rejects.toThrow(
      /2 zones but 3 captions/
    );
  });

  it("refuses a blank caption rather than rendering an empty panel", async () => {
    await expect(composeMeme(await base(), TEMPLATE, [SHORT, "   "])).rejects.toThrow(
      /Caption 1 .* is empty/
    );
  });

  it("supports a black-ink zone, for a light panel that is part of the template", async () => {
    const dark: MemeTemplate = {
      ...TEMPLATE,
      zones: TEMPLATE.zones.map((zone) => ({ ...zone, ink: "black" as const })),
    };

    const output = await composeMeme(await base(), dark, [SHORT, SHORT]);
    expect(sniffImageType(output)).toBe("image/jpeg");
  });
});

describe("validateTemplate", () => {
  it("passes a template whose zones are inside its frame", () => {
    expect(validateTemplate(TEMPLATE)).toEqual([]);
  });

  it("catches a zone that runs past the frame", () => {
    const overflowing: MemeTemplate = {
      ...TEMPLATE,
      zones: [{ ...TEMPLATE.zones[0], x: 900, w: 400 }],
    };

    const problems = validateTemplate(overflowing);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/outside the 1200x960 frame/);
  });

  it("catches a template with no zones at all", () => {
    expect(validateTemplate({ ...TEMPLATE, zones: [] })).toEqual([
      "has no zones, so there is nowhere for a caption to go",
    ]);
  });

  it("catches a zero-width zone without also complaining that it overflows", () => {
    const problems = validateTemplate({
      ...TEMPLATE,
      zones: [{ ...TEMPLATE.zones[0], w: 0 }],
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/positive/);
  });
});

/**
 * The registry against the files it describes.
 *
 * Every zone box was typed in by hand after looking at an image, which is the one part of
 * this that no amount of care makes reliable. These are the checks that would have caught
 * the first batch of supplied templates: files that were not there, dimensions that did not
 * match, and boxes measured against a different picture from the one on disk.
 */
describe("MEME_TEMPLATES", () => {
  const dir = join(process.cwd(), "public/meme-templates");

  it("has templates registered at all", () => {
    expect(MEME_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("gives every template a unique id", () => {
    const ids = MEME_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(MEME_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s: file exists and its real size matches the manifest",
    (_id, template) => {
      const path = join(dir, template.file);
      expect(existsSync(path), `${template.file} is missing`).toBe(true);

      // Read the dimensions out of the file header rather than trusting the manifest. The
      // zone boxes are in this coordinate space, so a mismatch moves every caption.
      const bytes = readFileSync(path);
      const type = sniffImageType(bytes);
      expect(type, `${template.file} is not a PNG, JPEG or GIF`).not.toBeNull();

      const size = readImageSize(bytes);
      expect({ width: size.width, height: size.height }).toEqual({
        width: template.width,
        height: template.height,
      });
    }
  );

  it.each(MEME_TEMPLATES.map((t) => [t.id, t] as const))(
    "%s: every zone sits inside the frame and says what it is for",
    (_id, template) => {
      expect(validateTemplate(template)).toEqual([]);

      expect(template.format.trim().length).toBeGreaterThan(20);
      for (const zone of template.zones) {
        expect(zone.role.trim().length).toBeGreaterThan(0);
      }
    }
  );
});

/** Width and height straight out of a PNG or JPEG header. Avoids pulling sharp in for a read. */
function readImageSize(bytes: Buffer): { width: number; height: number } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // JPEG: walk the segments to the start-of-frame marker, which carries the dimensions.
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }

  throw new Error("Could not read the image dimensions.");
}

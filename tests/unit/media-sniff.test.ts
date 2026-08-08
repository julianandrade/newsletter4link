import { describe, expect, it } from "vitest";
import { isAnimatedGif, sniffImageType } from "@/lib/media/sniff";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);

function bytesOf(text: string): Uint8Array {
  return new Uint8Array([...text].map((character) => character.charCodeAt(0)));
}

describe("sniffImageType", () => {
  it("recognises PNG, JPEG and both GIF versions", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF87)).toBe("image/gif");
    expect(sniffImageType(GIF89)).toBe("image/gif");
  });

  it("refuses an SVG, which a public bucket must never serve", () => {
    // The bucket is public and Supabase serves back whatever content type it was given,
    // so an accepted SVG is script running on our own domain.
    expect(sniffImageType(bytesOf('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(bytesOf("<?xml version=\"1.0\"?><svg>"))).toBeNull();
  });

  it("refuses HTML dressed as an image", () => {
    expect(sniffImageType(bytesOf("<!DOCTYPE html><html>"))).toBeNull();
  });

  it("refuses WebP, which Outlook on Windows does not render", () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

    expect(sniffImageType(webp)).toBeNull();
  });

  it("refuses a buffer too short to identify", () => {
    expect(sniffImageType(new Uint8Array([0x89]))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });

  it("reads only the leading bytes, so a PNG mentioning svg in its data still passes", () => {
    const png = new Uint8Array([...PNG, ...bytesOf("<svg>")]);

    expect(sniffImageType(png)).toBe("image/png");
  });
});

describe("isAnimatedGif", () => {
  it("finds the loop extension a looping GIF carries", () => {
    const bytes = new Uint8Array([...GIF89, ...bytesOf("NETSCAPE2.0"), 0, 0]);

    expect(isAnimatedGif(bytes)).toBe(true);
  });

  it("says no for a still GIF", () => {
    expect(isAnimatedGif(GIF89)).toBe(false);
  });

  it("says no for anything that is not a GIF", () => {
    const pngWithMarker = new Uint8Array([...PNG, ...bytesOf("NETSCAPE2.0")]);

    expect(isAnimatedGif(PNG)).toBe(false);
    expect(isAnimatedGif(pngWithMarker)).toBe(false);
  });
});

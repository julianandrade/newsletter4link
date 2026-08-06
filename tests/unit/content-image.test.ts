import { describe, expect, it } from "vitest";
import { firstContentImage } from "@/lib/email/content-image";

describe("firstContentImage", () => {
  it("finds the publisher's own image in content:encoded", () => {
    const content = `<p>Lead paragraph.</p><img src="https://cdn.techcrunch.com/story.jpg" width="1200" height="675"><p>More.</p>`;
    expect(firstContentImage(content)).toBe("https://cdn.techcrunch.com/story.jpg");
  });

  it("returns undefined when there is no image, which is the common case", () => {
    expect(firstContentImage("<p>Just words.</p>")).toBeUndefined();
    expect(firstContentImage("")).toBeUndefined();
    expect(firstContentImage(null)).toBeUndefined();
    expect(firstContentImage(undefined)).toBeUndefined();
  });

  it("takes the first plausible image, not merely the first image", () => {
    const content =
      `<img src="https://feeds.feedburner.com/~ff/pixel.png">` +
      `<img src="https://cdn.example.com/real-story.jpg">`;
    expect(firstContentImage(content)).toBe("https://cdn.example.com/real-story.jpg");
  });
});

describe("what it refuses, which matters more than what it accepts", () => {
  it("refuses a tracking pixel by its declared size", () => {
    const content = `<img src="https://cdn.example.com/p.png" width="1" height="1">`;
    expect(firstContentImage(content)).toBeUndefined();
  });

  it("refuses anything up to 32px, because a 16px icon is not a photograph", () => {
    expect(
      firstContentImage(`<img src="https://cdn.example.com/i.png" width="16" height="16">`)
    ).toBeUndefined();
  });

  it("accepts an image with no declared size, since most feeds declare none", () => {
    expect(firstContentImage(`<img src="https://cdn.example.com/i.jpg">`)).toBe(
      "https://cdn.example.com/i.jpg"
    );
  });

  it("refuses known non-editorial hosts and paths", () => {
    for (const url of [
      "https://gravatar.com/avatar/abc",
      "https://stats.wordpress.com/b.gif",
      "https://www.google-analytics.com/collect.png",
      "https://cdn.example.com/logo/header.png",
      "https://cdn.example.com/tracking/open.png",
      "https://sb.scorecardresearch.com/p.png",
    ]) {
      expect(firstContentImage(`<img src="${url}" width="600">`), url).toBeUndefined();
    }
  });

  it("refuses formats an email client will not render", () => {
    for (const url of [
      "https://cdn.example.com/a.svg",
      "https://cdn.example.com/a.webp",
      "https://cdn.example.com/a.avif",
      "https://cdn.example.com/a.ico",
    ]) {
      expect(firstContentImage(`<img src="${url}">`), url).toBeUndefined();
    }
  });

  it("refuses a relative path, which never resolves in an inbox", () => {
    expect(firstContentImage(`<img src="/assets/story.jpg">`)).toBeUndefined();
    expect(firstContentImage(`<img src="story.jpg">`)).toBeUndefined();
  });

  it("refuses a data URI and any other scheme", () => {
    expect(
      firstContentImage(`<img src="data:image/png;base64,iVBORw0KGgo=">`)
    ).toBeUndefined();
    expect(firstContentImage(`<img src="javascript:alert(1)">`)).toBeUndefined();
  });

  it("refuses a tag with no src at all", () => {
    expect(firstContentImage(`<img alt="nothing here">`)).toBeUndefined();
  });

  it("handles single quotes, extra attributes and odd spacing", () => {
    const content = `<img  class='x'  data-y="1"   src = 'https://cdn.example.com/a.jpg'  loading="lazy" >`;
    expect(firstContentImage(content)).toBe("https://cdn.example.com/a.jpg");
  });

  it("does not leak state between calls through the size regex", () => {
    // The dimension pattern is global and module-level, so lastIndex has to be reset per tag or
    // the second call reads from the middle of the string and misses.
    const tiny = `<img src="https://cdn.example.com/p.png" width="1" height="1">`;
    expect(firstContentImage(tiny)).toBeUndefined();
    expect(firstContentImage(tiny)).toBeUndefined();
  });
});

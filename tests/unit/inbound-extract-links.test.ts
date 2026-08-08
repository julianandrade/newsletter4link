import { describe, expect, it } from "vitest";
import { readableEmail } from "@/lib/inbound/extract";

/**
 * Links that cannot be an article, dropped before the model can pair a title with one.
 *
 * On 8 August 2026 three articles were created from `substackcdn.com/image/fetch/...`
 * URLs: a Substack email wraps its section images in an anchor, and `readableEmail`
 * removes the `<img>` but kept the anchor's href. The model then paired the nearby
 * heading with a link to a JPEG, and the dashboard offered an article whose "source"
 * opened a picture.
 *
 * The same email carried 84 links, of which most were Substack's own app plumbing:
 * nine identical `app-link/post` URLs, a like button, a share button, a subscribe CTA.
 * Every one of them was a candidate the model could have chosen.
 */

const urls = (html: string) => readableEmail({ html }).links.map((link) => link.url);

describe("image and asset links are not articles", () => {
  it("drops a Substack CDN image the anchor wrapped", () => {
    const html = `<a href="https://substackcdn.com/image/fetch/$s_!7Lwe!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Ff937.png"><img src="x"></a>`;

    expect(urls(html)).toEqual([]);
  });

  it("drops a link whose path ends in an image extension", () => {
    for (const ext of ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]) {
      expect(urls(`<a href="https://cdn.example.com/a/b.${ext}">pic</a>`)).toEqual([]);
    }
  });

  it("keeps an article whose slug merely mentions an image format", () => {
    // Narrow on purpose: the extension has to end the path, not appear in a slug.
    expect(urls(`<a href="https://example.com/why-png-beats-jpg">Why PNG beats JPG</a>`)).toEqual([
      "https://example.com/why-png-beats-jpg",
    ]);
  });
});

describe("Substack's own plumbing is not an article", () => {
  it("drops the open-in-app links", () => {
    const html = `<a href="https://substack.com/app-link/post?publication_id=1801228&post_id=210155760">Open in app</a>`;

    expect(urls(html)).toEqual([]);
  });

  it("drops a subscribe call to action", () => {
    expect(urls(`<a href="https://sub.thursdai.news/subscribe">Subscribe</a>`)).toEqual([]);
  });

  it("drops the unsubscribe action path", () => {
    expect(
      urls(`<a href="https://patmcguinness.substack.com/action/disable_email">Unsubscribe</a>`)
    ).toEqual([]);
  });

  it("keeps a real post on open.substack.com", () => {
    const html = `<a href="https://open.substack.com/pub/thursdai/p/thursdai-aug-06">ThursdAI Aug 06</a>`;

    expect(urls(html)).toEqual(["https://open.substack.com/pub/thursdai/p/thursdai-aug-06"]);
  });
});

describe("share and login walls are not articles", () => {
  it("drops a LinkedIn login wall wrapping a share intent", () => {
    // Seen in production as an article titled "Slow poke", pointing at a login page.
    const html = `<a href="https://www.linkedin.com/uas/login?session_redirect=http%3A%2F%2Fwww.linkedin.com%2FshareArticle%3Furl%3Dhttps%3A%2F%2Fwww.itbrew.com%2Fstories%2Fx">Share</a>`;

    expect(urls(html)).toEqual([]);
  });

  it("drops a Facebook login wall wrapping a share channel", () => {
    // Seen in production as an article titled "Reviews are in".
    const html = `<a href="https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fshare_channel%2F">Share</a>`;

    expect(urls(html)).toEqual([]);
  });

  it("still drops the plain share intents it always did", () => {
    expect(urls(`<a href="https://twitter.com/intent/tweet?url=x">Tweet</a>`)).toEqual([]);
    expect(urls(`<a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>`)).toEqual([]);
  });
});

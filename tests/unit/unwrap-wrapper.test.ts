import { describe, expect, it } from "vitest";
import { cleanUrl, unwrapUrl, type HeadFetch } from "@/lib/curation/unwrap-url";
import { classifyUnwrap } from "@/lib/inbound/link-outcome";
import type { Resolver } from "@/lib/curation/url-safety";

/**
 * Wrappers that do not answer with a redirect, which is most of them.
 *
 * `unwrapUrl` used to return `unwrapped: true` for any response that was not a 3xx, on the
 * reasoning that a non-redirect means "this is where it points". That is false for the two
 * shapes newsletters actually use:
 *
 * - beehiiv's `/ss/c/` links answer 200 with an HTML page that redirects in the browser,
 *   so the wrapper was stored as the article's own address. Thirty articles in production
 *   linked to `link.mail.beehiiv.com` with `sourceUnresolved: false`, meaning the system
 *   asserted it had resolved them. The campaign parameters the user objected to were
 *   inside the wrapper and only appeared when a browser followed it, which is why
 *   `cleanUrl` could never strip them.
 * - a 403 to our user agent, which is a bot wall rather than a destination.
 *
 * Substack's own wrapper is a third case and the easy one: the target is sitting in the
 * path, base64 encoded, so it needs no network at all.
 */

const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

/** A fetch that answers from a table, so no network is used. */
const fetcher = (
  table: Record<string, { status: number; location?: string | null; body?: string }>
): HeadFetch => {
  return async (url) => {
    const row = table[url];
    if (!row) return { status: 200, location: null, body: "" };
    return { status: row.status, location: row.location ?? null, body: row.body ?? "" };
  };
};

const BEEHIIV = "https://link.mail.beehiiv.com/ss/c/u001.IOfkvli54cXRkvysRUkd";
const ARTICLE =
  "https://deepmind.google/blog/weathernext-ai-model-achieves-breakthrough-in-forecasting-cyclones/?utm_source=newsletter.theresanaiforthat.com&utm_medium=newsletter";

describe("cleanUrl strips the parameter that changes the destination", () => {
  it("removes redirect=app-store, which sends the reader to an app listing", () => {
    // Three production articles carried this. The slug was the article's; the parameter
    // made the link open the Substack app store page instead.
    expect(
      cleanUrl(
        "https://open.substack.com/pub/boghossian/p/is-the-occasional-massacre-of-gay?redirect=app-store"
      )
    ).toBe("https://open.substack.com/pub/boghossian/p/is-the-occasional-massacre-of-gay");
  });

  it("still strips the campaign parameters it always did", () => {
    expect(cleanUrl(ARTICLE)).toBe(
      "https://deepmind.google/blog/weathernext-ai-model-achieves-breakthrough-in-forecasting-cyclones/"
    );
  });
});

describe("a Substack redirect carries its own target", () => {
  it("decodes the base64 payload rather than asking the network", async () => {
    const target = "https://sub.thursdai.news/p/the-real-piece";
    const payload = Buffer.from(JSON.stringify({ e: target })).toString("base64url");

    const result = await unwrapUrl(`https://substack.com/redirect/2/${payload}`, {
      // Never called: nothing here needs a round trip.
      fetchHead: async () => {
        throw new Error("the network should not have been touched");
      },
      resolve: publicDns,
    });

    expect(result.url).toBe(target);
    expect(result.unwrapped).toBe(true);
  });

  it("leaves a payload it cannot decode alone rather than inventing a target", async () => {
    const url = "https://substack.com/redirect/2/not-base64-at-all";
    const result = await unwrapUrl(url, {
      fetchHead: fetcher({ [url]: { status: 200 } }),
      resolve: publicDns,
    });

    expect(classifyUnwrap(result)).toBe("unresolved");
  });
});

describe("a wrapper that answers 200 with an in-page redirect", () => {
  it("follows a meta refresh to the article", async () => {
    const result = await unwrapUrl(BEEHIIV, {
      fetchHead: fetcher({
        [BEEHIIV]: {
          status: 200,
          body: `<html><head><meta http-equiv="refresh" content="0;url=${ARTICLE}"></head></html>`,
        },
      }),
      resolve: publicDns,
    });

    // Resolved to the publisher, and the campaign parameters go with the cleaning.
    expect(result.url).toBe(
      "https://deepmind.google/blog/weathernext-ai-model-achieves-breakthrough-in-forecasting-cyclones/"
    );
    expect(classifyUnwrap(result)).toBe("resolved");
  });

  it("follows a JavaScript location assignment, which is what beehiiv actually serves", async () => {
    const result = await unwrapUrl(BEEHIIV, {
      fetchHead: fetcher({
        [BEEHIIV]: {
          status: 200,
          body: `<html><body><script>window.location.href = "${ARTICLE}";</script></body></html>`,
        },
      }),
      resolve: publicDns,
    });

    expect(result.url).toContain("deepmind.google");
    expect(classifyUnwrap(result)).toBe("resolved");
  });

  it("says unresolved when the wrapper reveals nothing", async () => {
    // The honest answer. What we hold is the newsletter's tracking URL, and the dashboard
    // has a chip that says exactly that.
    const result = await unwrapUrl(BEEHIIV, {
      fetchHead: fetcher({ [BEEHIIV]: { status: 200, body: "<html><body>ok</body></html>" } }),
      resolve: publicDns,
    });

    expect(result.unwrapped).toBe(false);
    expect(classifyUnwrap(result)).toBe("unresolved");
  });

  it("says unresolved when the wrapper blocks us", async () => {
    const result = await unwrapUrl(BEEHIIV, {
      fetchHead: fetcher({ [BEEHIIV]: { status: 403 } }),
      resolve: publicDns,
    });

    expect(classifyUnwrap(result)).toBe("unresolved");
  });
});

describe("an ordinary article URL is not treated as a wrapper", () => {
  it("stays resolved when the publisher answers 200 with a normal page", async () => {
    const url = "https://arstechnica.com/2026/08/a-story/";
    const result = await unwrapUrl(url, {
      fetchHead: fetcher({ [url]: { status: 200, body: "<html><body>An article</body></html>" } }),
      resolve: publicDns,
    });

    expect(result.url).toBe(url);
    expect(classifyUnwrap(result)).toBe("resolved");
  });

  it("stays resolved when a publisher blocks our user agent", async () => {
    // A 403 from a publisher is a bot wall, not a failure to unwrap: the URL we hold is
    // already the article's own. Flagging it would put a warning on a correct link.
    const url = "https://www.wsj.com/articles/a-story";
    const result = await unwrapUrl(url, {
      fetchHead: fetcher({ [url]: { status: 403 } }),
      resolve: publicDns,
    });

    expect(result.url).toBe(url);
    expect(classifyUnwrap(result)).toBe("resolved");
  });

  it("follows an ordinary 301 the way it always did", async () => {
    const from = "https://example.com/old";
    const to = "https://example.com/new";
    const result = await unwrapUrl(from, {
      fetchHead: fetcher({
        [from]: { status: 301, location: to },
        [to]: { status: 200, body: "<html>page</html>" },
      }),
      resolve: publicDns,
    });

    expect(result.url).toBe(to);
    expect(result.hops).toBe(1);
    expect(classifyUnwrap(result)).toBe("resolved");
  });
});

describe("the in-page redirect target is checked like any other hop", () => {
  it("refuses a meta refresh pointing at a private address", async () => {
    const result = await unwrapUrl(BEEHIIV, {
      fetchHead: fetcher({
        [BEEHIIV]: {
          status: 200,
          body: `<meta http-equiv="refresh" content="0;url=http://169.254.169.254/latest/meta-data/">`,
        },
      }),
      resolve: async (hostname: string) =>
        hostname === "169.254.169.254"
          ? [{ address: "169.254.169.254", family: 4 }]
          : [{ address: "93.184.216.34", family: 4 }],
    });

    // Never returns the private address, whatever else it decides.
    expect(result.url).not.toContain("169.254");
  });
});

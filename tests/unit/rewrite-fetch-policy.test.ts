import { describe, expect, it } from "vitest";
import {
  detectWall,
  domainOf,
  FETCH_ALLOWLIST,
  FETCH_USER_AGENT,
  mayFetch,
  parseRobots,
  robotsAllows,
} from "@/lib/rewrite/fetch-policy";

describe("the allowlist is default deny", () => {
  it("ships empty, so nothing is fetched until somebody decides", () => {
    // The decision is editorial, not technical. The machinery is inert until then.
    expect(FETCH_ALLOWLIST).toEqual([]);
  });

  it("refuses a domain that is not on the list", () => {
    const verdict = mayFetch("https://www.techcrunch.com/2026/08/05/thing");

    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) return;
    expect(verdict.reason).toContain("default deny");
    expect(verdict.domain).toBe("techcrunch.com");
  });

  it("allows a domain that is on the list", () => {
    const list = [{ domain: "example.com", reason: "publishes full text in its feed" }];

    expect(mayFetch("https://example.com/a", list)).toEqual({
      allowed: true,
      domain: "example.com",
    });
  });

  it("does not let a subdomain inherit permission", () => {
    // Publisher groups host unrelated titles on subdomains, and an allowlist that
    // covers everything under a domain stops meaning anything.
    const list = [{ domain: "example.com", reason: "any" }];

    expect(mayFetch("https://paywalled.example.com/a", list).allowed).toBe(false);
  });

  it("refuses anything that is not http or https", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/a",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(mayFetch(url, [{ domain: "example.com", reason: "any" }]).allowed).toBe(
        false
      );
    }
  });

  it("identifies itself with a contact address", () => {
    expect(FETCH_USER_AGENT).toContain("newsletter4link");
    expect(FETCH_USER_AGENT).toContain("@");
  });
});

describe("domainOf", () => {
  it("drops www and lowercases", () => {
    expect(domainOf("https://WWW.Example.COM/path")).toBe("example.com");
  });

  it("keeps a meaningful subdomain", () => {
    expect(domainOf("https://news.ycombinator.com/item?id=1")).toBe(
      "news.ycombinator.com"
    );
  });

  it("is null for nonsense", () => {
    expect(domainOf("")).toBeNull();
    expect(domainOf("example.com")).toBeNull();
  });
});

describe("parseRobots", () => {
  it("reads the wildcard group", () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /private\nCrawl-delay: 5`);

    expect(rules.disallow).toEqual(["/private"]);
    expect(rules.crawlDelaySeconds).toBe(5);
  });

  it("prefers a group naming us over the wildcard", () => {
    const rules = parseRobots(
      `User-agent: *\nDisallow: /\n\nUser-agent: newsletter4link\nDisallow: /admin`
    );

    // A named group wins entirely, which is what the standard says and what a
    // publisher writing one expects.
    expect(rules.disallow).toEqual(["/admin"]);
  });

  it("ignores a group addressed to another crawler", () => {
    const rules = parseRobots(
      `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private`
    );

    expect(rules.disallow).toEqual(["/private"]);
  });

  it("treats consecutive user-agent lines as one group", () => {
    const rules = parseRobots(
      `User-agent: newsletter4link\nUser-agent: SomeoneElse\nDisallow: /shared`
    );

    expect(rules.disallow).toEqual(["/shared"]);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots(
      `# a comment\nUser-agent: *  # trailing\nDisallow: /x # also trailing\n\n`
    );

    expect(rules.disallow).toEqual(["/x"]);
  });

  it("treats an empty Disallow as no rule at all", () => {
    expect(parseRobots(`User-agent: *\nDisallow:`).disallow).toEqual([]);
  });

  it("returns nothing restrictive for an empty or missing file", () => {
    expect(parseRobots("")).toEqual({
      disallow: [],
      allow: [],
      crawlDelaySeconds: null,
    });
  });

  it("ignores a crawl delay that is not a number", () => {
    expect(parseRobots(`User-agent: *\nCrawl-delay: soon`).crawlDelaySeconds).toBeNull();
  });
});

describe("robotsAllows", () => {
  const rules = (disallow: string[], allow: string[] = []) => ({
    disallow,
    allow,
    crawlDelaySeconds: null,
  });

  it("permits a path with no matching rule", () => {
    expect(robotsAllows(rules(["/private"]), "/2026/08/article")).toBe(true);
  });

  it("refuses a disallowed prefix", () => {
    expect(robotsAllows(rules(["/private"]), "/private/thing")).toBe(false);
  });

  it("refuses everything under a bare slash", () => {
    expect(robotsAllows(rules(["/"]), "/anything")).toBe(false);
  });

  it("lets the longer rule win", () => {
    // Disallow: /news, Allow: /news/public means /news/public is fetchable.
    expect(robotsAllows(rules(["/news"], ["/news/public"]), "/news/public/a")).toBe(true);
    expect(robotsAllows(rules(["/news"], ["/news/public"]), "/news/private/a")).toBe(
      false
    );
  });

  it("lets Allow win at equal length, as the major crawlers do", () => {
    expect(robotsAllows(rules(["/x"], ["/x"]), "/x/a")).toBe(true);
  });

  it("handles a trailing wildcard as a prefix", () => {
    expect(robotsAllows(rules(["/tag/*"]), "/tag/ai")).toBe(false);
  });

  it("permits everything when there are no rules", () => {
    expect(robotsAllows(rules([]), "/anything")).toBe(true);
  });
});

describe("detectWall", () => {
  const long = "word ".repeat(600); // well over the short-body threshold

  it("passes a real article", () => {
    expect(detectWall({ extracted: long, excerpt: "a short excerpt" })).toEqual({
      walled: false,
      reason: null,
    });
  });

  it("catches a subscribe wall that answered 200", () => {
    // The plan's rule was to key on 401, 402 and 403. A paywalled page usually
    // answers 200, with a gate or with two paragraphs and a wall.
    const verdict = detectWall({
      extracted: "The first paragraph. Subscribe to continue reading this article.",
      excerpt: "The first paragraph.",
    });

    expect(verdict.walled).toBe(true);
    expect(verdict.reason).toContain("subscribe to continue");
  });

  it("reads a Portuguese wall too", () => {
    expect(
      detectWall({
        extracted: "Primeiro paragrafo. Para continuar a ler, subscreva.",
        excerpt: "",
      }).walled
    ).toBe(true);
  });

  it("does not mistake a footer promotion in a long article for a gate", () => {
    const article = `${long} Become a member to support our journalism.`;

    expect(detectWall({ extracted: article, excerpt: "x" }).walled).toBe(false);
  });

  it("catches a fetch that returned less than the feed already gave", () => {
    const verdict = detectWall({
      extracted: "Short.",
      excerpt: "A much longer excerpt than the page yielded, which is the giveaway.",
    });

    expect(verdict.walled).toBe(true);
    expect(verdict.reason).toContain("less text than the feed excerpt");
  });

  it("does not compare against an absent excerpt", () => {
    expect(detectWall({ extracted: "Short but all there is.", excerpt: "" }).walled).toBe(
      false
    );
  });
});

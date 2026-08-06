import { describe, expect, it, vi } from "vitest";
import {
  checkUrlShape,
  checkUrlTarget,
  isBlockedIpv4,
  isBlockedIpv6,
  type Resolver,
} from "@/lib/curation/url-safety";
import { cleanUrl, unwrapUrl, type HeadFetch } from "@/lib/curation/unwrap-url";

/** A resolver that answers with whatever the test says, so no DNS is used. */
const resolves = (address: string, family = 4): Resolver => async () => [
  { address, family },
];

const publicDns = resolves("93.184.216.34");

describe("checkUrlShape", () => {
  it("accepts an ordinary article URL", () => {
    expect(checkUrlShape("https://arstechnica.com/2026/08/thing/")).toEqual({ safe: true });
  });

  it("refuses a scheme an email is not allowed to name", () => {
    for (const url of [
      "file:///etc/passwd",
      "gopher://x.com/",
      "data:text/html,hi",
      "javascript:alert(1)",
      "ftp://x.com/a",
    ]) {
      expect(checkUrlShape(url).safe).toBe(false);
    }
  });

  it("refuses credentials in the URL", () => {
    expect(checkUrlShape("https://user:pass@example.com/").safe).toBe(false);
  });

  it("refuses a port that is not a web port", () => {
    // A port is a service, not a page: 6379 is Redis, 5432 is Postgres.
    expect(checkUrlShape("http://example.com:6379/").safe).toBe(false);
    expect(checkUrlShape("http://example.com:5432/").safe).toBe(false);
    expect(checkUrlShape("https://example.com:443/").safe).toBe(true);
    expect(checkUrlShape("http://example.com:80/").safe).toBe(true);
  });

  it("refuses nonsense", () => {
    expect(checkUrlShape("").safe).toBe(false);
    expect(checkUrlShape("not a url").safe).toBe(false);
  });
});

describe("isBlockedIpv4", () => {
  it("blocks the addresses an SSRF aims at", () => {
    for (const address of [
      "127.0.0.1", // this application
      "169.254.169.254", // cloud metadata
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // carrier grade NAT
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.1", // multicast
    ]) {
      expect(isBlockedIpv4(address), address).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["93.184.216.34", "1.1.1.1", "8.8.8.8", "172.32.0.1", "11.0.0.1"]) {
      expect(isBlockedIpv4(address), address).toBe(false);
    }
  });

  /**
   * The special-use ranges are /24s, not /16s.
   *
   * The check blocked all of 192.0.0.0/16, 198.51.0.0/16 and 203.0.0.0/16, which is 256
   * times too much in each case. The cost was measured on 6 August 2026: one Morning Brew
   * issue lost five articles because techcrunch.com, variety.com, deadline.com and
   * hollywoodreporter.com all resolve into 192.0.66.0/24, which is ordinary public space
   * that Automattic happens to own.
   */
  it("allows the public space next door to a reserved range", () => {
    for (const address of [
      "192.0.66.220", // techcrunch.com
      "192.0.66.91", // hollywoodreporter.com
      "192.0.66.176", // variety.com
      "192.0.66.32", // deadline.com
      "192.0.1.1", // just past the protocol-assignments /24
      "192.0.3.1", // just past TEST-NET-1
      "198.51.99.1", // just before TEST-NET-2
      "198.51.101.1", // just after it
      "203.0.112.1", // just before TEST-NET-3
      "203.0.114.1", // just after it
    ]) {
      expect(isBlockedIpv4(address), address).toBe(false);
    }
  });

  it("still blocks the reserved /24s themselves", () => {
    for (const address of [
      "192.0.0.1", // IETF protocol assignments
      "192.0.2.1", // TEST-NET-1
      "198.51.100.1", // TEST-NET-2
      "203.0.113.1", // TEST-NET-3
    ]) {
      expect(isBlockedIpv4(address), address).toBe(true);
    }
  });

  it("blocks anything that is not four numbers", () => {
    expect(isBlockedIpv4("not.an.ip.address")).toBe(true);
    expect(isBlockedIpv4("1.2.3")).toBe(true);
  });
});

describe("isBlockedIpv6", () => {
  it("blocks loopback, unspecified, link local, unique local and multicast", () => {
    for (const address of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1"]) {
      expect(isBlockedIpv6(address), address).toBe(true);
    }
  });

  it("judges an IPv4-mapped address as the IPv4 address it is", () => {
    // ::ffff:127.0.0.1 is loopback wearing a hat.
    expect(isBlockedIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpv6("::ffff:93.184.216.34")).toBe(false);
  });

  it("allows a public address", () => {
    expect(isBlockedIpv6("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });
});

describe("checkUrlTarget", () => {
  it("resolves the hostname rather than matching the string", async () => {
    // The whole point: a name whose owner points it at loopback cannot be caught by pattern
    // matching, and plenty of such names exist for exactly this purpose.
    const verdict = await checkUrlTarget(
      "https://localtest.me/a",
      resolves("127.0.0.1")
    );

    expect(verdict.safe).toBe(false);
    if (verdict.safe) return;
    expect(verdict.reason).toContain("127.0.0.1");
  });

  it("checks a literal address without resolving it", async () => {
    const resolver = vi.fn<Resolver>(async () => [{ address: "1.1.1.1", family: 4 }]);

    const verdict = await checkUrlTarget("http://169.254.169.254/latest/meta-data/", resolver);

    expect(verdict.safe).toBe(false);
    // Passing a literal to a resolver is how a check gets answered by a DNS server that
    // says whatever it likes.
    expect(resolver).not.toHaveBeenCalled();
  });

  it("refuses when every resolved address is not acceptable", async () => {
    const verdict = await checkUrlTarget("https://x.com/a", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);

    // Which address a connection uses is not ours to choose, so one bad answer is enough.
    expect(verdict.safe).toBe(false);
  });

  it("refuses a name that does not resolve", async () => {
    const verdict = await checkUrlTarget("https://nope.invalid/a", async () => {
      throw new Error("ENOTFOUND");
    });

    expect(verdict.safe).toBe(false);
  });

  it("accepts a public name", async () => {
    expect(await checkUrlTarget("https://example.com/a", publicDns)).toEqual({ safe: true });
  });
});

describe("cleanUrl", () => {
  it("strips campaign parameters and keeps the rest", () => {
    expect(
      cleanUrl("https://x.com/a?utm_source=tldr&utm_medium=email&id=42&ref=newsletter")
    ).toBe("https://x.com/a?id=42");
  });

  it("strips the fragment, which is a position and not a document", () => {
    expect(cleanUrl("https://x.com/a#readmore")).toBe("https://x.com/a");
  });

  it("normalizes the host and the default port", () => {
    expect(cleanUrl("https://X.COM:443/a")).toBe("https://x.com/a");
    expect(cleanUrl("http://X.com:80/a")).toBe("http://x.com/a");
  });

  it("drops a bare root slash so two spellings of a homepage match", () => {
    expect(cleanUrl("https://x.com/")).toBe(cleanUrl("https://x.com"));
  });

  it("keeps a trailing slash on a path, since servers treat those differently", () => {
    expect(cleanUrl("https://x.com/a/")).toBe("https://x.com/a/");
  });

  it("returns nonsense unchanged rather than throwing", () => {
    expect(cleanUrl("not a url")).toBe("not a url");
  });
});

describe("unwrapUrl", () => {
  const chain = (map: Record<string, string>): HeadFetch => async (url) =>
    map[url] ? { status: 302, location: map[url] } : { status: 200, location: null };

  it("follows a wrapper to the article", async () => {
    const result = await unwrapUrl("https://link.tldr.com/click/abc", {
      fetchHead: chain({
        "https://link.tldr.com/click/abc": "https://tracking.beehiiv.com/x",
        "https://tracking.beehiiv.com/x":
          "https://arstechnica.com/2026/08/thing/?utm_source=tldr",
      }),
      resolve: publicDns,
    });

    expect(result.url).toBe("https://arstechnica.com/2026/08/thing/");
    expect(result.unwrapped).toBe(true);
    expect(result.hops).toBe(2);
  });

  it("leaves a URL that is not a wrapper alone", async () => {
    const result = await unwrapUrl("https://arstechnica.com/a", {
      fetchHead: chain({}),
      resolve: publicDns,
    });

    expect(result).toEqual({
      url: "https://arstechnica.com/a",
      unwrapped: true,
      hops: 0,
      note: null,
    });
  });

  it("respects the hop limit", async () => {
    // An endless chain must not become an endless loop.
    const endless: HeadFetch = async (url) => ({
      status: 302,
      location: `${url}/more`,
    });

    const result = await unwrapUrl("https://x.com/a", {
      fetchHead: endless,
      resolve: publicDns,
      maxHops: 3,
    });

    expect(result.hops).toBe(3);
    expect(result.unwrapped).toBe(false);
    expect(result.note).toContain("3 hops");
  });

  it("stops on a loop rather than counting to the limit", async () => {
    const loop = chain({
      "https://x.com/a": "https://x.com/b",
      "https://x.com/b": "https://x.com/a",
    });

    const result = await unwrapUrl("https://x.com/a", {
      fetchHead: loop,
      resolve: publicDns,
    });

    expect(result.note).toContain("loop");
  });

  it("refuses a chain that turns towards a private address", async () => {
    // The attack: a public first hop, a private second one.
    const resolve: Resolver = async (hostname) =>
      hostname === "internal.x.com"
        ? [{ address: "10.0.0.5", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }];

    const result = await unwrapUrl("https://x.com/a", {
      fetchHead: chain({ "https://x.com/a": "http://internal.x.com/admin" }),
      resolve,
    });

    expect(result.unwrapped).toBe(false);
    expect(result.note).toContain("not a public address");
    // And it does not hand back the private URL for something else to fetch later.
    expect(result.url).not.toContain("internal.x.com");
  });

  it("refuses a redirect to a scheme an email may not name", async () => {
    const result = await unwrapUrl("https://x.com/a", {
      fetchHead: chain({ "https://x.com/a": "file:///etc/passwd" }),
      resolve: publicDns,
    });

    expect(result.unwrapped).toBe(false);
    expect(result.note).toContain("not allowed");
  });

  it("falls back to GET when HEAD is refused", async () => {
    // The fake has to answer for the destination too, or the second iteration repeats the
    // HEAD and GET against it and the assertion measures the fake rather than the code.
    const calls: string[] = [];
    const fetchHead: HeadFetch = async (url, method) => {
      calls.push(method);
      if (url === "https://arstechnica.com/a") return { status: 200, location: null };
      if (method === "HEAD") return { status: 405, location: null };
      return { status: 302, location: "https://arstechnica.com/a" };
    };

    const result = await unwrapUrl("https://link.x.com/a", {
      fetchHead,
      resolve: publicDns,
    });

    // Plenty of tracking endpoints answer 405 to HEAD, and giving up there would leave every
    // one of those wrapped.
    expect(calls.slice(0, 2)).toEqual(["HEAD", "GET"]);
    expect(result.url).toBe("https://arstechnica.com/a");
  });

  it("keeps the wrapped URL when the request fails, and says so", async () => {
    const result = await unwrapUrl("https://link.x.com/a?utm_source=x", {
      fetchHead: async () => {
        throw new Error("timed out");
      },
      resolve: publicDns,
    });

    expect(result.url).toBe("https://link.x.com/a");
    expect(result.unwrapped).toBe(false);
    expect(result.note).toContain("timed out");
  });

  it("resolves a relative Location against the current URL", async () => {
    const result = await unwrapUrl("https://x.com/click/a", {
      fetchHead: chain({ "https://x.com/click/a": "/article/42" }),
      resolve: publicDns,
    });

    expect(result.url).toBe("https://x.com/article/42");
  });

  it("refuses the first URL outright when it is unsafe", async () => {
    const result = await unwrapUrl("http://127.0.0.1:80/admin", {
      fetchHead: async () => {
        throw new Error("should not be called");
      },
      resolve: publicDns,
    });

    expect(result.unwrapped).toBe(false);
    expect(result.hops).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  groupUnknownSenders,
  type UnknownSenderEmail,
} from "@/lib/inbound/unknown-senders";
import type { MatchableSource } from "@/lib/inbound/match";

function email(overrides: Partial<UnknownSenderEmail> = {}): UnknownSenderEmail {
  return {
    from: "news@daily.therundown.ai",
    subject: "Today in AI",
    subaddressTag: null,
    receivedAt: new Date("2026-08-05T10:00:00.000Z"),
    status: "CONTENT_PENDING",
    ...overrides,
  };
}

function source(overrides: Partial<MatchableSource> = {}): MatchableSource {
  return {
    id: "src-1",
    organizationId: "org-1",
    senderAddress: "news@daily.therundown.ai",
    inboundTag: null,
    parseMode: "DIGEST",
    active: true,
    ...overrides,
  };
}

describe("groupUnknownSenders", () => {
  it("lists a sender no source claims", () => {
    const groups = groupUnknownSenders([email()], []);

    expect(groups).toHaveLength(1);
    expect(groups[0].sender).toBe("news@daily.therundown.ai");
    expect(groups[0].count).toBe(1);
  });

  it("excludes a sender an active source already claims", () => {
    expect(groupUnknownSenders([email()], [source()])).toHaveLength(0);
  });

  it("still lists a sender whose only source is inactive", () => {
    // An inactive source does not ingest, so its sender is being dropped and the
    // panel must say so. matchSources filters on active for the same reason.
    const groups = groupUnknownSenders([email()], [source({ active: false })]);
    expect(groups).toHaveLength(1);
  });

  it("still lists a sender whose source has no parse mode", () => {
    const groups = groupUnknownSenders([email()], [source({ parseMode: null })]);
    expect(groups).toHaveLength(1);
  });

  it("excludes a sender matched only by its tag", () => {
    const groups = groupUnknownSenders(
      [email({ from: "moved@newplatform.com", subaddressTag: "tldr" })],
      [source({ senderAddress: "old@oldplatform.com", inboundTag: "tldr" })]
    );

    expect(groups).toHaveLength(0);
  });

  it("groups on the bare address, so a changed display name is one sender", () => {
    const groups = groupUnknownSenders(
      [
        email({ from: "TLDR <news@tldr.tech>" }),
        email({ from: "TLDR AI <news@tldr.tech>" }),
        email({ from: "news@tldr.tech" }),
      ],
      []
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].sender).toBe("news@tldr.tech");
    expect(groups[0].count).toBe(3);
  });

  it("groups case-insensitively, since an address is not case sensitive in practice", () => {
    const groups = groupUnknownSenders(
      [email({ from: "News@TLDR.tech" }), email({ from: "news@tldr.tech" })],
      []
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].sender).toBe("news@tldr.tech");
  });

  it("orders by volume, so the sender flooding the mailbox comes first", () => {
    const groups = groupUnknownSenders(
      [
        email({ from: "quiet@example.com" }),
        email({ from: "loud@example.com" }),
        email({ from: "loud@example.com" }),
        email({ from: "loud@example.com" }),
      ],
      []
    );

    expect(groups.map((g) => g.sender)).toEqual([
      "loud@example.com",
      "quiet@example.com",
    ]);
  });

  it("keeps a bounded sample of subjects, not every one", () => {
    const groups = groupUnknownSenders(
      Array.from({ length: 10 }, (_, i) => email({ subject: `Issue ${i}` })),
      []
    );

    expect(groups[0].count).toBe(10);
    expect(groups[0].subjectSamples).toHaveLength(3);
  });

  it("tracks the first and last time a sender was seen", () => {
    const groups = groupUnknownSenders(
      [
        email({ receivedAt: new Date("2026-08-03T10:00:00.000Z") }),
        email({ receivedAt: new Date("2026-08-01T10:00:00.000Z") }),
        email({ receivedAt: new Date("2026-08-05T10:00:00.000Z") }),
      ],
      []
    );

    expect(groups[0].firstSeenAt.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    expect(groups[0].lastSeenAt.toISOString()).toBe("2026-08-05T10:00:00.000Z");
  });

  it("breaks the count down by status, so queued and discarded are distinguishable", () => {
    const groups = groupUnknownSenders(
      [
        email({ status: "CONTENT_PENDING" }),
        email({ status: "CONTENT_PENDING" }),
        email({ status: "IGNORED_UNKNOWN_SENDER" }),
      ],
      []
    );

    expect(groups[0].byStatus).toEqual({
      CONTENT_PENDING: 2,
      IGNORED_UNKNOWN_SENDER: 1,
    });
    expect(groups[0].alreadyIgnored).toBe(true);
  });

  it("does not claim a sender was ignored when it is merely queued", () => {
    const groups = groupUnknownSenders([email({ status: "CONTENT_PENDING" })], []);
    expect(groups[0].alreadyIgnored).toBe(false);
  });

  it("collects the tags seen, so a promoted source can carry one", () => {
    const groups = groupUnknownSenders(
      [
        email({ subaddressTag: "tldr" }),
        email({ subaddressTag: "tldr" }),
        email({ subaddressTag: "ai" }),
      ],
      []
    );

    expect(groups[0].tags).toEqual(["tldr", "ai"]);
  });

  it("skips a From header that cannot be parsed into an address", () => {
    // Nothing can be promoted from it, so listing it would offer an action that fails.
    const groups = groupUnknownSenders([email({ from: "not an address" })], []);
    expect(groups).toHaveLength(0);
  });

  it("returns nothing for no emails", () => {
    expect(groupUnknownSenders([], [source()])).toEqual([]);
  });

  it("considers every organization's sources, not one", () => {
    // A source in the other organization still claims the email, so it is not unknown.
    // Scoping this per tenant would invite a duplicate source for a configured feed.
    const groups = groupUnknownSenders(
      [email()],
      [source({ organizationId: "org-2" })]
    );

    expect(groups).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSentSnapshot } from "@/lib/editions/sent-snapshot";

/**
 * An edition must never be able to reach SENT without its snapshot.
 *
 * Two statements would allow it: the mail goes out, the status write lands, the snapshot
 * write fails, and the archive silently renders live rows for ever after with nothing
 * recording that it is doing so. One statement makes that state unreachable.
 */

const calls: Array<{ method: string; args: any }> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    edition: {
      update: (args: unknown) => {
        calls.push({ method: "update", args });
        return Promise.resolve({ id: "ed-1" });
      },
    },
  },
}));

import { markEditionAsSent } from "@/lib/queries";

const snapshot = () =>
  buildSentSnapshot({
    articles: [{ title: "A model ships", sourceUrl: "https://example.test/a1" }],
    projects: [],
    week: 32,
    year: 2026,
    label: "Week 32",
    subject: "AI Radar Weekly - Week 32, 2026",
    templateId: null,
  });

beforeEach(() => {
  calls.length = 0;
});

describe("markEditionAsSent", () => {
  it("writes the status and the snapshot in one statement", async () => {
    await markEditionAsSent("ed-1", snapshot());

    expect(calls).toHaveLength(1);
    expect(calls[0].args.where).toEqual({ id: "ed-1" });
    expect(calls[0].args.data.status).toBe("SENT");
    expect(calls[0].args.data.sentAt).toBeInstanceOf(Date);
    expect(calls[0].args.data.sentSnapshot.articles[0].title).toBe("A model ships");
  });

  it("omits the column entirely when no snapshot is given", async () => {
    // Not `sentSnapshot: null`. A caller with nothing to record must not overwrite a
    // snapshot that is already there.
    await markEditionAsSent("ed-1");

    expect("sentSnapshot" in calls[0].args.data).toBe(false);
  });
});

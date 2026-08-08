import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { markAsideUsed } from "@/lib/asides/mark-used";

function fakeDb() {
  const update = vi.fn().mockResolvedValue({});
  return { db: { aside: { update } } as never, update };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("markAsideUsed", () => {
  it("stamps the time and increments the counter in one write", async () => {
    const { db, update } = fakeDb();

    await markAsideUsed(db, "aside-1");

    expect(update).toHaveBeenCalledTimes(1);
    const args = update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "aside-1" });
    expect(args.data.useCount).toEqual({ increment: 1 });
    expect(args.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it("increments rather than reading and writing back, so two sends cannot race", async () => {
    const { db, update } = fakeDb();

    await markAsideUsed(db, "aside-1");

    expect(update.mock.calls[0][0].data.useCount).toEqual({ increment: 1 });
  });

  it("does nothing when the edition carried no aside", async () => {
    const { db, update } = fakeDb();

    await markAsideUsed(db, null);
    await markAsideUsed(db, undefined);
    await markAsideUsed(db, "");

    expect(update).not.toHaveBeenCalled();
  });

  it("does not throw when the row is gone, because a send must not fail on bookkeeping", async () => {
    // The mail has already reached Resend by the time this runs. Reporting failure now
    // would tell an editor the send did not happen when it did.
    const update = vi.fn().mockRejectedValue(new Error("Record to update not found"));
    const db = { aside: { update } } as never;

    await expect(markAsideUsed(db, "aside-1")).resolves.toBeUndefined();
  });

  it("logs the failure rather than swallowing it silently", async () => {
    const update = vi.fn().mockRejectedValue(new Error("boom"));
    const db = { aside: { update } } as never;

    await markAsideUsed(db, "aside-1");

    expect(console.error).toHaveBeenCalled();
  });
});

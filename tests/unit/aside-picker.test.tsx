import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AsidePicker } from "@/components/aside-picker";

/**
 * The closing slot's list rendered the first eight rows of what the API offered and said
 * nothing about the rest.
 *
 * That cut lands on the worst possible row. `asidePickerQuery` orders never-used first and
 * then oldest first, so a line written today sorts last of the never-used ones: the row most
 * likely to fall outside the eight is exactly the one somebody just created and came here to
 * attach. Reported from the send screen with eighteen offerable rows, ten of them unreachable.
 *
 * The same rule the candidate list is built on, recorded in CLAUDE.md: a cap you cannot see
 * is a bug, and a list that caps must say so and offer a way to the rest.
 */

interface Offerable {
  id: string;
  kind: "JOKE" | "NOTE" | "SPOTLIGHT";
  text: string;
  imageUrl: string | null;
  attribution: string | null;
  lastUsedAt: string | null;
  useCount: number;
}

function aside(over: Partial<Offerable> & { id: string; text: string }): Offerable {
  return {
    kind: "JOKE",
    imageUrl: null,
    attribution: null,
    lastUsedAt: null,
    useCount: 0,
    ...over,
  };
}

/** In the order the route returns them: never sent first, oldest first. */
function library(count: number): Offerable[] {
  return Array.from({ length: count }, (_, index) =>
    aside({ id: `aside-${index + 1}`, text: `Closing line ${index + 1}` })
  );
}

/**
 * Routes by URL rather than answering everything the same way, because the two defects
 * this file covers are both about one surface answering with another surface's data.
 *
 * `byId` is the store behind `GET /api/asides/:id`, which is deliberately allowed to hold
 * rows the library does not: a one-off, a retired line, another kind.
 */
function stubApi(options: { pool?: Offerable[]; byId?: Offerable[]; created?: Offerable } = {}) {
  const pool = options.pool ?? [];
  const byId = new Map((options.byId ?? pool).map((row) => [row.id, row]));

  const fetchMock = vi.fn(async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.startsWith("/api/asides?offerable=true")) {
      return { ok: true, json: async () => ({ success: true, data: pool }) };
    }

    if (url === "/api/asides" && method === "POST") {
      const row = options.created;
      if (row) byId.set(row.id, row);
      return { ok: true, json: async () => ({ success: true, data: row }) };
    }

    if (url.startsWith("/api/asides/")) {
      const row = byId.get(url.slice("/api/asides/".length));
      return row
        ? { ok: true, json: async () => ({ success: true, data: row }) }
        : { ok: false, json: async () => ({ success: false, error: "Aside not found" }) };
    }

    if (url.startsWith("/api/editions/")) {
      return { ok: true, json: async () => ({ success: true }) };
    }

    throw new Error(`Unstubbed request: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  return fetchMock;
}

function stubPool(rows: Offerable[]) {
  return stubApi({ pool: rows });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AsidePicker", () => {
  it("offers every row the library holds, not just the first page of them", async () => {
    // The reported case: eighteen approved and reusable, the newest one last.
    stubPool(library(18));
    render(<AsidePicker editionId="ed1" selectedId={null} />);

    await screen.findByText("Closing line 1");
    expect(screen.queryByText("Closing line 18")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show all 18/i }));

    expect(screen.getByText("Closing line 18")).toBeTruthy();
  });

  it("says how much of the library it is showing", async () => {
    stubPool(library(18));
    render(<AsidePicker editionId="ed1" selectedId={null} />);

    await screen.findByText("Closing line 1");

    // Without this the eight rows and the eighteen offerable are indistinguishable, which
    // is what made the missing row read as a row that was never saved.
    expect(screen.getByText(/8 of 18/)).toBeTruthy();
  });

  it("does not offer a way to expand a library that already fits", async () => {
    stubPool(library(5));
    render(<AsidePicker editionId="ed1" selectedId={null} />);

    await screen.findByText("Closing line 5");

    expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
    expect(screen.queryByText(/of 5/)).toBeNull();
  });
});

/**
 * The second defect, same shape as the first and one layer down.
 *
 * The panel resolved what the edition is carrying by searching the offerable library, which
 * answers a different question: "what may still be chosen" is not "what is attached". Three
 * kinds of attached row are never in that list, and on all three the screen went blank and
 * said the edition carried something it could not show:
 *
 * - a one-off typed into "Write one now", which is written `reusable: false` on purpose
 * - a line retired after the edition had already picked it
 * - a line of a kind other than the tab, and the tab always opens on Joke
 *
 * Resolved by id now, through `GET /api/asides/:id`, so the preview is independent of what
 * the library happens to be offering.
 */
describe("AsidePicker, what the edition is carrying", () => {
  it("shows a one-off, which is deliberately absent from the library", async () => {
    const oneOff = aside({ id: "one-off-1", text: "So ha uma piada esta semana." });
    stubApi({ pool: library(3), byId: [...library(3), oneOff] });

    render(<AsidePicker editionId="ed1" selectedId={oneOff.id} />);

    expect(await screen.findByText("So ha uma piada esta semana.")).toBeTruthy();
    expect(screen.queryByText(/not in the list above/i)).toBeNull();
  });

  it("shows a line of another kind than the tab it opens on", async () => {
    // The tab opens on Joke, so the library it fetches cannot contain a spotlight.
    const spotlight = aside({
      id: "spot-1",
      kind: "SPOTLIGHT",
      text: "A equipa de dados fechou a migracao.",
    });
    stubApi({ pool: library(3), byId: [spotlight] });

    render(<AsidePicker editionId="ed1" selectedId={spotlight.id} />);

    expect(await screen.findByText("A equipa de dados fechou a migracao.")).toBeTruthy();
  });

  it("shows its image, which is the whole reason a picture was uploaded", async () => {
    const withImage = aside({
      id: "img-1",
      text: "Weekly newsletter about AI",
      imageUrl: "https://example.test/newsletter-media/meme.png",
    });
    stubApi({ pool: library(3), byId: [withImage] });

    render(<AsidePicker editionId="ed1" selectedId={withImage.id} />);

    const image = await screen.findByAltText("Weekly newsletter about AI");
    expect(image.getAttribute("src")).toBe("https://example.test/newsletter-media/meme.png");
  });

  it("shows what was just written, rather than reporting it as unshowable", async () => {
    const written = aside({ id: "fresh-1", text: "Uma linha escrita agora." });
    stubApi({ pool: library(3), created: written });

    render(<AsidePicker editionId="ed1" selectedId={null} />);
    await screen.findByText("Closing line 1");

    fireEvent.click(screen.getByRole("button", { name: /write one now/i }));
    fireEvent.change(screen.getByLabelText(/write a closing line/i), {
      target: { value: "Uma linha escrita agora." },
    });
    fireEvent.click(screen.getByRole("button", { name: /use this/i }));

    /**
     * Wait for the composer to close before asserting.
     *
     * Without this the assertion passes on the text still sitting in the textarea, which is
     * how the first version of this test went green against the unfixed component.
     */
    await waitFor(() =>
      expect(screen.queryByLabelText(/write a closing line/i)).toBeNull()
    );

    expect(await screen.findByText("Uma linha escrita agora.")).toBeTruthy();
  });

  it("says the row could not be loaded when it truly cannot be", async () => {
    // A deleted aside, or one belonging to another organization: the route answers 404 and
    // the panel has to say something true rather than nothing.
    stubApi({ pool: library(3), byId: [] });

    render(<AsidePicker editionId="ed1" selectedId={"gone-1"} />);

    expect(await screen.findByText(/could not be loaded/i)).toBeTruthy();
  });
});

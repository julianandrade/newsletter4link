import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LinkTakeView } from "@/components/article/link-take-view";
import { aiLabelFor, type LinkTakePayload, type ViewRewrite } from "@/lib/rewrite/view";

/**
 * RQ-006_03's gate, from the split table in PLAN-REVIEW.md:
 *
 *   "Source name and URL present on every rendering."
 *
 * The first describe block is that gate, and it is the reason the attribution is its
 * own component rather than markup inside this one. As markup, the gate would be a
 * visual inspection somebody has to remember to repeat. As a component rendered by the
 * single path every state passes through, it is an assertion.
 */

const PUBLICATION = "reuters.com";
const SOURCE_URL = "https://www.reuters.com/technology/ai-act-banks";
const SUMMARY = "Supervisors in three member states have opened the first reviews.";

const REWRITE: ViewRewrite = {
  id: "rw1",
  title: "O AI Act chega aos bancos, e a conformidade deixa de ser teoria",
  body: "A supervisao abriu as primeiras revisoes em tres estados membros.\n\n## Relevancia para a Link\n\nTres clientes nossos correm modelos de scoring de credito.",
  language: "pt-PT",
  inputMode: "FULL_TEXT",
  generatedAt: "2026-08-05T09:12:00.000Z",
  model: "claude-haiku-4-5-20251001",
  checkSummary: "passed: 204 words, longest run shared with the source 1 words",
  longestSharedRun: 1,
  wordCount: 204,
};

function payload(over: Partial<LinkTakePayload> = {}): LinkTakePayload {
  return {
    attribution: {
      publication: PUBLICATION,
      url: SOURCE_URL,
      publishedAt: "2026-08-05T07:00:00.000Z",
      originalTitle: "EU AI Act high-risk obligations bite for banks",
    },
    rewrite: null,
    unavailableReason: null,
    stale: false,
    attempted: false,
    summary: SUMMARY,
    ...over,
  };
}

const READY = payload({ rewrite: REWRITE });
const STALE = payload({ rewrite: REWRITE, stale: true });
const ABSENT = payload();
const REFUSED = payload({
  attempted: true,
  unavailableReason: "The checks refused it after 2 attempts: unsupported-number.",
});

const NOOP = {
  onGenerate: () => {},
  onRegenerate: () => {},
};

function view(data: LinkTakePayload, canEdit = false) {
  return render(<LinkTakeView payload={data} canEdit={canEdit} {...NOOP} />);
}

/**
 * The history disclosure's own summary element.
 *
 * `getByText` would match the `<details>` and the `<summary>` both, since a query by
 * text reads `textContent` and the parent contains the child's. The element that gets
 * clicked is the summary, so the test names it.
 */
function historySummary(container: HTMLElement): HTMLElement {
  const found = Array.from(container.querySelectorAll("summary")).find((element) =>
    /History/i.test(element.textContent ?? "")
  );

  if (!found) throw new Error("no history disclosure was rendered");
  return found;
}

describe("the gate: source name and URL on every rendering", () => {
  const STATES: Array<[string, LinkTakePayload]> = [
    ["ready", READY],
    ["stale", STALE],
    ["absent", ABSENT],
    ["refused", REFUSED],
  ];

  for (const [name, data] of STATES) {
    it(`shows the publication and the source URL in the ${name} state`, () => {
      const { container, unmount } = view(data);

      expect(screen.getAllByText(PUBLICATION).length).toBeGreaterThan(0);
      expect(
        container.querySelectorAll(`a[href="${SOURCE_URL}"]`).length
      ).toBeGreaterThan(0);

      unmount();
    });

    it(`shows them for an editor too in the ${name} state`, () => {
      // The role changes which controls exist. It must not be able to change this.
      const { container, unmount } = view(data, true);

      expect(screen.getAllByText(PUBLICATION).length).toBeGreaterThan(0);
      expect(
        container.querySelectorAll(`a[href="${SOURCE_URL}"]`).length
      ).toBeGreaterThan(0);

      unmount();
    });
  }

  it("opens the source in a new tab without handing it the opener", () => {
    const { container } = view(READY);
    const link = container.querySelector(`a[href="${SOURCE_URL}"][target="_blank"]`);

    expect(link).not.toBeNull();
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
  });
});

describe("the ready state", () => {
  it("renders the Link Take prose as the body", () => {
    view(READY);
    expect(screen.getByText(/A supervisao abriu as primeiras revisoes/)).toBeTruthy();
  });

  it("renders the relevance heading as a heading, not as literal markdown", () => {
    view(READY);
    expect(
      screen.getByRole("heading", { name: "Relevancia para a Link" })
    ).toBeTruthy();
    expect(screen.queryByText(/## Relevancia/)).toBeNull();
  });

  it("keeps the original summary available but secondary", () => {
    const { container } = view(READY);
    // The plan's Surfaces section: the raw summary remains available, collapsed.
    expect(container.querySelector("details")).not.toBeNull();
    expect(screen.getByText(SUMMARY).closest("details")).not.toBeNull();
  });

  it("labels the prose as AI-generated, in the language the prose is written in", () => {
    view(READY);
    expect(screen.getByText(aiLabelFor("pt-PT"))).toBeTruthy();
  });

  it("does not warn about anything", () => {
    view(READY);
    expect(screen.queryByText(/changed after/i)).toBeNull();
  });
});

describe("the stale state", () => {
  it("shows the prose and the warning together", () => {
    view(STALE);
    expect(screen.getByText(/A supervisao abriu as primeiras revisoes/)).toBeTruthy();
    expect(screen.getByText(/changed after/i)).toBeTruthy();
  });

  it("offers an editor the regeneration from the warning itself", () => {
    const onRegenerate = vi.fn();
    render(
      <LinkTakeView
        payload={STALE}
        canEdit
        onGenerate={() => {}}
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("offers a viewer no regeneration at all", () => {
    view(STALE);
    expect(screen.queryByRole("button", { name: /Regenerate/i })).toBeNull();
  });
});

describe("the absent state", () => {
  it("shows the summary as the body, since there is no prose", () => {
    const { container } = view(ABSENT);
    expect(screen.getByText(SUMMARY)).toBeTruthy();
    // Not behind a disclosure here: it is the content, not a secondary view of it.
    expect(screen.getByText(SUMMARY).closest("details")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
  });

  it("offers to write one, to any member", () => {
    const onGenerate = vi.fn();
    render(
      <LinkTakeView
        payload={ABSENT}
        canEdit={false}
        onGenerate={onGenerate}
        onRegenerate={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Write the Link Take/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("does not claim an AI label over a summary no model wrote", () => {
    view(ABSENT);
    expect(screen.queryByText(aiLabelFor("pt-PT"))).toBeNull();
  });
});

describe("the refused state", () => {
  it("states the reason rather than staying silent", () => {
    view(REFUSED);
    expect(screen.getByText(/unsupported-number/)).toBeTruthy();
  });

  it("does not offer a viewer a button whose request would be refused again", () => {
    view(REFUSED);
    expect(screen.queryByRole("button", { name: /Write the Link Take/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Try again/i })).toBeNull();
  });

  it("lets an editor force another attempt", () => {
    const onRegenerate = vi.fn();
    render(
      <LinkTakeView
        payload={REFUSED}
        canEdit
        onGenerate={() => {}}
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("still shows the summary, which is all there is to read", () => {
    view(REFUSED);
    expect(screen.getByText(SUMMARY)).toBeTruthy();
  });
});

describe("evidence and history", () => {
  it("shows the check evidence with the prose, for anybody", () => {
    const { container } = view(READY);
    expect(container.textContent).toContain("204");
    expect(container.textContent).toContain("full article text");
  });

  it("names the model that wrote it", () => {
    const { container } = view(READY);
    expect(container.textContent).toContain("claude-haiku-4-5");
  });

  it("offers the history only to an editor", () => {
    const viewer = view(READY, false);
    expect(viewer.container.textContent).not.toContain("History");
    viewer.unmount();

    const editor = view(READY, true);
    expect(editor.container.textContent).toContain("History");
  });

  it("asks for the history once, on the first open", () => {
    const onLoadHistory = vi.fn();
    const { container } = render(
      <LinkTakeView
        payload={READY}
        canEdit
        onGenerate={() => {}}
        onRegenerate={() => {}}
        onLoadHistory={onLoadHistory}
      />
    );

    const disclosure = historySummary(container);
    fireEvent.click(disclosure);
    fireEvent.click(disclosure);

    // Closing and reopening is free. The request is the expensive part and it has
    // already been made.
    expect(onLoadHistory).toHaveBeenCalledTimes(1);
  });

  it("shows a failed past attempt with its reason, which is the audit trail", () => {
    const { container } = render(
      <LinkTakeView
        payload={READY}
        canEdit
        {...NOOP}
        history={[
          {
            id: "rw1",
            status: "GENERATED",
            checksPassed: true,
            checkSummary: "passed: 204 words",
            longestSharedRun: 1,
            wordCount: 204,
            inputMode: "FULL_TEXT",
            model: "claude-haiku-4-5-20251001",
            generatedAt: "2026-08-05T09:12:00.000Z",
            error: null,
          },
          {
            id: "rw0",
            status: "FAILED",
            checksPassed: false,
            checkSummary: "failed: unsupported-number",
            longestSharedRun: 3,
            wordCount: 188,
            inputMode: "EXCERPT",
            model: "claude-haiku-4-5-20251001",
            generatedAt: "2026-08-04T09:00:00.000Z",
            error: "The checks refused it after 2 attempts: unsupported-number.",
          },
        ]}
      />
    );

    const details = historySummary(container).closest("details");
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain("failed: unsupported-number");
    expect(details?.textContent).toContain("feed excerpt only");
    // Both versions, because nothing is overwritten (review F5).
    expect(details?.textContent).toContain("Passed");
    expect(details?.textContent).toContain("Refused");
  });
});

describe("while a generation is in flight", () => {
  it("disables the control so a second click cannot spend twice", () => {
    render(<LinkTakeView payload={ABSENT} canEdit={false} busy {...NOOP} />);

    const button = screen.getByRole("button", { name: /Write the Link Take/i });
    expect(button).toHaveProperty("disabled", true);
  });

  it("shows a notice the caller passed, without losing what is on screen", () => {
    render(
      <LinkTakeView
        payload={READY}
        canEdit
        {...NOOP}
        notice={{
          tone: "info",
          title: "Nothing was generated",
          detail: "8 rewrites already generated today",
        }}
      />
    );

    expect(screen.getByText("Nothing was generated")).toBeTruthy();
    expect(screen.getByText(/8 rewrites already generated today/)).toBeTruthy();
    // The prose it already had is untouched.
    expect(screen.getByText(/A supervisao abriu as primeiras revisoes/)).toBeTruthy();
  });
});

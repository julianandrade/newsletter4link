import { describe, expect, it } from "vitest";
import { sendRenderChoice } from "@/app/api/email/send-all/route";

/**
 * The defect this pins: `customHtml` arrived on the request body and the handler never
 * destructured it, so every send hand-edited in the Unlayer editor silently delivered the
 * built-in edition instead. Nothing threw, nothing logged, and the suite stayed green.
 *
 * A rule in a pure function can be asserted. A rule in a destructuring statement cannot,
 * which is why that one went unnoticed from the day the screen shipped.
 */

describe("sendRenderChoice", () => {
  it("sends the hand-edited bytes when the editor produced any", () => {
    expect(
      sendRenderChoice({ customHtml: "<p>arranged</p>", effectiveTemplateId: null })
    ).toEqual({ use: "hand-edited", html: "<p>arranged</p>", snapshotTemplateId: null });
  });

  it("lets the hand-edited bytes beat a named template", () => {
    // The edit was made on top of that template. Re-rendering it would throw the edit away.
    expect(
      sendRenderChoice({ customHtml: "<p>arranged</p>", effectiveTemplateId: "tmpl-7" })
    ).toEqual({ use: "hand-edited", html: "<p>arranged</p>", snapshotTemplateId: null });
  });

  it("records no template for a hand-edited send, because none framed it", () => {
    expect(
      sendRenderChoice({ customHtml: "<p>x</p>", effectiveTemplateId: "tmpl-7" })
        .snapshotTemplateId
    ).toBeNull();
  });

  it("uses the stored template when there are no hand-edited bytes", () => {
    expect(sendRenderChoice({ customHtml: undefined, effectiveTemplateId: "tmpl-7" })).toEqual(
      { use: "stored-template", html: null, snapshotTemplateId: "tmpl-7" }
    );
  });

  it("falls back to the built-in edition when there is neither", () => {
    expect(sendRenderChoice({ customHtml: undefined, effectiveTemplateId: null })).toEqual({
      use: "built-in",
      html: null,
      snapshotTemplateId: null,
    });
  });

  it("hands back the bytes it chose, so no caller has to cast", () => {
    // The snapshot's frozenHtml and the send's templateHtml both read this, and a cast at
    // either site would be a place for the two to drift.
    const chosen = sendRenderChoice({
      customHtml: "<p>arranged</p>",
      effectiveTemplateId: "tmpl-7",
    });

    expect(chosen.html).toBe("<p>arranged</p>");
    expect(sendRenderChoice({ customHtml: "  ", effectiveTemplateId: null }).html).toBeNull();
  });

  it("treats blank or non-string customHtml as absent", () => {
    // An editor that exported nothing must not send an empty newsletter.
    for (const customHtml of ["", "   ", null, undefined, 0, {}, []]) {
      expect(sendRenderChoice({ customHtml, effectiveTemplateId: "tmpl-7" }).use).toBe(
        "stored-template"
      );
    }
  });
});

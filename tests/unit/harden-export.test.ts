import { describe, expect, it } from "vitest";
import {
  dropEmptyOptionalRows,
  hardenExportedHtml,
  injectDarkMode,
  wrapMsoLogo,
} from "@/lib/email/harden-export";

describe("injectDarkMode", () => {
  it("puts the style block before </head>", () => {
    const html = injectDarkMode("<html><head><title>x</title></head><body></body></html>");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("[data-ogsc]");
    expect(html.indexOf("prefers-color-scheme")).toBeLessThan(html.indexOf("</head>"));
  });

  it("is idempotent", () => {
    const once = injectDarkMode("<html><head></head><body></body></html>");
    expect(injectDarkMode(once)).toBe(once);
  });

  it("leaves HTML with no head alone rather than corrupting it", () => {
    const html = "<div>fragment</div>";
    expect(injectDarkMode(html)).toBe(html);
  });
});

describe("wrapMsoLogo", () => {
  it("wraps the dark logo in a conditional Outlook will not read", () => {
    // Unlayer does not emit conditional comments, and without one Outlook's Word engine
    // shows both logos stacked.
    const html = wrapMsoLogo('<td><img class="logo-dark" src="d.png"></td>');
    expect(html).toBe(
      '<td><!--[if !mso]><!--><img class="logo-dark" src="d.png"><!--<![endif]--></td>'
    );
  });

  it("leaves the light logo alone", () => {
    const html = '<img class="logo-light" src="l.png">';
    expect(wrapMsoLogo(html)).toBe(html);
  });

  it("finds the class among others", () => {
    expect(wrapMsoLogo('<img class="u_content_image logo-dark x" src="d.png">')).toContain(
      "[if !mso]"
    );
  });

  it("is idempotent", () => {
    const once = wrapMsoLogo('<img class="logo-dark" src="d.png">');
    expect(wrapMsoLogo(once)).toBe(once);
  });
});

describe("dropEmptyOptionalRows", () => {
  it("removes a row whose only content is an eyebrow and whitespace", () => {
    const html = `<table><tr class="radar-optional"><td><p>TREND RADAR</p>   </td></tr></table>`;
    expect(dropEmptyOptionalRows(html)).toBe("<table></table>");
  });

  it("keeps a row that has content, byte identical", () => {
    const html = `<table><tr class="radar-optional"><td><p>TREND RADAR</p><p>Agents +62%</p></td></tr></table>`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("balances nested tables, which is what an Unlayer row actually is", () => {
    const html =
      `<div class="radar-optional">` +
      `<table><tr><td><table><tr><td>HEADING</td></tr></table></td></tr></table>` +
      `</div>` +
      `<div class="keep">after</div>`;
    expect(dropEmptyOptionalRows(html)).toBe('<div class="keep">after</div>');
  });

  it("does not eat the sibling after an empty row", () => {
    const html =
      `<tr class="radar-optional"><td>LABEL</td></tr>` +
      `<tr class="next"><td>real content</td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe('<tr class="next"><td>real content</td></tr>');
  });

  it("handles two optional rows, one empty and one not", () => {
    const html =
      `<tr class="radar-optional"><td>EMPTY LABEL</td></tr>` +
      `<tr class="radar-optional"><td>LABEL<p>content</p></td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe(
      '<tr class="radar-optional"><td>LABEL<p>content</p></td></tr>'
    );
  });

  it("treats a row holding only an unresolved merge tag as content, not emptiness", () => {
    // Guards the ordering rule: hardening runs after substitution. Running it before would
    // keep this row and ship a visible placeholder, which is louder than an orphan heading.
    const html = `<tr class="radar-optional"><td>LABEL{{trend_radar}}</td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("leaves HTML with no optional rows untouched", () => {
    const html = "<table><tr><td>x</td></tr></table>";
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("returns malformed markup unchanged rather than guessing where the row ends", () => {
    // An unbalanced element means the extent is unknowable. Guessing would delete real
    // content, so the only safe answer is to leave it alone.
    const html = `<tr class="radar-optional"><td>LABEL`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("keeps a row whose content is only a number, like a bare percentage", () => {
    const html = `<tr class="radar-optional"><td>AGENTS<span>62%</span></td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("does not treat a class attribute or a style as content", () => {
    // Stripping tags has to remove attributes too, or every row looks non-empty because its
    // own markup contains lowercase letters.
    const html = `<tr class="radar-optional" style="padding:10px"><td class="px">LABEL</td></tr>`;
    expect(dropEmptyOptionalRows(html)).toBe("");
  });
});

/**
 * Unlayer wraps every row in a div, then a table, then a column table, then a content table.
 * Toy markup does not exercise the depth counting, and the depth counting is the part that can
 * delete real content if it gets the extent wrong.
 *
 * This mirrors the export structure. A capture from the live editor is verified by hand when the
 * three templates are compared side by side, which is the only way to be certain the real
 * attribute order and whitespace behave the same.
 */
const unlayerRow = (rowClass: string, inner: string) =>
  `<div class="u-row-container" style="padding:0px">` +
  `<div class="u-row ${rowClass}" style="margin:0 auto;min-width:320px;max-width:640px">` +
  `<div style="border-collapse:collapse;display:table;width:100%">` +
  `<!--[if (mso)|(IE)]><table width="100%"><tr><td><![endif]-->` +
  `<div class="u-col u-col-100" style="max-width:320px;min-width:640px;display:table-cell">` +
  `<div style="width:100%!important">` +
  `<table style="font-family:arial,helvetica,sans-serif" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">` +
  `<tbody><tr><td class="v-container-padding-padding" style="padding:10px" align="left">` +
  inner +
  `</td></tr></tbody></table>` +
  `</div></div>` +
  `<!--[if (mso)|(IE)]></td></tr></table><![endif]-->` +
  `</div></div></div>`;

describe("dropEmptyOptionalRows against Unlayer's export shape", () => {
  it("removes an empty optional row without touching the rows around it", () => {
    const html =
      unlayerRow("keep-before", "<p>Real prose above.</p>") +
      unlayerRow("radar-optional", "<p>TREND RADAR</p>") +
      unlayerRow("keep-after", "<p>Real prose below.</p>");

    const out = dropEmptyOptionalRows(html);

    expect(out).not.toContain("TREND RADAR");
    expect(out).toContain("Real prose above.");
    expect(out).toContain("Real prose below.");
    expect(out).toContain("keep-before");
    expect(out).toContain("keep-after");
  });

  it("keeps an optional row that has content, byte identical", () => {
    const html = unlayerRow("radar-optional", "<p>TREND RADAR</p><p>Agents rose 62%.</p>");
    expect(dropEmptyOptionalRows(html)).toBe(html);
  });

  it("counts the depth correctly with an optional row nested inside another row", () => {
    const html = unlayerRow(
      "outer keep",
      "<p>Prose.</p>" + unlayerRow("radar-optional", "<p>INTERNAL</p>")
    );

    const out = dropEmptyOptionalRows(html);
    expect(out).not.toContain("INTERNAL");
    expect(out).toContain("Prose.");
    expect(out).toContain("outer keep");
  });

  it("is idempotent on the export shape", () => {
    const html =
      unlayerRow("radar-optional", "<p>TREND RADAR</p>") +
      unlayerRow("radar-optional", "<p>INTERNAL</p><p>Something happened.</p>");

    const once = dropEmptyOptionalRows(html);
    expect(dropEmptyOptionalRows(once)).toBe(once);
  });
});

describe("hardenExportedHtml", () => {
  it("runs all three and is idempotent", () => {
    const input =
      `<html><head></head><body>` +
      `<img class="logo-dark" src="d.png">` +
      `<tr class="radar-optional"><td>LABEL</td></tr>` +
      `</body></html>`;

    const once = hardenExportedHtml(input);
    expect(once).toContain("prefers-color-scheme: dark");
    expect(once).toContain("[if !mso]");
    expect(once).not.toContain("radar-optional");
    expect(hardenExportedHtml(once)).toBe(once);
  });

  it("does not mistake the injected .logo-dark selector for an img to wrap", () => {
    // The injected CSS contains `.logo-dark` as a selector. Dropping and wrapping run before
    // injection so the scanner never walks the stylesheet, and this is the assertion that
    // catches a reordering.
    const html = hardenExportedHtml("<html><head></head><body></body></html>");
    expect(html).not.toContain("[if !mso]");
  });
});

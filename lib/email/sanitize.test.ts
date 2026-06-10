import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeBlockHtml, sanitizeImageUrl } from "./sanitize";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;"
    );
  });
});

describe("sanitizeBlockHtml", () => {
  it("returns empty string for falsy input", () => {
    expect(sanitizeBlockHtml("")).toBe("");
  });

  it("preserves benign formatting markup", () => {
    const input = "<p>Hello <strong>world</strong> <a href=\"https://example.com\">link</a></p>";
    expect(sanitizeBlockHtml(input)).toBe(input);
  });

  it("strips script tags and their contents", () => {
    const out = sanitizeBlockHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>ok</p>");
  });

  it("strips style, iframe, object, embed, link, meta tags", () => {
    for (const tag of ["style", "iframe", "object", "embed", "link", "meta"]) {
      const out = sanitizeBlockHtml(`<${tag} src="x">content</${tag}>`);
      expect(out.toLowerCase()).not.toContain(`<${tag}`);
    }
  });

  it("removes inline event handlers", () => {
    const out = sanitizeBlockHtml('<div onclick="steal()" onmouseover=\'x\'>hi</div>');
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toContain("hi");
  });

  it("neutralizes javascript: and data: URLs", () => {
    const out = sanitizeBlockHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:alert/i);
  });
});

describe("sanitizeImageUrl", () => {
  it("allows http(s) URLs", () => {
    expect(sanitizeImageUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png"
    );
    expect(sanitizeImageUrl("  http://example.com/b.jpg  ")).toBe(
      "http://example.com/b.jpg"
    );
  });

  it("rejects non-http schemes", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeImageUrl("data:image/png;base64,AAAA")).toBe("");
    expect(sanitizeImageUrl("")).toBe("");
  });

  it("escapes quotes to prevent attribute breakout", () => {
    expect(sanitizeImageUrl('https://x.com/a"onerror="alert(1)')).toBe(
      "https://x.com/a&quot;onerror=&quot;alert(1)"
    );
  });
});

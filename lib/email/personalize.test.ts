import { describe, it, expect } from "vitest";
import { injectUnsubscribeUrl } from "./personalize";

const URL = "https://app.example.com/unsubscribe?token=abc.def";

describe("injectUnsubscribeUrl", () => {
  it("replaces {{unsubscribe_url}} placeholders (any casing/spacing)", () => {
    const html = '<a href="{{unsubscribe_url}}">bye</a> <a href="{{ unsubscribeUrl }}">bye2</a>';
    const out = injectUnsubscribeUrl(html, URL);
    expect(out).toBe(`<a href="${URL}">bye</a> <a href="${URL}">bye2</a>`);
  });

  it("appends a footer before </body> when no placeholder exists", () => {
    const out = injectUnsubscribeUrl("<html><body><p>hi</p></body></html>", URL);
    expect(out).toContain(URL);
    expect(out.indexOf(URL)).toBeLessThan(out.indexOf("</body>"));
  });

  it("appends at the end when there is no body tag", () => {
    const out = injectUnsubscribeUrl("<p>hi</p>", URL);
    expect(out).toContain(URL);
  });

  it("leaves HTML untouched when a tokenized unsubscribe link already exists", () => {
    const html = `<p>x</p><a href="${URL}">Unsubscribe</a>`;
    expect(injectUnsubscribeUrl(html, "https://other/unsubscribe?token=zzz")).toBe(html);
  });
});

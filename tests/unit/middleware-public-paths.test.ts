import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The session route must stay public, and this test exists because the failure mode is
 * invisible from the code.
 *
 * `/api/auth/session` is what creates a session, so requiring one to reach it is circular. The
 * middleware treats every `/api/` path as protected, so without an explicit exemption the POST
 * is redirected to `/login`, which has no POST handler, and the browser receives **405**. That
 * reads like a missing route handler and is actually a redirect landing somewhere that has
 * none, which is why it survived a code review and was caught by calling the deployed service.
 *
 * Asserted against the source text rather than by running the middleware, because middleware
 * needs a NextRequest and an Edge runtime to execute, and the thing worth protecting here is
 * one line in a list that somebody could tidy away.
 */
describe("middleware public paths", () => {
  const source = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

  it("exempts the session route, which creates the session", () => {
    expect(source).toContain('"/api/auth/session"');
  });

  it("still exempts the paths whose callers can never have a session", () => {
    // Each of these is load-bearing and each was, at some point, missing.
    for (const path of ["/unsubscribe", "/api/cron", "/api/webhooks", "/editions"]) {
      expect(source).toContain(`"${path}"`);
    }
  });

  it("does not exempt the dashboard or the api surface wholesale", () => {
    const publicBlock = source.slice(
      source.indexOf("const publicPaths"),
      source.indexOf("];", source.indexOf("const publicPaths"))
    );
    expect(publicBlock).not.toContain('"/dashboard"');
    expect(publicBlock).not.toContain('"/api"');
    // "/api/" would swallow every route including the ones that must stay guarded.
    expect(publicBlock).not.toContain('"/api/"');
  });
});

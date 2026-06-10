import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseJsonBody,
  errorResponse,
  ValidationError,
  emailField,
} from "./index";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const schema = z.object({
  email: emailField,
  name: z.string().min(1),
});

describe("parseJsonBody", () => {
  it("returns parsed data for a valid body", async () => {
    const data = await parseJsonBody(
      jsonRequest({ email: "User@Example.COM", name: "Jo" }),
      schema
    );
    expect(data).toEqual({ email: "user@example.com", name: "Jo" });
  });

  it("normalizes email (trim + lowercase)", async () => {
    const data = await parseJsonBody(
      jsonRequest({ email: "  Mixed@Case.io  ", name: "x" }),
      schema
    );
    expect(data.email).toBe("mixed@case.io");
  });

  it("throws ValidationError on schema mismatch", async () => {
    await expect(
      parseJsonBody(jsonRequest({ email: "not-an-email", name: "x" }), schema)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError on missing required field", async () => {
    await expect(
      parseJsonBody(jsonRequest({ email: "a@b.co" }), schema)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError on invalid JSON", async () => {
    await expect(
      parseJsonBody(jsonRequest("{not json"), schema)
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("errorResponse", () => {
  it("maps ValidationError to 400 with field details", async () => {
    let caught: unknown;
    try {
      await parseJsonBody(jsonRequest({ email: "bad", name: "" }), schema);
    } catch (e) {
      caught = e;
    }
    const res = errorResponse(caught);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Validation failed");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details.length).toBeGreaterThan(0);
    expect(json.details[0]).toHaveProperty("field");
    expect(json.details[0]).toHaveProperty("message");
  });

  it("maps Unauthorized errors to 401", async () => {
    const res = errorResponse(new Error("Unauthorized: Not authenticated"));
    expect(res.status).toBe(401);
  });

  it("maps Forbidden errors to 403", async () => {
    const res = errorResponse(new Error("Forbidden: Requires EDITOR role"));
    expect(res.status).toBe(403);
  });

  it("maps unknown errors to 500", async () => {
    const res = errorResponse(new Error("database exploded"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("database exploded");
  });
});

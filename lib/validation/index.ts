import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Thrown when a request body fails schema validation. Route catch blocks
 * map this to a 400 via errorResponse().
 */
export class ValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Throws ValidationError on invalid JSON or schema mismatch.
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ValidationError([
      {
        code: z.ZodIssueCode.custom,
        message: "Request body must be valid JSON",
        path: [],
      },
    ]);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}

/**
 * Map a caught error to a JSON NextResponse with the right status code.
 * Centralizes the ValidationError -> 400, Unauthorized -> 401,
 * Forbidden -> 403, fallback -> 500 mapping used across API routes.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      {
        success: false,
        error: "Validation failed",
        details: error.issues.map((i) => ({
          field: i.path.join(".") || "(root)",
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message.startsWith("Unauthorized")) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }

  if (error instanceof Error && error.message.startsWith("Forbidden")) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 }
  );
}

// ==================== Shared field schemas ====================

/** Email: trimmed, lowercased, RFC-ish validated */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("Invalid email format");

export const languageField = z.string().trim().min(1).max(10);
export const styleField = z.string().trim().min(1).max(50);
export const emailProviderField = z.enum(["resend", "graph"]);

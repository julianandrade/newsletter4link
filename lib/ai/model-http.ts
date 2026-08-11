/**
 * RQ-002 at the HTTP boundary: what a route answers when the configured model is refused.
 *
 * Separate from `lib/ai/model.ts`, which is deliberately framework-free so `lib/curation`
 * and the job stream can use the same sentence without importing a response type.
 *
 * The status is 422 rather than 500 or 400. Nothing failed on our side and the caller sent
 * nothing wrong: the organization's own setting names a model the provider will not serve,
 * which is a request that cannot be processed rather than a fault in it. 500 was what these
 * routes answered before, and it sent an editor to the logs for a problem whose fix is one
 * field in Settings.
 */

import { NextResponse } from "next/server";
import { UnusableModelError, modelRejectionMessage } from "@/lib/ai/model";

/**
 * The 422, or null when the failure is something else.
 *
 * Null rather than a thrown value, so a route's existing catch keeps its shape: two lines
 * at the top of it, and everything it already did stays where it was.
 */
export function modelRejectionResponse(error: unknown): NextResponse | null {
  if (!(error instanceof UnusableModelError)) return null;

  return NextResponse.json(
    {
      success: false,
      error: modelRejectionMessage(error),
      // Named in its own field as well as in the sentence, so a screen can show it without
      // parsing prose.
      model: error.model,
    },
    { status: 422 }
  );
}

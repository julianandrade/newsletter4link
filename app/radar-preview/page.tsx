import { notFound } from "next/navigation";
import RadarPreviewHarness from "./harness";

/**
 * Development-only gate for the verification harness.
 *
 * The harness renders every dashboard screen behind a fetch stub, which is how
 * UI work gets checked without a Supabase session. That is worth keeping, but
 * the route previously answered 200 to anyone in production: the fixtures are
 * invented so no data leaked, yet the screen inventory and the entire UI
 * structure were public.
 *
 * A server component is what makes this a real gate. Checking in the client
 * component would ship the markup and then hide it, which is not the same
 * thing.
 */
export default function RadarPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <RadarPreviewHarness />;
}

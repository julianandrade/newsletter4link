import { notFound } from "next/navigation";
import { getPlatformContext } from "@/lib/auth/platform-context";

/**
 * The gate on the whole platform area.
 *
 * It lives in the layout so no page added under `/dashboard/platform` can forget it. The
 * route handlers check again independently, because a route handler is reachable without
 * ever rendering this layout.
 *
 * `notFound()` rather than a redirect or a 403 page: a 403 confirms the area exists and
 * names it as a target for anyone with a valid session on an allowed domain. This is the
 * same choice `app/editions/[id]` already makes, answering one 404 for four distinct
 * failures.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getPlatformContext();

  if (!context) {
    notFound();
  }

  return <>{children}</>;
}

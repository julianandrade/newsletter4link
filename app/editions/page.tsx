import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { editionLabel } from "@/lib/editions/identity";
import { resolveIndexAccess } from "@/lib/email/archive-access";
import { generateToken } from "@/lib/email/unsubscribe-token";
import { weekRangeLabel } from "@/lib/radar/week";

/**
 * The editions this subscriber received.
 *
 * Same gate as the permalink: an `archive`-purpose HMAC bound to one subscriber, the raw prisma
 * client because a public route has no organization context, and scoping carried from the
 * verified subscriber's own organization.
 *
 * The list is built from SENT events rather than from the editions table, so it can only ever
 * show what actually reached this person. An edition that exists and was never sent to them does
 * not appear, and an edition sent to them stays listed even after it is archived.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditionIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  const access = await resolveIndexAccess(t, {
    findSubscriber: (subscriberId) =>
      prisma.subscriber.findUnique({
        where: { id: subscriberId },
        select: { active: true, organizationId: true },
      }),
  });

  if (!access.allowed) notFound();

  /**
   * Minted fresh rather than forwarding whatever arrived in the URL.
   *
   * The incoming token verified, so re-signing produces the same value; doing it this way means
   * the links on this page are canonical and do not carry along anything a reader appended.
   */
  const forward = generateToken("archive", access.subscriberId);

  const sentEvents = await prisma.emailEvent.findMany({
    where: {
      subscriberId: access.subscriberId,
      eventType: "SENT",
      edition: { organizationId: access.organizationId },
    },
    orderBy: { timestamp: "desc" },
    select: {
      timestamp: true,
      edition: { select: { id: true, title: true, week: true, year: true } },
    },
  });

  // One row per edition. A resend writes a second SENT event, and the reader wants the edition
  // listed once, at the date it first arrived.
  const seen = new Set<string>();
  const editions = sentEvents.filter((event) => {
    if (seen.has(event.edition.id)) return false;
    seen.add(event.edition.id);
    return true;
  });

  return (
    <main className="min-h-screen bg-[#eceeed] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-[640px]">
        <header className="mb-7">
          <div className="text-[20px] font-bold tracking-[2px] text-[#2d4449]">
            AI&nbsp;RADAR<span className="text-[#ff7901]">.</span>
          </div>
          <div className="mt-3 flex">
            <div className="h-[3px] w-16 bg-[#ff7901]" />
            <div className="h-[3px] flex-1 bg-[#dfe3e2]" />
          </div>
          <h1 className="mt-6 mb-0 font-serif text-[26px] leading-[32px] font-normal text-[#1a1d1e]">
            Your editions
          </h1>
          <p className="mt-2 mb-0 text-[14px] leading-[22px] text-[#3c4547]">
            Every AI Radar edition that reached your inbox.
          </p>
        </header>

        {editions.length === 0 ? (
          <div className="rounded border border-dashed border-[#cbd3d1] bg-[#fbfbfa] p-6 text-[14px] leading-[22px] text-[#6b7674]">
            Nothing has been sent to you yet. The first edition you receive will appear here.
          </div>
        ) : (
          <ul className="m-0 list-none bg-[#fbfbfa] p-0">
            {editions.map((event) => (
              <li
                key={event.edition.id}
                className="border-b border-[#ebeeed] last:border-b-0"
              >
                <Link
                  href={`/editions/${event.edition.id}?t=${encodeURIComponent(forward)}`}
                  className="block px-5 py-4 no-underline transition-colors hover:bg-[#e9eeee]"
                >
                  <div className="text-[11px] uppercase tracking-[1.2px] text-[#6b7674]">
                    {weekRangeLabel(event.edition.week, event.edition.year)}
                  </div>
                  <div className="mt-1 text-[17px] leading-[24px] font-bold text-[#1a1d1e]">
                    {editionLabel(event.edition)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-7 mb-0 text-[11px] leading-[17px] text-[#8a9491]">
          Summaries are machine-generated from public sources and may contain errors, so verify
          before client use.
        </p>
      </div>
    </main>
  );
}

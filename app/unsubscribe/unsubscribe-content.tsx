"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Unsubscribe, on a click rather than on a page load.
 *
 * This used to POST from a `useEffect`, so merely opening the URL unsubscribed the person. The
 * POST looked like a safeguard and was not one: the page performed it for you.
 *
 * That matters because corporate mail scanners open every link in an inbound message. Six emails
 * sent to a Linkroad address on 7 August 2026 came back from Resend marked "clicked" within
 * seconds, which was a scanner and not a person. Nobody was unsubscribed, because that particular
 * scanner fetches without running JavaScript, and the whole safety of seventeen subscriptions
 * rested on that. A scanner that renders pages, or a browser prefetching a link, would have
 * emptied the list quietly.
 *
 * A single button is still one click, so this does not make leaving harder in any way a reader
 * would notice. The genuinely frictionless path is the `List-Unsubscribe-Post` header, which mail
 * clients turn into their own native unsubscribe button; that is not implemented yet and is worth
 * doing, because it also helps deliverability.
 */
export default function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"ready" | "working" | "success" | "error">("ready");
  const [message, setMessage] = useState("");

  const token = searchParams.get("token");

  const linkProblem = useMemo(() => {
    if (token) return null;
    // Old emails linked with ?id=; those links are no longer honored.
    return searchParams.get("id")
      ? "This unsubscribe link is from an older newsletter and is no longer valid. Please use the link in a recent email, or contact your administrator."
      : "This unsubscribe link is not valid.";
  }, [token, searchParams]);

  const confirm = useCallback(async () => {
    if (!token) return;

    setStatus("working");

    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();

      if (data.success) {
        setStatus("success");
        setMessage("You have been unsubscribed.");
      } else {
        setStatus("error");
        setMessage(data.error || "That did not work. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong on the way. Please try again.");
    }
  }, [token]);

  const heading =
    linkProblem
      ? "This link has expired"
      : status === "success"
        ? "Unsubscribed"
        : status === "error"
          ? "That did not work"
          : "Unsubscribe from AI Radar?";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-radar-bg p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-[20px] font-bold tracking-[2px] text-radar-primary2">
          AI&nbsp;RADAR<span className="text-radar-accent">.</span>
        </div>

        <h1 className="mb-3 text-[26px] font-semibold text-radar-ink">{heading}</h1>

        {linkProblem && <p className="mb-8 text-[14px] text-radar-ink2">{linkProblem}</p>}

        {!linkProblem && status === "ready" && (
          <>
            <p className="mb-8 text-[14px] leading-[22px] text-radar-ink2">
              You will stop receiving the weekly edition. You can ask your administrator to add
              you back at any time.
            </p>
            <button
              type="button"
              onClick={confirm}
              className="rounded-md bg-radar-accent px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
            >
              Yes, unsubscribe me
            </button>
            <p className="mt-4 text-[12px] text-radar-ink3">
              Nothing changes until you press that.
            </p>
          </>
        )}

        {status === "working" && (
          <p className="mb-8 text-[14px] text-radar-ink2">Working on it…</p>
        )}

        {status === "success" && (
          <>
            <p className="mb-2 text-[14px] text-radar-ink2">{message}</p>
            <p className="text-[13px] text-radar-ink3">
              If you change your mind, ask your administrator to re-subscribe you.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <p className="mb-6 text-[14px] text-radar-ink2">{message}</p>
            <button
              type="button"
              onClick={confirm}
              className="rounded-md border border-radar-line px-5 py-2.5 text-[14px] text-radar-ink transition-colors hover:border-radar-accent"
            >
              Try again
            </button>
          </>
        )}

        <div className="mt-10">
          <a
            href="/"
            className="text-[13px] text-radar-ink3 underline hover:text-radar-accent"
          >
            Return to home
          </a>
        </div>
      </div>
    </main>
  );
}

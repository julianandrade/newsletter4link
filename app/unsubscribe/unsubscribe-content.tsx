"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const subscriberId = searchParams.get("id");

    if (!subscriberId) {
      setStatus("error");
      setMessage("Invalid unsubscribe link");
      return;
    }

    // Call unsubscribe API
    fetch(`/api/subscribers/${subscriberId}`, {
      method: "DELETE",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setMessage("You have been successfully unsubscribed.");
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to unsubscribe");
        }
      })
      .catch((error) => {
        setStatus("error");
        setMessage("An error occurred. Please try again.");
      });
  }, [searchParams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4">
          {status === "loading" && "Processing..."}
          {status === "success" && "Unsubscribed"}
          {status === "error" && "Error"}
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-8">{message}</p>

        {status === "success" && (
          <div className="space-y-4">
            <p className="text-sm">
              You will no longer receive newsletters from Link Consulting AI
              Newsletter.
            </p>
            <p className="text-sm text-gray-500">
              If you change your mind, please contact your administrator to
              re-subscribe.
            </p>
          </div>
        )}

        {status === "error" && (
          <p className="text-sm text-gray-500">
            Please contact support if you continue to experience issues.
          </p>
        )}

        <div className="mt-8">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-700 underline text-sm"
          >
            Return to home
          </a>
        </div>
      </div>
    </main>
  );
}

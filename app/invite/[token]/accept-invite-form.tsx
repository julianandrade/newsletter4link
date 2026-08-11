"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/radar/compat";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/radar/compat";
import { Badge } from "@/components/radar/compat";

interface AcceptInviteFormProps {
  token: string;
  organizationName: string;
  role: string;
  invitedEmail: string;
  userEmail: string;
}

export function AcceptInviteForm({
  token,
  organizationName,
  role,
  invitedEmail,
  userEmail,
}: AcceptInviteFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailMismatch = invitedEmail.toLowerCase() !== userEmail.toLowerCase();

  const handleAccept = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to accept invitation");
        setLoading(false);
        return;
      }

      // Success! Redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-radar-surface2 rounded-full flex items-center justify-center mb-4">
          <Building2 className="h-6 w-6 text-radar-accent" />
        </div>
        <CardTitle>Join {organizationName}</CardTitle>
        <CardDescription>
          You&apos;ve been invited to join as a{" "}
          <Badge variant="secondary" className="mx-1">
            {role.toLowerCase()}
          </Badge>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {emailMismatch && (
          <div className="p-3 bg-radar-surface2 border border-radar-warn rounded-md flex gap-2">
            <AlertCircle className="h-5 w-5 text-radar-warn shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-radar-warn">Email mismatch</p>
              <p className="text-radar-ink2">
                This invite was sent to <strong>{invitedEmail}</strong> but
                you&apos;re logged in as <strong>{userEmail}</strong>. You can still
                accept if this is intentional.
              </p>
            </div>
          </div>
        )}

        <div className="text-center text-sm text-radar-ink2">
          <p>By accepting, you&apos;ll gain access to:</p>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4 text-radar-ok" />
              View and manage newsletters
            </li>
            <li className="flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4 text-radar-ok" />
              Access curated content
            </li>
            <li className="flex items-center justify-center gap-2">
              <CheckCircle className="h-4 w-4 text-radar-ok" />
              Collaborate with team members
            </li>
          </ul>
        </div>

        {error && (
          <div className="p-3 bg-radar-surface2 text-radar-err text-sm rounded-md">
            {error}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push("/")}
          disabled={loading}
        >
          Decline
        </Button>
        <Button className="flex-1" onClick={handleAccept} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            "Accept Invitation"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ALLOWED_EMAIL_DOMAINS,
  DOMAIN_REJECTED_MESSAGE,
  allowedDomainsLabel,
} from "@/lib/auth/allowed-domains";
import { Button } from "@/components/radar/compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/radar/compat";
import { Input } from "@/components/radar/compat";
import { Label } from "@/components/radar/compat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/hooks";
import { gcipConfigured, signInWithMicrosoft } from "@/lib/gcip/client";

/**
 * Messages for the error codes the auth callback can hand back. Without these
 * the page rendered nothing at all and every failure looked like a dead button.
 */
const CALLBACK_ERRORS: Record<string, string> = {
  auth_failed: "Office 365 sign-in did not complete.",
  domain_not_allowed: DOMAIN_REJECTED_MESSAGE,
};

function LoginForm() {
  const searchParams = useSearchParams();
  const { signInWithAzure, signInWithPassword, signUp, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Surface whatever the OAuth round trip came back with. Microsoft's own
  // description is far more useful than "auth_failed", so show it when present.
  useEffect(() => {
    const code = searchParams.get("error");
    if (!code) return;
    const description = searchParams.get("error_description");
    const known = CALLBACK_ERRORS[code];
    setError(
      [known ?? "Sign-in failed.", description?.replace(/\+/g, " ")]
        .filter(Boolean)
        .join(" ")
    );
  }, [searchParams]);

  const handleAzureLogin = async () => {
    setError(null);
    setLoading(true);

    // Identity Platform where it is configured, Supabase everywhere else. The same button and
    // the same Entra app registration behind both, so a user sees no difference; only the
    // service issuing the session changes.
    if (gcipConfigured()) {
      const result = await signInWithMicrosoft();
      if (!result.ok) {
        // An empty message means the user closed the popup, which is a decision rather than a
        // failure and does not deserve an error banner.
        if (result.error) setError(result.error);
        setLoading(false);
        return;
      }
      // The session cookie exists now, and a full navigation is what makes the server see it.
      window.location.assign("/dashboard");
      return;
    }

    const { error } = await signInWithAzure();
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // Redirect happens automatically via OAuth flow
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { error } = await signInWithPassword(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Password accounts owe a second factor. A full navigation rather than a
    // client push, so the middleware sees the new session and routes to the
    // step-up page or the dashboard as appropriate.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { error } = await signUp(email, password);

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for the confirmation link.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-radar-bg p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Newsletter Admin</CardTitle>
          <p className="text-radar-ink2 text-sm">
            Sign in to manage your newsletter
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Office 365 Button */}
          <Button
            onClick={handleAzureLogin}
            disabled={loading || authLoading}
            className="w-full bg-[#0078d4] hover:bg-[#106ebe] text-white"
            size="lg"
          >
            <svg
              className="mr-2 h-5 w-5"
              viewBox="0 0 21 21"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {loading ? "Signing in..." : "Sign in with Office 365"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-radar-bg px-2 text-radar-ink2">
                or
              </span>
            </div>
          </div>

          {/* Email/Password Tabs */}
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0]}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0]}`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-radar-ink3">
                    {allowedDomainsLabel()} addresses only. You will set up an
                    authenticator app after signing in.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Error Message */}
          {error && (
            <div className="p-3 text-sm text-radar-err bg-radar-surface rounded-md">
              {error}
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div className="p-3 text-sm text-radar-ok bg-radar-surface rounded-md">
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * useSearchParams opts a component out of prerendering, so the form that reads
 * the callback's error code sits behind a boundary rather than making the whole
 * login route dynamic.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-radar-bg p-4">
          <p className="text-sm text-radar-ink2">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

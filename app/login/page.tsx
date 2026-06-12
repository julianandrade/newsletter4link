"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/hooks";

// E2E/CI only: the credentials form (password sign-in) is rendered solely when
// NEXT_PUBLIC_E2E_TEST_MODE === "true". In production this is unset, so the only
// sign-in path is Microsoft Entra ID. Never set this flag in production.
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithMicrosoft, signInWithCredentials, loading: authLoading } = useAuth();

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleMicrosoftLogin = async () => {
    setError(null);
    setLoading(true);
    // Redirects to the Entra hosted login; redirect back happens via OAuth.
    await signInWithMicrosoft(redirectTo);
  };

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signInWithCredentials(email, password, redirectTo);

    if (signInError) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      router.push(redirectTo);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Newsletter Admin</CardTitle>
          <p className="text-muted-foreground text-sm">
            Sign in to manage your newsletter
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Primary action: Microsoft Entra ID */}
          <Button
            onClick={handleMicrosoftLogin}
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
            {loading ? "Signing in..." : "Sign in with Microsoft"}
          </Button>

          {/* E2E-only password form. Hidden in production. */}
          {E2E_MODE && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    or
                  </span>
                </div>
              </div>

              <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
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
            </>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

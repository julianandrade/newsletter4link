"use client";

/**
 * Second-factor step-up for password sign-ins.
 *
 * One page for both cases, because the user does not care which one they are
 * in: if there is no verified factor it shows a QR code to scan first, and
 * either way it ends with six digits. The middleware sends every password
 * session here until it reaches aal2, so this page is the only thing such a
 * session can reach.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/hooks";
import { RadarButton, PageHeading } from "@/components/radar/primitives";
import { Callout, RadarField, RadarInput, RadarPanel } from "@/components/radar/controls";

type Stage = "loading" | "enroll" | "challenge" | "done";

export default function MfaPage() {
  const router = useRouter();
  const {
    loading: authLoading,
    getMfaRequirement,
    enrollTotp,
    verifyTotp,
    getTotpFactor,
    signOut,
  } = useAuth();

  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Enrollment mints a factor server-side, so it must not run twice on the
  // same mount (React re-invokes effects in development).
  const started = useRef(false);

  useEffect(() => {
    if (authLoading || started.current) return;
    started.current = true;

    const prepare = async () => {
      const requirement = await getMfaRequirement();

      if (requirement.kind === "satisfied") {
        router.replace("/dashboard");
        return;
      }

      if (requirement.kind === "challenge") {
        const factor = await getTotpFactor();
        if (!factor) {
          setError("No authenticator is registered for this account.");
          setStage("enroll");
          return;
        }
        setFactorId(factor.id);
        setStage("challenge");
        return;
      }

      const { data, error: enrollError } = await enrollTotp();
      if (enrollError || !data) {
        setError(enrollError?.message ?? "Could not start enrollment.");
        setStage("enroll");
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStage("enroll");
    };

    prepare().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setStage("enroll");
    });
  }, [authLoading, getMfaRequirement, getTotpFactor, enrollTotp, router]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!factorId) return;

      setError(null);
      setBusy(true);

      const { error: verifyError } = await verifyTotp(factorId, code);

      if (verifyError) {
        setError(verifyError.message);
        setCode("");
        setBusy(false);
        return;
      }

      setStage("done");
      // A full navigation, so the middleware re-reads the upgraded session
      // rather than serving a client route from the old assurance level.
      window.location.assign("/dashboard");
    },
    [factorId, code, verifyTotp]
  );

  if (stage === "loading" || authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-radar-bg p-4">
        <p className="text-sm text-radar-ink2">Checking your account…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-radar-bg p-4">
      <div className="w-full max-w-[440px]">
        <PageHeading
          eyebrow="Security"
          title={qrCode ? "Set up your authenticator" : "Enter your code"}
          subtitle={
            qrCode
              ? "Password accounts need a second factor. Scan this with Microsoft Authenticator, 1Password, or any TOTP app, then enter the code it shows."
              : "Open your authenticator app and enter the six-digit code for AI Radar."
          }
        />

        <RadarPanel className="mt-6 p-6">
          {qrCode && (
            <div className="mb-6">
              {/* Supabase returns the QR as an SVG data URL. */}
              <img
                src={qrCode}
                alt="QR code for enrolling this account in your authenticator app"
                width={200}
                height={200}
                className="mx-auto block bg-white p-3"
              />
              {secret && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[1.2px] text-radar-ink3 mb-1">
                    Or enter this key manually
                  </p>
                  <code className="block break-all text-sm text-radar-ink1 bg-radar-surface2 p-2">
                    {secret}
                  </code>
                </div>
              )}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <RadarField label="Six-digit code" htmlFor="totp-code">
              <RadarInput
                id="totp-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                autoFocus
                required
                disabled={busy}
              />
            </RadarField>

            {error && <Callout tone="err" title="Could not verify">
                {error}
              </Callout>}

            <RadarButton
              type="submit"
              variant="accent"
              className="w-full"
              disabled={busy || code.length !== 6 || !factorId}
            >
              {busy ? "Verifying…" : qrCode ? "Confirm and continue" : "Verify"}
            </RadarButton>
          </form>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.assign("/login");
            }}
            className="mt-6 text-sm text-radar-ink3 hover:text-radar-accent underline"
          >
            Sign in with a different account
          </button>
        </RadarPanel>
      </div>
    </main>
  );
}

"use client";

/**
 * RQ-005: the current member's role, for hiding controls a role cannot use.
 *
 * A stand-in for `components/radar/use-role.ts` and `lib/auth/roles.ts`, which
 * unit A of this requirement owns and which had not landed when the proposal
 * screen was written. When they do land, replace `useCanEdit()` with
 * `useOrgRole().atLeast("EDITOR")` and delete this file: the hierarchy belongs in
 * one place, not two.
 *
 * The server is the authority either way. This only decides what to render, and
 * a request from a role that is too low is refused 403 regardless.
 */

import { useEffect, useState } from "react";

const ROLE_ORDER = ["VIEWER", "EDITOR", "ADMIN", "OWNER"] as const;
type RoleName = (typeof ROLE_ORDER)[number];

export function useCanEdit(): {
  role: string | null;
  loading: boolean;
  canEdit: boolean;
} {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/organizations/current")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setRole(json?.membership?.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // While loading, no control is offered: better absent for a moment than
  // flashing in for someone whose request the server would then refuse.
  const index = role ? ROLE_ORDER.indexOf(role as RoleName) : -1;

  return { role, loading, canEdit: index >= ROLE_ORDER.indexOf("EDITOR") };
}

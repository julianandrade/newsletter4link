"use client";

/**
 * RQ-005 tech spec 4.1.1: the current member's role, for hiding controls a role
 * cannot use.
 *
 * The server is the authority. This decides what to render and nothing else: a
 * request from a role that is too low is refused 403 whatever this returns, and no
 * control here is the only thing standing between a VIEWER and a send.
 *
 * Replaces `components/proposal/use-can-edit.ts`, which carried its own copy of
 * the hierarchy because this module had not landed yet.
 */

import { useCallback, useEffect, useState } from "react";
import { hasRoleAtLeast, isRoleName, type RoleName } from "@/lib/auth/roles";

export interface OrgRoleState {
  role: RoleName | null;
  loading: boolean;
  error: string | null;
  atLeast: (min: RoleName) => boolean;
}

export function useOrgRole(): OrgRoleState {
  const [role, setRole] = useState<RoleName | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/organizations/current")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not read your role (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const value = json?.membership?.role;
        setRole(isRoleName(value) ? value : null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setRole(null);
        setError(cause instanceof Error ? cause.message : "Could not read your role");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // While loading, and after a failure, every answer is false. A control that is
  // briefly absent is better than one that flashes into view for someone whose
  // request the server would then refuse.
  const atLeast = useCallback(
    (min: RoleName) => (loading ? false : hasRoleAtLeast(role, min)),
    [loading, role]
  );

  return { role, loading, error, atLeast };
}

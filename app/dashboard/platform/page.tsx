"use client";

/**
 * Every organization on the platform.
 *
 * The screen that exists because an administrator could not see organizations nobody
 * invited them to. Archived organizations are shown and marked rather than hidden: hiding
 * them here would recreate the original problem one level up, which is the whole complaint.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import { Callout, EmptyState, RadarField, RadarInput, SkeletonRows } from "@/components/radar/controls";

interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  archivedAt: string | null;
  createdAt: string;
  counts: { articles: number; subscribers: number; editions: number };
}

export default function PlatformPage() {
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/platform/orgs");
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not load organizations.");
      }

      setOrgs(Array.isArray(payload.data) ? payload.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load.");
      setOrgs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim() || !slug.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/platform/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not create it.");
      }

      setName("");
      setSlug("");
      setCreating(false);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create it.");
    } finally {
      setSaving(false);
    }
  }

  const live = orgs.filter((org) => !org.archivedAt);
  const archived = orgs.filter((org) => org.archivedAt);

  return (
    <>
      <AppHeader />
      <RadarMain width="list">
        <PageHeading
          eyebrow="Platform"
          title="Organizations"
          subtitle={`${live.length} live${archived.length > 0 ? `, ${archived.length} archived` : ""}. Every organization on the platform, including the ones you are not a member of.`}
          actions={
            <RadarButton variant="accent" onClick={() => setCreating((open) => !open)}>
              {creating ? "Cancel" : "New organization"}
            </RadarButton>
          }
        />

        {error && (
          <Callout tone="err" title="Something went wrong" className="mb-5">
            {error}
          </Callout>
        )}

        {creating && (
          <section className="mb-6 rounded-xl border border-radar-line bg-radar-surface p-5">
            <SectionLabel>New organization</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <RadarField label="Name">
                <RadarInput
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Link Consulting"
                />
              </RadarField>
              <RadarField
                label="Slug"
                hint="Lowercase, digits and single hyphens. This is what you type to delete it."
              >
                <RadarInput
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="link-consulting"
                />
              </RadarField>
            </div>
            <RadarButton
              className="mt-3"
              variant="accent"
              onClick={create}
              disabled={saving || !name.trim() || !slug.trim()}
            >
              {saving ? "Creating..." : "Create"}
            </RadarButton>
          </section>
        )}

        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : orgs.length === 0 ? (
          <EmptyState title="No organizations">
            Nothing exists on this platform yet.
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[...live, ...archived].map((org) => (
              <li key={org.id}>
                <Link
                  href={`/dashboard/platform/${org.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-radar-line bg-radar-surface px-4 py-3 no-underline transition-colors hover:border-radar-ink2"
                >
                  <span className="min-w-[180px] flex-1">
                    <span className="block text-[14px] font-medium text-radar-ink">
                      {org.name}
                    </span>
                    <span className="block text-[12px] text-radar-ink2">{org.slug}</span>
                  </span>

                  {org.archivedAt ? (
                    <StatusChip tone="warn">Archived</StatusChip>
                  ) : (
                    <StatusChip tone="ok">Live</StatusChip>
                  )}

                  <span className="text-[12px] text-radar-ink2">{org.plan}</span>

                  <span className="flex gap-4 text-[12px] text-radar-ink2">
                    <span>
                      <Num>{org.counts.articles}</Num> articles
                    </span>
                    <span>
                      <Num>{org.counts.subscribers}</Num> subscribers
                    </span>
                    <span>
                      <Num>{org.counts.editions}</Num> editions
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </RadarMain>
    </>
  );
}

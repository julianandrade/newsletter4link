"use client";

/**
 * One organization: its record, what it holds, and how to wind it down.
 *
 * The delete confirmation is the only warning anyone gets, because this schema has no audit
 * table and the cascade takes 19 relations. So the numbers shown here are live counts rather
 * than estimates, and the sent-editions figure is called out separately: it is the one that
 * represents mail already in a real person's inbox.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  Callout,
  RadarField,
  RadarInput,
  SkeletonRows,
} from "@/components/radar/controls";
import { CASCADING_RELATIONS } from "@/lib/platform/delete-guard";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  industry: string;
  subscriberLimit: number;
  archivedAt: string | null;
  createdAt: string;
}

type Inventory = Record<string, number>;

export default function PlatformOrgPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [org, setOrg] = useState<Organization | null>(null);
  const [inventory, setInventory] = useState<Inventory>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/platform/orgs/${id}`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not load this organization.");
      }

      setOrg(payload.data.organization);
      setInventory(payload.data.inventory ?? {});
      setName(payload.data.organization.name);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, successNote: string) {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/orgs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not save.");
      }

      setOrg(payload.data);
      setNotice(successNote);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/platform/orgs/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not delete it.");
      }

      router.push("/dashboard/platform");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete it.");
      setSaving(false);
    }
  }

  async function grantMembership() {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform/orgs/${id}/membership`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Could not grant access.");
      }

      setNotice(
        `You now hold ${payload.data.role} on this organization. Switch to it from the organization picker to use the dashboard.`
      );
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : "Could not grant access.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <AppHeader />
        <RadarMain width="list">
          <SkeletonRows rows={6} />
        </RadarMain>
      </>
    );
  }

  if (!org) {
    return (
      <>
        <AppHeader />
        <RadarMain width="list">
          <Callout tone="err" title="Not available">
            {error ?? "This organization could not be loaded."}
          </Callout>
        </RadarMain>
      </>
    );
  }

  const isArchived = Boolean(org.archivedAt);
  const sentEditions = inventory.sentEditions ?? 0;

  return (
    <>
      <AppHeader />
      <RadarMain width="list">
        <PageHeading
          eyebrow="Platform · Organization"
          title={org.name}
          subtitle={`${org.slug} · ${org.plan} · created ${new Date(org.createdAt).toLocaleDateString("en-GB")}`}
          actions={
            <>
              <RadarButton onClick={() => router.push("/dashboard/platform")}>
                All organizations
              </RadarButton>
              {isArchived ? (
                <StatusChip tone="warn">Archived</StatusChip>
              ) : (
                <StatusChip tone="ok">Live</StatusChip>
              )}
            </>
          }
        />

        {error && (
          <Callout tone="err" title="Something went wrong" className="mb-5">
            {error}
          </Callout>
        )}

        {notice && (
          <Callout tone="ok" title="Done" className="mb-5">
            {notice}
          </Callout>
        )}

        {isArchived && (
          <Callout tone="warn" title="This organization is archived" className="mb-6">
            It is hidden from the organization picker, skipped by the scheduled collection
            and proposal jobs, and cannot be sent from. Its data is untouched and restoring
            it undoes all of that.
          </Callout>
        )}

        {/* The record */}
        <section className="mb-6 rounded-xl border border-radar-line bg-radar-surface p-5">
          <SectionLabel>Record</SectionLabel>
          <div className="mt-3 max-w-[420px]">
            <RadarField label="Name">
              <RadarInput
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </RadarField>
          </div>
          <RadarButton
            className="mt-3"
            onClick={() => patch({ name }, "Name saved.")}
            disabled={saving || !name.trim() || name === org.name}
          >
            {saving ? "Saving..." : "Save"}
          </RadarButton>
        </section>

        {/* Reaching the data through the normal dashboard */}
        <section className="mb-6 rounded-xl border border-radar-line bg-radar-surface p-5">
          <SectionLabel>Access</SectionLabel>
          <p className="mt-2 mb-3 text-[12.5px] text-radar-ink2">
            Editing this organization&apos;s articles, subscribers or editions happens on the
            normal dashboard. This writes you a real OWNER membership so you can switch to it,
            rather than giving the platform area a second copy of every screen. The membership
            is a real row, so anything you then do is attributed to you.
          </p>
          <RadarButton onClick={grantMembership} disabled={saving || isArchived}>
            Grant me membership
          </RadarButton>
          {isArchived && (
            <p className="mt-2 mb-0 text-[11.5px] text-radar-ink3">
              Restore it first: an archived organization cannot appear in the picker, so the
              membership would do nothing.
            </p>
          )}
        </section>

        {/* What is in here */}
        <section className="mb-6 rounded-xl border border-radar-line bg-radar-surface p-5">
          <SectionLabel>Contents</SectionLabel>
          <p className="mt-2 mb-3 text-[12.5px] text-radar-ink2">
            Everything below is destroyed by a permanent delete, and nothing else refers to it.
          </p>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-3">
            {CASCADING_RELATIONS.map((relation) => (
              <li
                key={relation}
                className="flex items-baseline justify-between gap-3 text-[12.5px] text-radar-ink2"
              >
                <span>{relation}</span>
                <Num>{inventory[relation] ?? 0}</Num>
              </li>
            ))}
          </ul>

          {sentEditions > 0 && (
            <Callout tone="warn" title="Some of these editions were sent" className="mt-4">
              <Num>{sentEditions}</Num> of this organization&apos;s editions have been
              delivered to real inboxes. Deleting destroys the record of what was sent, and
              there is no audit table and no export.
            </Callout>
          )}
        </section>

        {/* Winding down */}
        <section className="rounded-xl border border-radar-line bg-radar-surface p-5">
          <SectionLabel>Wind down</SectionLabel>

          {!isArchived ? (
            <>
              <p className="mt-2 mb-3 text-[12.5px] text-radar-ink2">
                Archiving is reversible. It hides the organization from the picker, stops the
                scheduled jobs from touching it, and prevents sending. Nothing is deleted.
              </p>
              <RadarButton
                onClick={() => patch({ archived: true }, "Archived.")}
                disabled={saving}
              >
                Archive
              </RadarButton>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <RadarButton
                  onClick={() => patch({ archived: false }, "Restored.")}
                  disabled={saving}
                >
                  Restore
                </RadarButton>
                <RadarButton
                  onClick={() => setConfirmingDelete((open) => !open)}
                  disabled={saving}
                >
                  {confirmingDelete ? "Cancel" : "Delete permanently"}
                </RadarButton>
              </div>

              {confirmingDelete && (
                <div className="mt-4 rounded-lg border-l-[3px] border-radar-err bg-radar-bg px-4 py-3">
                  <p className="m-0 text-[13px] text-radar-ink">
                    This cannot be undone. It destroys{" "}
                    <Num>{inventory.articles ?? 0}</Num> articles,{" "}
                    <Num>{inventory.subscribers ?? 0}</Num> subscribers and{" "}
                    <Num>{inventory.editions ?? 0}</Num> editions
                    {sentEditions > 0 ? (
                      <>
                        , <Num>{sentEditions}</Num> of which were already sent
                      </>
                    ) : null}
                    , across 19 relations. There is no export and no audit record.
                  </p>
                  <div className="mt-3 max-w-[320px]">
                    <RadarField
                      label={`Type the slug to confirm: ${org.slug}`}
                      hint="The slug, not the name. Deliberately harder than clicking."
                    >
                      <RadarInput
                        value={confirmSlug}
                        onChange={(event) => setConfirmSlug(event.target.value)}
                        placeholder={org.slug}
                        aria-label="Organization slug"
                      />
                    </RadarField>
                  </div>
                  <RadarButton
                    className="mt-3"
                    variant="accent"
                    onClick={destroy}
                    disabled={saving || confirmSlug.trim() !== org.slug}
                  >
                    {saving ? "Deleting..." : "Delete permanently"}
                  </RadarButton>
                </div>
              )}
            </>
          )}
        </section>

        <p className="mt-6 text-[11.5px] text-radar-ink3">
          <Link href="/dashboard/platform" className="underline">
            Back to all organizations
          </Link>
        </p>
      </RadarMain>
    </>
  );
}

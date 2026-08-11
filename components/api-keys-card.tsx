"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RadarButton,
  SectionLabel,
  StatusChip,
} from "@/components/radar/primitives";
import {
  Callout,
  RadarField,
  RadarInput,
  RadarPanel,
  RadarSelect,
  SkeletonRows,
} from "@/components/radar/controls";
import { relativeTime } from "@/lib/radar/source";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface NewApiKey extends ApiKey {
  key: string; // Full key, only shown once
}

interface ApiKeysCardProps {
  plan: string;
  hasAccess: boolean;
}

const EXPIRY_OPTIONS: [string, string][] = [
  ["never", "Never expires"],
  ["30", "In 30 days"],
  ["90", "In 90 days"],
  ["365", "In a year"],
];

export function ApiKeysCard({ plan, hasAccess }: ApiKeysCardProps) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New key creation
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState<string>("never");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<NewApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (hasAccess) {
      fetchApiKeys();
    } else {
      setIsLoading(false);
    }
  }, [hasAccess]);

  async function fetchApiKeys() {
    try {
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      const data = await res.json();
      setApiKeys(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setIsLoading(false);
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const expiresInDays =
        newKeyExpiry === "never" ? null : parseInt(newKeyExpiry, 10);

      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          expiresInDays,
        }),
      });

      if (!res.ok) {
        const failure = await res.json();
        throw new Error(failure.error || "Failed to create API key");
      }

      const data = await res.json();
      setNewlyCreatedKey(data.data);
      setApiKeys([data.data, ...apiKeys]);
      setNewKeyName("");
      setNewKeyExpiry("never");
      setShowCreate(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create that key"
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function deleteApiKey(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const failure = await res.json();
        throw new Error(failure.error || "Failed to delete API key");
      }

      setApiKeys(apiKeys.filter((k) => k.id !== id));
      setDeleteTarget(null);
      toast.success("Key revoked");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not revoke that key"
      );
    } finally {
      setDeletingId(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hasAccess) {
    return (
      <RadarPanel
        title="API keys"
        note={`Available from the Professional plan. This organization is on ${plan}.`}
        actions={<StatusChip tone="neutral">Professional</StatusChip>}
      >
        <p className="m-0 text-[12.5px] text-radar-ink2 text-pretty">
          A key lets your own systems read curated stories and editions, and push
          subscribers in, without going through this dashboard.
        </p>
      </RadarPanel>
    );
  }

  return (
    <>
      <RadarPanel
        title="API keys"
        note="Each key carries the same rights as an editor. Revoke rather than share."
        actions={
          <RadarButton size="sm" onClick={() => setShowCreate(true)}>
            New key
          </RadarButton>
        }
        padded={apiKeys.length === 0 || isLoading || Boolean(error)}
      >
        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : error ? (
          <Callout
            tone="err"
            title="Keys could not be loaded"
            actions={
              <RadarButton size="sm" onClick={() => void fetchApiKeys()}>
                Try again
              </RadarButton>
            }
          >
            {error}
          </Callout>
        ) : apiKeys.length === 0 ? (
          <p className="m-0 text-[12.5px] text-radar-ink3">
            No keys yet. Create one when an integration needs to read from here.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {apiKeys.map((key) => {
              const expired =
                key.expiresAt && new Date(key.expiresAt).getTime() < Date.now();

              return (
                <li
                  key={key.id}
                  className="flex flex-col gap-2.5 border-b border-radar-line2 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-radar-ink">
                        {key.name}
                      </span>
                      <code className="font-num rounded border border-radar-line2 bg-radar-surface2 px-1.5 py-0.5 text-[11px] text-radar-ink2">
                        {key.keyPrefix}…
                      </code>
                      {expired && <StatusChip tone="err">Expired</StatusChip>}
                    </div>
                    <p className="mt-1 mb-0 text-[11.5px] text-radar-ink3">
                      Created {relativeTime(key.createdAt)}
                      {key.lastUsedAt
                        ? ` · last used ${relativeTime(key.lastUsedAt)}`
                        : " · never used"}
                      {key.expiresAt
                        ? ` · expires ${new Date(key.expiresAt).toLocaleDateString("en-GB")}`
                        : " · no expiry"}
                    </p>
                  </div>

                  <RadarButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(key)}
                    disabled={deletingId === key.id}
                    className="shrink-0 hover:border-radar-err hover:text-radar-err"
                  >
                    {deletingId === key.id ? "Revoking…" : "Revoke"}
                  </RadarButton>
                </li>
              );
            })}
          </ul>
        )}
      </RadarPanel>

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
            <DialogDescription>
              The full key is shown once, immediately after creation. Store it in
              your secrets manager before closing that dialog.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <RadarField
              label="What is it for"
              htmlFor="api-key-name"
              required
              hint="Name the system that will use it, so revoking later is obvious."
            >
              <RadarInput
                id="api-key-name"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
                placeholder="Intranet sync"
              />
            </RadarField>

            <RadarField label="Expiry" htmlFor="api-key-expiry">
              <RadarSelect
                id="api-key-expiry"
                value={newKeyExpiry}
                onChange={(event) => setNewKeyExpiry(event.target.value)}
              >
                {EXPIRY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </RadarSelect>
            </RadarField>
          </div>

          <DialogFooter>
            <RadarButton onClick={() => setShowCreate(false)} disabled={isCreating}>
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={createApiKey}
              disabled={isCreating || !newKeyName.trim()}
            >
              {isCreating ? "Creating…" : "Create key"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shown once */}
      <Dialog
        open={!!newlyCreatedKey}
        onOpenChange={(open) => !open && setNewlyCreatedKey(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>
              This is the only time it is shown. Once this dialog closes, only the
              prefix remains visible.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <SectionLabel>{newlyCreatedKey?.name}</SectionLabel>
            <code className="font-num block rounded-lg border border-radar-line bg-radar-surface2 px-3 py-2.5 text-[12px] break-all text-radar-ink">
              {newlyCreatedKey?.key}
            </code>
            <Callout tone="warn" title="Treat it like a password">
              It carries editor rights over this organization&rsquo;s data. Keep it
              out of client-side code, screenshots and tickets.
            </Callout>
          </div>

          <DialogFooter>
            <RadarButton
              variant="accent"
              onClick={() =>
                newlyCreatedKey && copyToClipboard(newlyCreatedKey.key)
              }
            >
              {copied ? "Copied" : "Copy the key"}
            </RadarButton>
            <RadarButton onClick={() => setNewlyCreatedKey(null)}>
              I have stored it
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; stops working immediately. Anything
              using it will start getting 401 responses.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton
              onClick={() => setDeleteTarget(null)}
              disabled={deletingId !== null}
            >
              Keep it
            </RadarButton>
            <RadarButton
              onClick={() => deleteTarget && deleteApiKey(deleteTarget.id)}
              disabled={deletingId !== null}
              className="border-radar-err text-radar-err"
            >
              {deletingId ? "Revoking…" : "Revoke"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

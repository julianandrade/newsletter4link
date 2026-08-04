"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import { SearchIcon } from "@/components/radar/icons";
import {
  BulkBar,
  SelectCheckbox,
  useSelection,
  type BulkAction,
} from "@/components/radar/selection";
import {
  EmptyState,
  RadarField,
  RadarInput,
  RadarSelect,
  RadarTextarea,
  SkeletonRows,
  StatTile,
  TableShell,
  tableClass,
  tdClass,
  theadClass,
  thClass,
  trClass,
} from "@/components/radar/controls";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

interface Subscriber {
  id: string;
  email: string;
  name?: string;
  active: boolean;
  preferredLanguage: string;
  preferredStyle: string;
  createdAt: string;
}

type Audience = "active" | "everyone";

const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["pt-pt", "Portuguese (PT)"],
  ["pt-br", "Portuguese (BR)"],
  ["es", "Spanish"],
  ["ar", "Arabic"],
];

const STYLES: [string, string][] = [
  ["executive", "Executive"],
  ["technical", "Technical"],
  ["comprehensive", "Comprehensive"],
];

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [audience, setAudience] = useState<Audience>("active");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const [newStyle, setNewStyle] = useState("comprehensive");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Subscriber | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadSubscribers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  const loadSubscribers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const url =
        audience === "everyone"
          ? "/api/subscribers?all=true"
          : "/api/subscribers";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSubscribers(data.data);
      } else {
        setLoadError(data.error || "The subscriber list request failed");
      }
    } catch (e) {
      setLoadError("The subscriber list request failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubscriber = async () => {
    if (!newEmail.trim() || isAdding) return;

    setIsAdding(true);
    setAddError(null);

    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          preferredLanguage: newLanguage,
          preferredStyle: newStyle,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubscribers([data.data, ...subscribers]);
        setIsAddDialogOpen(false);
        setNewEmail("");
        setNewName("");
        setNewLanguage("en");
        setNewStyle("comprehensive");
        toast.success("Subscriber added");
      } else {
        setAddError(data.error || "Could not add that subscriber");
      }
    } catch (e) {
      setAddError("Could not add that subscriber");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleActive = async (subscriber: Subscriber) => {
    const next = !subscriber.active;
    setSubscribers((previous) =>
      previous.map((s) => (s.id === subscriber.id ? { ...s, active: next } : s))
    );

    try {
      const res = await fetch(`/api/subscribers/${subscriber.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Update failed");
      toast.success(next ? "Subscribing again" : "Unsubscribed");
    } catch (e) {
      setSubscribers((previous) =>
        previous.map((s) =>
          s.id === subscriber.id ? { ...s, active: subscriber.active } : s
        )
      );
      toast.error("Could not change that subscription");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/subscribers/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSubscribers(subscribers.filter((s) => s.id !== deleteTarget.id));
        toast.success("Subscriber deleted");
        setDeleteTarget(null);
      } else {
        const data = await res.json();
        toast.error(data.error || "Could not delete that subscriber");
      }
    } catch (e) {
      toast.error("Could not delete that subscriber");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImport = async () => {
    if (!csvContent.trim() || isImporting) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const res = await fetch("/api/subscribers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvContent.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setImportResult({ imported: data.imported, skipped: data.skipped });
        loadSubscribers();
      } else {
        toast.error(data.error || "The import failed");
      }
    } catch (e) {
      toast.error("The import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = () => {
    const csv = [
      "email,name,language,style,active",
      ...subscribers.map(
        (s) =>
          `${s.email},${s.name || ""},${s.preferredLanguage},${s.preferredStyle},${s.active}`
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${subscribers.length} rows`);
  };

  const filteredSubscribers = subscribers.filter((s) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.email.toLowerCase().includes(query) ||
      s.name?.toLowerCase().includes(query)
    );
  });

  /**
   * Bulk selection. Ids are in render order so shift-click ranges match the
   * table, and the selection is pruned automatically when the search narrows.
   */
  const selection = useSelection(filteredSubscribers.map((s) => s.id));
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(null);

  const runBulk = async (
    action: "activate" | "deactivate" | "delete",
    ids: string[]
  ) => {
    setBulkBusy(action);
    const previous = subscribers;

    setSubscribers((prev) =>
      action === "delete"
        ? prev.filter((s) => !ids.includes(s.id))
        : prev.map((s) =>
            ids.includes(s.id) ? { ...s, active: action === "activate" } : s
          )
    );

    try {
      const res = await fetch("/api/subscribers/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Bulk action failed");
      }

      const verb =
        action === "delete"
          ? "removed"
          : action === "activate"
            ? "resubscribed"
            : "unsubscribed";
      toast.success(
        `${data.affected} ${data.affected === 1 ? "subscriber" : "subscribers"} ${verb}` +
          (data.skipped > 0 ? `, ${data.skipped} skipped` : "")
      );
      selection.clear();
    } catch (cause) {
      setSubscribers(previous);
      toast.error(
        cause instanceof Error ? cause.message : "Could not apply the change"
      );
    } finally {
      setBulkBusy(null);
      setPendingBulkDelete(null);
    }
  };

  const bulkActions: BulkAction[] = [
    {
      id: "activate",
      label: "Resubscribe",
      onRun: (ids) => runBulk("activate", ids),
    },
    {
      id: "deactivate",
      label: "Unsubscribe",
      onRun: (ids) => runBulk("deactivate", ids),
    },
    {
      id: "delete",
      label: "Remove",
      destructive: true,
      onRun: (ids) => setPendingBulkDelete(ids),
    },
  ];

  const activeCount = subscribers.filter((s) => s.active).length;
  const inactiveCount = subscribers.filter((s) => !s.active).length;
  const languageCount = new Set(subscribers.map((s) => s.preferredLanguage)).size;

  return (
    <>
      <AppHeader />

      <RadarMain width="1180px">
        <PageHeading
          eyebrow="Subscribers"
          title={
            isLoading && subscribers.length === 0
              ? "Subscribers"
              : activeCount === 0
                ? "Nobody is subscribed yet"
                : `${activeCount} ${activeCount === 1 ? "person" : "people"} get the newsletter`
          }
          subtitle="Every send goes to the active list. Language and style decide which variant each reader receives."
          actions={
            <>
              <RadarButton
                onClick={handleExport}
                disabled={subscribers.length === 0}
              >
                Export CSV
              </RadarButton>
              <RadarButton onClick={() => setIsImportDialogOpen(true)}>
                Import
              </RadarButton>
              <RadarButton
                variant="accent"
                onClick={() => {
                  setAddError(null);
                  setIsAddDialogOpen(true);
                }}
              >
                Add subscriber
              </RadarButton>
            </>
          }
        />

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Active"
            value={activeCount}
            note="receive the next send"
            color="var(--r-ok)"
          />
          <StatTile
            label="Unsubscribed"
            value={inactiveCount}
            note={
              audience === "active" ? "switch to everyone to see them" : "kept on file"
            }
          />
          <StatTile
            label="Languages"
            value={languageCount}
            note="variants generated per send"
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[380px]">
            <SearchIcon
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-radar-ink3"
            />
            <RadarInput
              type="search"
              aria-label="Search subscribers"
              placeholder="Search by email or name"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <ChipGroup<Audience>
            label="Which subscribers"
            kind="options"
            value={audience}
            onChange={setAudience}
            options={[
              { value: "active", label: "Active only" },
              { value: "everyone", label: "Everyone" },
            ]}
          />
        </div>

        {loadError && !isLoading && (
          <EmptyState
            title="The subscriber list could not be loaded"
            actions={
              <RadarButton variant="accent" onClick={() => void loadSubscribers()}>
                Try again
              </RadarButton>
            }
          >
            {loadError}
          </EmptyState>
        )}

        {isLoading && subscribers.length === 0 && !loadError && (
          <SkeletonRows rows={6} />
        )}

        {!isLoading && !loadError && filteredSubscribers.length === 0 && (
          <EmptyState
            title={
              searchQuery
                ? "Nobody matches that search"
                : "No subscribers on this list"
            }
            actions={
              searchQuery ? (
                <RadarButton variant="accent" onClick={() => setSearchQuery("")}>
                  Clear the search
                </RadarButton>
              ) : (
                <>
                  <RadarButton
                    variant="accent"
                    onClick={() => setIsAddDialogOpen(true)}
                  >
                    Add someone
                  </RadarButton>
                  <RadarButton onClick={() => setIsImportDialogOpen(true)}>
                    Import a CSV
                  </RadarButton>
                </>
              )
            }
          >
            {searchQuery
              ? "Try part of the address instead of the whole thing."
              : "Paste a CSV of addresses to fill the list in one go, or add people one at a time."}
          </EmptyState>
        )}

        {filteredSubscribers.length > 0 && !loadError && (
          <>
            <TableShell>
              <table className={tableClass}>
                <caption className="sr-only">Newsletter subscribers</caption>
                <thead>
                  <tr className={theadClass}>
                    <th scope="col" className={cn(thClass, "w-[36px]")}>
                      <SelectCheckbox
                        checked={selection.allSelected}
                        indeterminate={selection.partiallySelected}
                        onToggle={() =>
                          selection.allSelected
                            ? selection.clear()
                            : selection.selectAll()
                        }
                        label={
                          selection.allSelected
                            ? "Clear selection"
                            : `Select all ${filteredSubscribers.length} subscribers`
                        }
                      />
                    </th>
                    <th scope="col" className={thClass}>
                      Email
                    </th>
                    <th scope="col" className={thClass}>
                      Name
                    </th>
                    <th scope="col" className={thClass}>
                      Variant
                    </th>
                    <th scope="col" className={thClass}>
                      Status
                    </th>
                    <th scope="col" className={thClass}>
                      Added
                    </th>
                    <th scope="col" className={cn(thClass, "text-right")}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscribers.map((subscriber) => (
                    <tr
                      key={subscriber.id}
                      className={cn(
                        trClass,
                        selection.isSelected(subscriber.id) && "bg-radar-surface2"
                      )}
                    >
                      <td className={tdClass}>
                        <SelectCheckbox
                          checked={selection.isSelected(subscriber.id)}
                          onToggle={(modifiers) =>
                            selection.toggle(subscriber.id, modifiers)
                          }
                          label={`Select ${subscriber.email}`}
                        />
                      </td>
                      <td className={cn(tdClass, "text-radar-ink")}>
                        {subscriber.email}
                      </td>
                      <td className={tdClass}>{subscriber.name || "not given"}</td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap gap-1.5">
                          <Tag>{subscriber.preferredLanguage}</Tag>
                          <Tag>{subscriber.preferredStyle}</Tag>
                        </div>
                      </td>
                      <td className={tdClass}>
                        <StatusChip tone={subscriber.active ? "ok" : "neutral"}>
                          {subscriber.active ? "Subscribed" : "Unsubscribed"}
                        </StatusChip>
                      </td>
                      <td className={cn(tdClass, "whitespace-nowrap")}>
                        {relativeTime(subscriber.createdAt)}
                      </td>
                      <td className={cn(tdClass, "text-right")}>
                        <div className="flex justify-end gap-1.5">
                          <RadarButton
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(subscriber)}
                          >
                            {subscriber.active ? "Unsubscribe" : "Resubscribe"}
                            <span className="sr-only"> {subscriber.email}</span>
                          </RadarButton>
                          <RadarButton
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(subscriber)}
                            className="hover:border-radar-err hover:text-radar-err"
                          >
                            Delete
                            <span className="sr-only"> {subscriber.email}</span>
                          </RadarButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>

            <p className="mt-3 mb-0 text-[11.5px] text-radar-ink3">
              <Num>{filteredSubscribers.length}</Num> of{" "}
              <Num>{subscribers.length}</Num> shown
              {searchQuery && ` for “${searchQuery}”`}
              {selection.count > 0 && (
                <> · <Num>{selection.count}</Num> selected</>
              )}
            </p>

            <BulkBar
              selection={selection}
              actions={bulkActions}
              noun="subscriber"
              busyAction={bulkBusy}
            />
          </>
        )}
      </RadarMain>

      {/* Bulk remove confirmation: deleting a subscriber loses their history. */}
      <Dialog
        open={pendingBulkDelete !== null}
        onOpenChange={(open) => !open && setPendingBulkDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove {pendingBulkDelete?.length}{" "}
              {pendingBulkDelete?.length === 1 ? "subscriber" : "subscribers"}?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone, and it deletes their delivery history with
              them. To stop sending without losing the record, use Unsubscribe
              instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton
              variant="outline"
              onClick={() => setPendingBulkDelete(null)}
            >
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              disabled={bulkBusy !== null}
              onClick={() =>
                pendingBulkDelete && runBulk("delete", pendingBulkDelete)
              }
            >
              {bulkBusy === "delete"
                ? "Removing…"
                : `Remove ${pendingBulkDelete?.length ?? 0}`}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a subscriber</DialogTitle>
            <DialogDescription>
              They start subscribed and will receive the next edition.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {addError && (
              <p
                role="alert"
                className="m-0 rounded-lg border border-radar-err bg-radar-surface px-3 py-2 text-[12.5px] text-radar-err"
              >
                {addError}
              </p>
            )}

            <RadarField label="Email" htmlFor="subscriber-email" required>
              <RadarInput
                id="subscriber-email"
                type="email"
                placeholder="name@linkconsulting.com"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </RadarField>

            <RadarField label="Name" htmlFor="subscriber-name">
              <RadarInput
                id="subscriber-name"
                placeholder="Used in the greeting when it is set"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </RadarField>

            <div className="grid gap-4 sm:grid-cols-2">
              <RadarField label="Language" htmlFor="subscriber-language">
                <RadarSelect
                  id="subscriber-language"
                  value={newLanguage}
                  onChange={(event) => setNewLanguage(event.target.value)}
                >
                  {LANGUAGES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </RadarSelect>
              </RadarField>

              <RadarField
                label="Style"
                htmlFor="subscriber-style"
                hint="How much detail their edition carries."
              >
                <RadarSelect
                  id="subscriber-style"
                  value={newStyle}
                  onChange={(event) => setNewStyle(event.target.value)}
                >
                  {STYLES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </RadarSelect>
              </RadarField>
            </div>
          </div>

          <DialogFooter>
            <RadarButton
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isAdding}
            >
              Cancel
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={handleAddSubscriber}
              disabled={isAdding || !newEmail.trim()}
            >
              {isAdding ? "Adding…" : "Add subscriber"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import subscribers</DialogTitle>
            <DialogDescription>
              One address per line. Add a comma and a name to set the greeting.
              Addresses already on the list are skipped, not duplicated.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <RadarTextarea
              aria-label="CSV content"
              className="font-num h-40 text-[12px]"
              placeholder={"ana@linkconsulting.com\njoao@linkconsulting.com,João Silva"}
              value={csvContent}
              onChange={(event) => setCsvContent(event.target.value)}
            />

            {importResult && (
              <p
                role="status"
                className="m-0 rounded-lg border border-radar-ok bg-radar-surface px-3 py-2 text-[12.5px] text-radar-ink"
              >
                Imported <Num>{importResult.imported}</Num>
                {importResult.skipped > 0 && (
                  <>
                    , skipped <Num>{importResult.skipped}</Num> already on the list
                  </>
                )}
                .
              </p>
            )}
          </div>

          <DialogFooter>
            <RadarButton
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportResult(null);
                setCsvContent("");
              }}
              disabled={isImporting}
            >
              {importResult ? "Done" : "Cancel"}
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={handleImport}
              disabled={isImporting || !csvContent.trim()}
            >
              {isImporting ? "Importing…" : "Import"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this subscriber?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.email} is removed along with their send history. If you
              only want them to stop receiving editions, unsubscribe them instead:
              that keeps the record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </RadarButton>
            <RadarButton
              onClick={() => {
                if (deleteTarget) {
                  void handleToggleActive(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
              disabled={isDeleting || !deleteTarget?.active}
            >
              Unsubscribe instead
            </RadarButton>
            <RadarButton
              onClick={handleDelete}
              disabled={isDeleting}
              className="border-radar-err text-radar-err"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

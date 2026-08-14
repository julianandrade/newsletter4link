"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  StatusChip,
} from "@/components/radar/primitives";
import {
  EmptyState,
  RadarToggle,
  SkeletonRows,
} from "@/components/radar/controls";
import {
  SortSelect,
  SortAnnouncement,
  type SortOption,
  type SortState,
} from "@/components/radar/sortable";
import { sortBy } from "@/lib/list-sort";
import { relativeTime } from "@/lib/radar/source";
import { cn } from "@/lib/utils";

type TemplateSortField = "updatedAt" | "createdAt" | "name";

const TEMPLATE_SORT_OPTIONS: SortOption<TemplateSortField>[] = [
  { field: "updatedAt", direction: "desc", label: "Edited most recently" },
  { field: "updatedAt", direction: "asc", label: "Edited longest ago" },
  { field: "createdAt", direction: "desc", label: "Newest first" },
  { field: "name", direction: "asc", label: "Name, A to Z" },
  { field: "name", direction: "desc", label: "Name, Z to A" },
];

const TEMPLATE_SORT_LABELS: Record<TemplateSortField, string> = {
  updatedAt: "when it was last edited",
  createdAt: "when it was created",
  name: "name",
};

interface Template {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * RQ-003: the AI Radar edition. It is code rather than a stored row, so it
   * cannot be edited in the visual builder or deleted, and its flags are
   * derived: it is in use precisely when no stored template is.
   */
  builtIn?: boolean;
}

export default function TemplatesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sort, setSort] = useState<SortState<TemplateSortField>>({
    field: "updatedAt",
    direction: "desc",
  });

  const fetchTemplates = () => {
    setIsLoading(true);
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleToggleActive = async (template: Template) => {
    setUpdating(template.id);
    try {
      const response = await fetch(`/api/templates/${template.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !template.isActive }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update template");
      }

      // Active is exclusive, so switching one on switches the rest off.
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === template.id) {
            return { ...t, isActive: !template.isActive };
          }
          if (!template.isActive && t.isActive) {
            return { ...t, isActive: false };
          }
          return t;
        })
      );
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not change which template is in use"
      );
      fetchTemplates();
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleDefault = async (template: Template) => {
    setUpdating(template.id);
    try {
      const response = await fetch(`/api/templates/${template.id}/set-default`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: !template.isDefault }),
      });

      if (!response.ok) throw new Error("Failed to update template");

      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === template.id) {
            return { ...t, isDefault: !template.isDefault };
          }
          if (!template.isDefault && t.isDefault) {
            return { ...t, isDefault: false };
          }
          return t;
        })
      );
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Could not change the preselected template");
      fetchTemplates();
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/templates/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete template");
      }

      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success("Template deleted");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete that template"
      );
    } finally {
      setDeleting(false);
    }
  };

  const active = templates.find((t) => t.isActive);

  /**
   * Ordered in the browser, and here that is the honest place for it.
   *
   * `/api/templates` has no `take` and no page, so this array is every template there is,
   * and there is no slice to mistake for the whole. It also cannot be the server's job:
   * the built-in edition is code rather than a stored row, so it does not exist in the
   * query the route orders.
   *
   * The built-in stays first whatever the order. It is the frame an organization falls back
   * to when nothing else is active, so it is a fixed point in the list rather than a row
   * competing on a date it does not really have.
   */
  const ordered = useMemo(() => {
    const builtIn = templates.filter((template) => template.builtIn);
    const stored = templates.filter((template) => !template.builtIn);
    return [
      ...builtIn,
      ...sortBy(stored, (template) => template[sort.field], sort.direction),
    ];
  }, [templates, sort]);

  return (
    <>
      <AppHeader />

      <RadarMain width="form">
        <PageHeading
          eyebrow="Templates"
          title={
            isLoading && templates.length === 0
              ? "Templates"
              : active
                ? `Sending with “${active.name}”`
                : templates.length > 0
                  ? "No template is in use"
                  : "No templates yet"
          }
          subtitle="A template is the frame every edition is poured into. One is in use at a time; the default is the one the builder preselects."
          actions={
            <>
              {templates.length > 1 && (
                <SortSelect
                  label="Sort templates"
                  options={TEMPLATE_SORT_OPTIONS}
                  sort={sort}
                  onChange={setSort}
                />
              )}
              <Link
                href="/dashboard/templates/new"
                className={radarButtonClass("accent")}
              >
                New template
              </Link>
            </>
          }
        />

        {isLoading && templates.length === 0 && <SkeletonRows rows={3} />}

        {!isLoading && templates.length === 0 && (
          <EmptyState
            title="Nothing to pour an edition into"
            actions={
              <Link
                href="/dashboard/templates/new"
                className={radarButtonClass("accent")}
              >
                Create the first template
              </Link>
            }
          >
            A template holds the header, footer and layout that every send inherits.
            Until one exists, editions fall back to the built-in frame.
          </EmptyState>
        )}

        {templates.length > 0 && (
          <div className="flex flex-col gap-3">
            <SortAnnouncement
              sort={sort}
              labels={TEMPLATE_SORT_LABELS}
              count={templates.length}
              noun={templates.length === 1 ? "template" : "templates"}
            />
            {ordered.map((template) => (
              <article
                key={template.id}
                className={cn(
                  "rounded-xl border bg-radar-surface p-4 shadow-radar transition-colors",
                  template.isActive
                    ? "border-radar-ok"
                    : "border-radar-line hover:border-radar-ink3"
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="m-0 text-[14.5px] font-semibold text-radar-ink">
                        {template.name}
                      </h2>
                      {template.builtIn && (
                        <StatusChip tone="info">Built in</StatusChip>
                      )}
                      {template.isActive && <StatusChip tone="ok">In use</StatusChip>}
                      {template.isDefault && (
                        <StatusChip tone="warn">Preselected</StatusChip>
                      )}
                    </div>
                    {template.description && (
                      <p className="mt-1.5 mb-0 max-w-[70ch] text-[12.5px] text-radar-ink2 text-pretty">
                        {template.description}
                      </p>
                    )}
                    <p className="mt-2 mb-0 text-[11px] text-radar-ink3">
                      {template.builtIn
                        ? // The old wording ended at "cannot be edited visually", which was a dead
                          // end for anyone who wanted to change it. Two editable copies exist now,
                          // so the line points at them instead of just refusing.
                          "Ships with the app, and stays as it is. To change it, edit “AI Radar Weekly - editable frame” or “- Unlayer”, which are the same edition with the frame opened up."
                        : `Updated ${relativeTime(template.updatedAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1 lg:w-[300px]">
                    <RadarToggle
                      id={`active-${template.id}`}
                      checked={template.isActive}
                      disabled={
                        updating === template.id ||
                        // The built-in is what remains when nothing else is
                        // active, so switching it off has no meaning.
                        Boolean(template.builtIn && template.isActive)
                      }
                      onChange={() => handleToggleActive(template)}
                      label="Use this one"
                      hint="Applied when a send does not name a template."
                    />
                    <RadarToggle
                      id={`default-${template.id}`}
                      checked={template.isDefault}
                      disabled={
                        updating === template.id ||
                        Boolean(template.builtIn && template.isDefault)
                      }
                      onChange={() => handleToggleDefault(template)}
                      label="Preselect in the builder"
                    />
                    {!template.builtIn && (
                    <div className="mt-2 flex justify-end gap-1.5 border-t border-radar-line2 pt-2.5">
                      <Link
                        href={`/dashboard/templates/${template.id}`}
                        className={radarButtonClass("outline", "sm")}
                      >
                        Edit
                      </Link>
                      <RadarButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(template)}
                        disabled={template.isActive}
                        title={
                          template.isActive
                            ? "Switch to another template before deleting this one"
                            : undefined
                        }
                        className="hover:border-radar-err hover:text-radar-err"
                      >
                        Delete
                      </RadarButton>
                    </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </RadarMain>

      {/* Delete */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this template?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; goes for good. Editions already sent
              keep the HTML they were sent with.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Keep it
            </RadarButton>
            <RadarButton
              onClick={handleDelete}
              disabled={deleting}
              className="border-radar-err text-radar-err"
            >
              {deleting ? "Deleting…" : "Delete"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

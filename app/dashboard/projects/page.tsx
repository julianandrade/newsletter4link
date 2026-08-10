"use client";

import { useCallback, useEffect, useState } from "react";
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
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
  StatusChip,
  Tag,
} from "@/components/radar/primitives";
import {
  EmptyState,
  RadarField,
  RadarInput,
  RadarTextarea,
  SkeletonRows,
  TableShell,
  tableClass,
  tdClass,
  theadClass,
  thClass,
  trClass,
} from "@/components/radar/controls";
import {
  BulkBar,
  SelectCheckbox,
  useSelection,
  type BulkAction,
} from "@/components/radar/selection";
import {
  LayoutToggle,
  useLayoutPreference,
} from "@/components/layout-toggle";
import {
  ProjectFiltersComponent,
  ProjectFilters,
  ProjectSortField,
  PROJECT_SORT_DEFAULT_DIRECTION,
  PROJECT_SORT_LABELS,
  defaultProjectFilters,
  buildProjectQueryString,
} from "@/components/project-filters";
import {
  SortableTh,
  SortAnnouncement,
  type SortState,
} from "@/components/radar/sortable";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description: string;
  team: string;
  projectDate: string;
  impact?: string;
  imageUrl?: string;
  featured: boolean;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  team: "",
  projectDate: "",
  impact: "",
  imageUrl: "",
};

/** "Mar 2026" for the shipped-on stamp; older rows may carry no usable date. */
function formatMonth(dateString: string | null | undefined) {
  if (!dateString) return "no date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "no date";
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [layout, setLayout] = useLayoutPreference("projects-layout", "cards");
  const [filters, setFilters] = useState<ProjectFilters>(defaultProjectFilters);

  const fetchTeams = async () => {
    try {
      const res = await fetch("/api/projects?teams=true");
      const data = await res.json();
      if (data.success) {
        setTeams(data.data);
      }
    } catch (error) {
      console.error("Error fetching teams:", error);
    }
  };

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const queryString = buildProjectQueryString(filters);
      const res = await fetch(`/api/projects${queryString}`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      } else {
        setLoadError(data.error || "The project list request failed");
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      setLoadError(
        error instanceof Error ? error.message : "The project list request failed"
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const openAddDialog = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEditDialog = (project: Project) => {
    setFormData({
      name: project.name,
      description: project.description,
      team: project.team,
      projectDate: project.projectDate.split("T")[0],
      impact: project.impact || "",
      imageUrl: project.imageUrl || "",
    });
    setEditingId(project.id);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        await fetchProjects();
        await fetchTeams();
        toast.success(editingId ? "Project updated" : "Project added");
        closeDialog();
      } else {
        toast.error(data.error || "Could not save that project");
      }
    } catch (error) {
      console.error("Error saving project:", error);
      toast.error("Could not save that project");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setProjects(projects.filter((p) => p.id !== deleteTarget.id));
        await fetchTeams();
        toast.success("Project deleted");
      } else {
        toast.error(data.error || "Could not delete that project");
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Could not delete that project");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const toggleFeatured = async (project: Project) => {
    // Optimistic: the star is the whole point of the row, so it must feel instant.
    const next = !project.featured;
    setProjects((previous) =>
      previous.map((p) => (p.id === project.id ? { ...p, featured: next } : p))
    );

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: next }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Update failed");
    } catch (error) {
      console.error("Error toggling featured:", error);
      setProjects((previous) =>
        previous.map((p) =>
          p.id === project.id ? { ...p, featured: project.featured } : p
        )
      );
      toast.error("Could not change the newsletter placement");
    }
  };

  /** Bulk selection, in render order so shift-click ranges match the screen. */
  const selection = useSelection(projects.map((project) => project.id));
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<string[] | null>(null);

  const runBulk = async (
    action: "feature" | "unfeature" | "delete",
    ids: string[]
  ) => {
    setBulkBusy(action);
    const previous = projects;

    setProjects((prev) =>
      action === "delete"
        ? prev.filter((p) => !ids.includes(p.id))
        : prev.map((p) =>
            ids.includes(p.id) ? { ...p, featured: action === "feature" } : p
          )
    );

    try {
      const res = await fetch("/api/projects/bulk", {
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
          ? "deleted"
          : action === "feature"
            ? "added to the next send"
            : "removed from the next send";
      toast.success(
        `${data.affected} ${data.affected === 1 ? "project" : "projects"} ${verb}` +
          (data.skipped > 0 ? `, ${data.skipped} skipped` : "")
      );
      selection.clear();
    } catch (cause) {
      setProjects(previous);
      toast.error(
        cause instanceof Error ? cause.message : "Could not apply the change"
      );
    } finally {
      setBulkBusy(null);
      setPendingBulkDelete(null);
    }
  };

  const bulkActions: BulkAction[] = [
    { id: "feature", label: "Feature", onRun: (ids) => runBulk("feature", ids) },
    {
      id: "unfeature",
      label: "Unfeature",
      onRun: (ids) => runBulk("unfeature", ids),
    },
    {
      id: "delete",
      label: "Delete",
      destructive: true,
      onRun: (ids) => setPendingBulkDelete(ids),
    },
  ];

  const featuredCount = projects.filter((p) => p.featured).length;

  const hasActiveFilters =
    filters.search !== "" ||
    filters.team !== "all" ||
    filters.featured !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  /** Row actions, identical in all three layouts. */
  const RowActions = ({ project }: { project: Project }) => (
    <div className="flex items-center gap-1.5">
      <RadarButton
        size="sm"
        variant={project.featured ? "accent" : "outline"}
        onClick={() => toggleFeatured(project)}
      >
        {project.featured ? "Featured" : "Feature"}
        <span className="sr-only"> {project.name} in the newsletter</span>
      </RadarButton>
      <RadarButton size="sm" variant="ghost" onClick={() => openEditDialog(project)}>
        Edit
        <span className="sr-only"> {project.name}</span>
      </RadarButton>
      <RadarButton
        size="sm"
        variant="ghost"
        onClick={() => setDeleteTarget(project)}
        className="hover:border-radar-err hover:text-radar-err"
      >
        Delete
        <span className="sr-only"> {project.name}</span>
      </RadarButton>
    </div>
  );

  const renderCardsView = () => (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <article
          key={project.id}
          className={cn(
            "flex flex-col rounded-xl border bg-radar-surface p-4 shadow-radar transition-colors",
            project.featured
              ? "border-radar-accent"
              : "border-radar-line hover:border-radar-ink3"
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <SelectCheckbox
              checked={selection.isSelected(project.id)}
              onToggle={(modifiers) => selection.toggle(project.id, modifiers)}
              label={`Select ${project.name}`}
            />
            <Tag>{project.team}</Tag>
            <span className="text-[11px] text-radar-ink3">
              {formatMonth(project.projectDate)}
            </span>
            <span className="flex-1" />
            {project.featured && <StatusChip tone="warn">In the next send</StatusChip>}
          </div>

          <h3 className="font-editorial m-0 text-[17px] font-medium leading-[1.25] tracking-[-0.01em] text-radar-ink text-balance">
            {project.name}
          </h3>

          <p className="mt-2 mb-0 line-clamp-3 text-[13px] leading-[1.55] text-radar-ink2 text-pretty">
            {project.description}
          </p>

          {project.impact && (
            <div className="mt-3 rounded-lg border border-radar-line2 bg-radar-surface2 px-3 py-2.5">
              <SectionLabel className="mb-1">Impact</SectionLabel>
              <p className="m-0 text-[12.5px] text-radar-ink text-pretty">
                {project.impact}
              </p>
            </div>
          )}

          <div className="mt-4 flex justify-end border-t border-radar-line2 pt-3.5">
            <RowActions project={project} />
          </div>
        </article>
      ))}
    </div>
  );

  const renderCompactView = () => (
    <div className="border-t border-radar-line">
      {projects.map((project) => (
        <div
          key={project.id}
          className={cn(
            "flex flex-col gap-2.5 border-b border-radar-line2 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-4",
            selection.isSelected(project.id)
              ? "bg-radar-surface2"
              : "hover:bg-radar-surface2"
          )}
        >
          <SelectCheckbox
            checked={selection.isSelected(project.id)}
            onToggle={(modifiers) => selection.toggle(project.id, modifiers)}
            label={`Select ${project.name}`}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {project.featured && (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-radar-accent"
                />
              )}
              <h3 className="m-0 truncate text-[13.5px] font-semibold text-radar-ink">
                {project.name}
              </h3>
            </div>
            <p className="mt-0.5 mb-0 text-[11.5px] text-radar-ink3">
              {project.team} · {formatMonth(project.projectDate)}
              {project.featured && " · featured"}
            </p>
          </div>
          <div className="shrink-0">
            <RowActions project={project} />
          </div>
        </div>
      ))}
    </div>
  );

  /**
   * The order, held in the same `filters` object the select writes to, so a click on a
   * header and a choice in "Dates and sorting" are one state and cannot disagree.
   */
  const sort: SortState<ProjectSortField> = {
    field: filters.sortBy,
    direction: filters.sortOrder,
  };

  const onSort = (next: SortState<ProjectSortField>) =>
    setFilters({ ...filters, sortBy: next.field, sortOrder: next.direction });

  const sortableColumn = (field: ProjectSortField, label: string) => (
    <SortableTh
      field={field}
      sort={sort}
      onSort={onSort}
      defaultDirection={PROJECT_SORT_DEFAULT_DIRECTION[field]}
    >
      {label}
    </SortableTh>
  );

  const renderTableView = () => (
    <TableShell>
      <table className={tableClass}>
        <caption className="sr-only">Internal projects</caption>
        <thead>
          <tr className={theadClass}>
            <th scope="col" className={cn(thClass, "w-[36px]")}>
              <SelectCheckbox
                checked={selection.allSelected}
                indeterminate={selection.partiallySelected}
                onToggle={() =>
                  selection.allSelected ? selection.clear() : selection.selectAll()
                }
                label={
                  selection.allSelected
                    ? "Clear selection"
                    : `Select all ${projects.length} projects`
                }
              />
            </th>
            {sortableColumn("name", "Project")}
            {sortableColumn("team", "Team")}
            {sortableColumn("projectDate", "Shipped")}
            {/* The dot in the Project cell is the featured mark, and this is the column
                that groups by it. Named for what it does rather than "Featured", which
                would read as a value the row has rather than an order to put it in. */}
            {sortableColumn("featured", "In the send")}
            <th scope="col" className={cn(thClass, "text-right")}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr
              key={project.id}
              className={cn(
                trClass,
                selection.isSelected(project.id) && "bg-radar-surface2"
              )}
            >
              <td className={tdClass}>
                <SelectCheckbox
                  checked={selection.isSelected(project.id)}
                  onToggle={(modifiers) => selection.toggle(project.id, modifiers)}
                  label={`Select ${project.name}`}
                />
              </td>
              <td className={cn(tdClass, "min-w-[260px]")}>
                <div className="flex items-center gap-2">
                  {project.featured && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-radar-accent"
                    />
                  )}
                  <span className="text-[13px] font-medium text-radar-ink">
                    {project.name}
                  </span>
                </div>
                <p className="mt-0.5 mb-0 line-clamp-1 max-w-[60ch] text-[11.5px] text-radar-ink3">
                  {project.description}
                </p>
              </td>
              <td className={tdClass}>{project.team}</td>
              <td className={cn(tdClass, "whitespace-nowrap")}>
                {formatMonth(project.projectDate)}
              </td>
              <td className={tdClass}>
                {project.featured ? (
                  <StatusChip tone="warn">Featured</StatusChip>
                ) : (
                  <span className="text-radar-ink3">no</span>
                )}
              </td>
              <td className={cn(tdClass, "text-right")}>
                <div className="flex justify-end">
                  <RowActions project={project} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );

  const renderProjectsView = () => {
    switch (layout) {
      case "compact":
        return renderCompactView();
      case "table":
        return renderTableView();
      default:
        return renderCardsView();
    }
  };

  return (
    <>
      <AppHeader />

      <RadarMain width="1240px">
        <PageHeading
          eyebrow="Projects"
          title={
            loading && projects.length === 0
              ? "Projects"
              : projects.length === 0
                ? "No projects on file"
                : `${featuredCount} of ${projects.length} in the next send`
          }
          subtitle="Internal work worth showing off. Featured projects are pulled into every new edition alongside the curated stories."
          actions={
            <>
              <LayoutToggle value={layout} onChange={setLayout} />
              <RadarButton variant="accent" onClick={openAddDialog}>
                Add project
              </RadarButton>
            </>
          }
        />

        <ProjectFiltersComponent
          filters={filters}
          onFiltersChange={setFilters}
          teams={teams}
          className="mb-5"
        />

        {loadError && !loading && (
          <EmptyState
            title="Projects could not be loaded"
            actions={
              <RadarButton variant="accent" onClick={() => void fetchProjects()}>
                Try again
              </RadarButton>
            }
          >
            {loadError}
          </EmptyState>
        )}

        {loading && projects.length === 0 && !loadError && <SkeletonRows rows={4} />}

        {!loading && !loadError && projects.length === 0 && (
          <EmptyState
            title={
              hasActiveFilters
                ? "No projects match those filters"
                : "Nothing to show off yet"
            }
            actions={
              hasActiveFilters ? (
                <RadarButton
                  variant="accent"
                  onClick={() => setFilters(defaultProjectFilters)}
                >
                  Clear filters
                </RadarButton>
              ) : (
                <RadarButton variant="accent" onClick={openAddDialog}>
                  Add the first project
                </RadarButton>
              )
            }
          >
            {hasActiveFilters
              ? "Try a different team, or widen the date range."
              : "Add the work your teams have shipped, mark the best of it as featured, and it will ride along with the curated stories in the next edition."}
          </EmptyState>
        )}

        {projects.length > 0 && !loadError && (
          <>
            <SortAnnouncement
              sort={sort}
              labels={PROJECT_SORT_LABELS}
              count={projects.length}
              noun={projects.length === 1 ? "project" : "projects"}
            />
            {/* Select-all strip: the table view carries its own header checkbox. */}
            {layout !== "table" && (
              <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-radar-line pb-3">
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
                      : `Select all ${projects.length} projects`
                  }
                />
                <span className="text-[12.5px] text-radar-ink2">
                  {selection.count > 0
                    ? `${selection.count} of ${projects.length} selected`
                    : `Select all ${projects.length}`}
                </span>
                <span className="ml-auto text-[11.5px] text-radar-ink3">
                  Shift-click to select a range · Esc to clear
                </span>
              </div>
            )}
            {renderProjectsView()}
            <p className="mt-4 mb-0 text-center text-[11.5px] text-radar-ink3">
              <Num>{projects.length}</Num>{" "}
              {projects.length === 1 ? "project" : "projects"} shown
              {featuredCount > 0 && (
                <>
                  {" "}
                  · <Num>{featuredCount}</Num> featured
                </>
              )}
            </p>

            <BulkBar
              selection={selection}
              actions={bulkActions}
              noun="project"
              busyAction={bulkBusy}
            />
          </>
        )}
      </RadarMain>

      {/* Bulk delete confirmation. */}
      <Dialog
        open={pendingBulkDelete !== null}
        onOpenChange={(open) => !open && setPendingBulkDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {pendingBulkDelete?.length}{" "}
              {pendingBulkDelete?.length === 1 ? "project" : "projects"}?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Editions that already featured them keep
              their copy of the text.
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
                ? "Deleting…"
                : `Delete ${pendingBulkDelete?.length ?? 0}`}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add or edit */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit project" : "Add a project"}
            </DialogTitle>
            <DialogDescription>
              Written as a reader outside the team would need it: what it does, who
              built it, what changed as a result.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <RadarField label="Name" htmlFor="project-name" required>
              <RadarInput
                id="project-name"
                value={formData.name}
                onChange={(event) =>
                  setFormData({ ...formData, name: event.target.value })
                }
                placeholder="Claims triage assistant"
                required
              />
            </RadarField>

            <RadarField
              label="Description"
              htmlFor="project-description"
              required
              hint="Two or three sentences, no internal jargon."
            >
              <RadarTextarea
                id="project-description"
                value={formData.description}
                onChange={(event) =>
                  setFormData({ ...formData, description: event.target.value })
                }
                rows={3}
                placeholder="What it does and who it is for."
                required
              />
            </RadarField>

            <div className="grid gap-4 sm:grid-cols-2">
              <RadarField label="Team" htmlFor="project-team" required>
                <RadarInput
                  id="project-team"
                  value={formData.team}
                  onChange={(event) =>
                    setFormData({ ...formData, team: event.target.value })
                  }
                  placeholder="Data Science"
                  list="project-teams"
                  required
                />
                <datalist id="project-teams">
                  {teams.map((team) => (
                    <option key={team} value={team} />
                  ))}
                </datalist>
              </RadarField>

              <RadarField label="Shipped on" htmlFor="project-date" required>
                <RadarInput
                  id="project-date"
                  type="date"
                  value={formData.projectDate}
                  onChange={(event) =>
                    setFormData({ ...formData, projectDate: event.target.value })
                  }
                  required
                />
              </RadarField>
            </div>

            <RadarField
              label="Impact"
              htmlFor="project-impact"
              hint="A figure if you have one. This is the line readers remember."
            >
              <RadarTextarea
                id="project-impact"
                value={formData.impact}
                onChange={(event) =>
                  setFormData({ ...formData, impact: event.target.value })
                }
                rows={2}
                placeholder="Cut triage time by 40%, from 12 minutes to 7."
              />
            </RadarField>

            <RadarField label="Image URL" htmlFor="project-image">
              <RadarInput
                id="project-image"
                type="url"
                value={formData.imageUrl}
                onChange={(event) =>
                  setFormData({ ...formData, imageUrl: event.target.value })
                }
                placeholder="https://"
              />
            </RadarField>

            <DialogFooter>
              <RadarButton type="button" onClick={closeDialog} disabled={saving}>
                Cancel
              </RadarButton>
              <RadarButton type="submit" variant="accent" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add project"}
              </RadarButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be removed from the showcase.
              Editions already sent keep their copy of it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <RadarButton onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Keep it
            </RadarButton>
            <RadarButton
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="border-radar-err text-radar-err hover:border-radar-err hover:brightness-110"
            >
              {deleting ? "Deleting…" : "Delete"}
            </RadarButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

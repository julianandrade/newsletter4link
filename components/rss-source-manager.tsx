"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Rss,
  Plus,
  Pencil,
  Trash2,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Upload,
  FileUp,
  Link,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import { OPML_PRESETS } from "@/lib/config";

type SortOption = "name" | "category" | "createdAt" | "lastFetchedAt";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "active" | "inactive";

/**
 * RSS Source from the API
 */
interface RSSSource {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Form data for creating/editing RSS sources
 */
interface RSSSourceFormData {
  name: string;
  url: string;
  category: string;
  active: boolean;
}

/**
 * Predefined categories for RSS feeds
 */
const RSS_CATEGORIES = [
  "Technology",
  "Business",
  "Design",
  "Development",
  "AI & ML",
  "Security",
  "Marketing",
  "Product",
  "Leadership",
  "Other",
];

/**
 * Format a date for display
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Props for the RSSSourceManager component
 */
export interface RSSSourceManagerProps {
  /** Optional class name for the container */
  className?: string;
}

/**
 * RSS Source Manager component
 * Manages RSS feed sources with CRUD operations
 */
export function RSSSourceManager({ className }: RSSSourceManagerProps) {
  // State
  const [sources, setSources] = useState<RSSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<RSSSource | null>(null);
  const [deletingSource, setDeletingSource] = useState<RSSSource | null>(null);

  // Form state
  const [formData, setFormData] = useState<RSSSourceFormData>({
    name: "",
    url: "",
    category: "Technology",
    active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  // Import dialog state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importMethod, setImportMethod] = useState<"url" | "file">("url");
  const [importUrl, setImportUrl] = useState("");
  const [importCategory, setImportCategory] = useState("Security");
  const [importActiveByDefault, setImportActiveByDefault] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: Array<{ name: string; url: string; error: string }>;
  } | null>(null);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  /**
   * Fetch all RSS sources
   */
  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rss-sources");
      if (!response.ok) {
        throw new Error("Failed to fetch RSS sources");
      }
      const data = await response.json();
      setSources(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sources");
      console.error("Error fetching RSS sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load sources on mount
   */
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  /**
   * Open form dialog for creating a new source
   */
  const handleCreate = () => {
    setEditingSource(null);
    setFormData({
      name: "",
      url: "",
      category: "Technology",
      active: true,
    });
    setFormError(null);
    setIsFormDialogOpen(true);
  };

  /**
   * Open form dialog for editing an existing source
   */
  const handleEdit = (source: RSSSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      category: source.category,
      active: source.active,
    });
    setFormError(null);
    setIsFormDialogOpen(true);
  };

  /**
   * Open delete confirmation dialog
   */
  const handleDeleteClick = (source: RSSSource) => {
    setDeletingSource(source);
    setIsDeleteDialogOpen(true);
  };

  /**
   * Submit form for create/update
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      // Validate
      if (!formData.name.trim()) {
        throw new Error("Name is required");
      }
      if (!formData.url.trim()) {
        throw new Error("URL is required");
      }
      try {
        new URL(formData.url);
      } catch {
        throw new Error("Invalid URL format");
      }

      const isEditing = !!editingSource;
      const url = isEditing
        ? `/api/rss-sources/${editingSource.id}`
        : "/api/rss-sources";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save RSS source");
      }

      // Update local state
      if (isEditing) {
        setSources((prev) =>
          prev.map((s) => (s.id === editingSource.id ? data : s))
        );
      } else {
        setSources((prev) => [data, ...prev]);
      }

      setIsFormDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Delete a source
   */
  const handleDelete = async () => {
    if (!deletingSource) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/rss-sources/${deletingSource.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete RSS source");
      }

      setSources((prev) => prev.filter((s) => s.id !== deletingSource.id));
      setIsDeleteDialogOpen(false);
      setDeletingSource(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Toggle active status inline
   */
  const handleToggleActive = async (source: RSSSource) => {
    try {
      const response = await fetch(`/api/rss-sources/${source.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !source.active }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      const data = await response.json();
      setSources((prev) => prev.map((s) => (s.id === source.id ? data : s)));
    } catch (err) {
      console.error("Error toggling active status:", err);
      setError("Failed to update status");
    }
  };

  /**
   * Test an RSS feed
   */
  const handleTest = async (source: RSSSource) => {
    setTestingId(source.id);
    setTestResult(null);

    try {
      const response = await fetch(`/api/rss-sources/${source.id}/test`, {
        method: "POST",
      });

      const data = await response.json();

      setTestResult({
        id: source.id,
        success: response.ok && data.success,
        message: data.message || (response.ok ? "Feed is valid" : "Feed test failed"),
      });

      // Refresh sources to get updated lastFetchedAt/lastError
      if (response.ok) {
        fetchSources();
      }
    } catch (err) {
      setTestResult({
        id: source.id,
        success: false,
        message: "Failed to test feed",
      });
      console.error("Error testing RSS source:", err);
    } finally {
      setTestingId(null);
    }
  };

  /**
   * Open import dialog
   */
  const handleOpenImport = () => {
    setImportMethod("url");
    setImportUrl(OPML_PRESETS[0]?.url || "");
    setImportCategory("Security");
    setImportActiveByDefault(false);
    setImportResult(null);
    setIsImportDialogOpen(true);
  };

  /**
   * Handle file upload for OPML import
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const content = await file.text();

      const response = await fetch("/api/rss-sources/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opmlContent: content,
          category: importCategory,
          activeByDefault: importActiveByDefault,
          skipDuplicates: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import OPML");
      }

      setImportResult({
        imported: data.imported,
        skipped: data.skipped,
        errors: data.errors || [],
      });

      // Refresh sources list
      fetchSources();
    } catch (err) {
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [
          {
            name: "Import Error",
            url: "",
            error: err instanceof Error ? err.message : "Failed to import",
          },
        ],
      });
    } finally {
      setImporting(false);
      // Reset file input
      e.target.value = "";
    }
  };

  /**
   * Import from URL
   */
  const handleImportFromUrl = async () => {
    if (!importUrl.trim()) return;

    setImporting(true);
    setImportResult(null);

    try {
      const response = await fetch("/api/rss-sources/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opmlUrl: importUrl.trim(),
          category: importCategory,
          activeByDefault: importActiveByDefault,
          skipDuplicates: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import OPML");
      }

      setImportResult({
        imported: data.imported,
        skipped: data.skipped,
        errors: data.errors || [],
      });

      // Refresh sources list
      fetchSources();
    } catch (err) {
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [
          {
            name: "Import Error",
            url: "",
            error: err instanceof Error ? err.message : "Failed to import",
          },
        ],
      });
    } finally {
      setImporting(false);
    }
  };

  // Get unique categories from sources
  const availableCategories = Array.from(
    new Set(sources.map((s) => s.category || "Other"))
  ).sort();

  // Filter and sort sources
  const filteredSources = sources
    .filter((source) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = source.name.toLowerCase().includes(query);
        const matchesUrl = source.url.toLowerCase().includes(query);
        if (!matchesName && !matchesUrl) return false;
      }

      // Category filter
      if (categoryFilter !== "all") {
        if ((source.category || "Other") !== categoryFilter) return false;
      }

      // Status filter
      if (statusFilter === "active" && !source.active) return false;
      if (statusFilter === "inactive" && source.active) return false;

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "category":
          comparison = (a.category || "Other").localeCompare(b.category || "Other");
          break;
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "lastFetchedAt":
          const aTime = a.lastFetchedAt ? new Date(a.lastFetchedAt).getTime() : 0;
          const bTime = b.lastFetchedAt ? new Date(b.lastFetchedAt).getTime() : 0;
          comparison = aTime - bTime;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

  // Group filtered sources by category for display
  const sourcesByCategory = filteredSources.reduce(
    (acc, source) => {
      const cat = source.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(source);
      return acc;
    },
    {} as Record<string, RSSSource[]>
  );

  // Check if any filters are active
  const hasActiveFilters = searchQuery || categoryFilter !== "all" || statusFilter !== "all";

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">RSS Sources</h2>
          <p className="text-sm text-muted-foreground">
            Manage RSS feeds for article curation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleOpenImport}>
            <Upload className="h-4 w-4" />
            Import OPML
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Add Source
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-auto"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && sources.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Rss className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No RSS sources</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first RSS feed to start curating articles
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              Add First Source
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sources list grouped by category */}
      {!loading && sources.length > 0 && (
        <div className="space-y-6">
          {Object.entries(sourcesByCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categorySources]) => (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Badge variant="secondary">{category}</Badge>
                    <span className="text-muted-foreground text-sm font-normal">
                      {categorySources.length} source
                      {categorySources.length !== 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {categorySources.map((source) => (
                      <RSSSourceRow
                        key={source.id}
                        source={source}
                        isTesting={testingId === source.id}
                        testResult={
                          testResult?.id === source.id ? testResult : null
                        }
                        onEdit={() => handleEdit(source)}
                        onDelete={() => handleDeleteClick(source)}
                        onToggleActive={() => handleToggleActive(source)}
                        onTest={() => handleTest(source)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSource ? "Edit RSS Source" : "Add RSS Source"}
            </DialogTitle>
            <DialogDescription>
              {editingSource
                ? "Update the RSS feed details below."
                : "Enter the details for the new RSS feed."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., TechCrunch"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">Feed URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="https://example.com/rss"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, category: value }))
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {RSS_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="active" className="cursor-pointer">
                Active
              </Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, active: checked }))
                }
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingSource ? "Save Changes" : "Add Source"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete RSS Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingSource?.name}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import OPML Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import RSS Feeds from OPML</DialogTitle>
            <DialogDescription>
              Import multiple RSS feeds at once from an OPML file or URL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Import method tabs */}
            <div className="flex gap-2">
              <Button
                variant={importMethod === "url" ? "default" : "outline"}
                size="sm"
                onClick={() => setImportMethod("url")}
                className="flex-1"
              >
                <Link className="h-4 w-4" />
                From URL
              </Button>
              <Button
                variant={importMethod === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setImportMethod("file")}
                className="flex-1"
              >
                <FileUp className="h-4 w-4" />
                Upload File
              </Button>
            </div>

            {/* URL input */}
            {importMethod === "url" && (
              <div className="space-y-2">
                <Label htmlFor="import-url">OPML URL</Label>
                <Input
                  id="import-url"
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://example.com/feeds.opml"
                />
                {OPML_PRESETS.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Preset:</span>{" "}
                    <button
                      type="button"
                      onClick={() => setImportUrl(OPML_PRESETS[0].url)}
                      className="text-primary hover:underline"
                    >
                      {OPML_PRESETS[0].name}
                    </button>
                    <span className="ml-1">({OPML_PRESETS[0].description})</span>
                  </div>
                )}
              </div>
            )}

            {/* File upload */}
            {importMethod === "file" && (
              <div className="space-y-2">
                <Label htmlFor="import-file">OPML File</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".opml,.xml,text/xml,application/xml"
                  onChange={handleFileUpload}
                  disabled={importing}
                />
              </div>
            )}

            {/* Import options */}
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="import-category">Default Category</Label>
                <Select
                  value={importCategory}
                  onValueChange={setImportCategory}
                >
                  <SelectTrigger id="import-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RSS_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Feeds will use their OPML category if available, or this default.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="import-active" className="cursor-pointer">
                    Activate on import
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable feeds immediately for curation
                  </p>
                </div>
                <Switch
                  id="import-active"
                  checked={importActiveByDefault}
                  onCheckedChange={setImportActiveByDefault}
                />
              </div>
            </div>

            {/* Import result */}
            {importResult && (
              <div
                className={cn(
                  "p-3 rounded-md text-sm",
                  importResult.errors.length > 0 && importResult.imported === 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
                )}
              >
                <div className="flex items-start gap-2">
                  {importResult.errors.length > 0 && importResult.imported === 0 ? (
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">
                      {importResult.imported > 0
                        ? `Successfully imported ${importResult.imported} feed${importResult.imported !== 1 ? "s" : ""}`
                        : "Import failed"}
                    </p>
                    {importResult.skipped > 0 && (
                      <p className="text-xs mt-1">
                        {importResult.skipped} duplicate{importResult.skipped !== 1 ? "s" : ""} skipped
                      </p>
                    )}
                    {importResult.errors.length > 0 && (
                      <ul className="text-xs mt-1 list-disc list-inside">
                        {importResult.errors.slice(0, 3).map((e, i) => (
                          <li key={i}>{e.error}</li>
                        ))}
                        {importResult.errors.length > 3 && (
                          <li>...and {importResult.errors.length - 3} more errors</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsImportDialogOpen(false)}
              disabled={importing}
            >
              {importResult && importResult.imported > 0 ? "Done" : "Cancel"}
            </Button>
            {importMethod === "url" && (
              <Button
                onClick={handleImportFromUrl}
                disabled={importing || !importUrl.trim()}
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                Import Feeds
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Props for RSSSourceRow
 */
interface RSSSourceRowProps {
  source: RSSSource;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onTest: () => void;
}

/**
 * Individual RSS source row component
 */
function RSSSourceRow({
  source,
  isTesting,
  testResult,
  onEdit,
  onDelete,
  onToggleActive,
  onTest,
}: RSSSourceRowProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      {/* Source info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium truncate">{source.name}</h4>
          {source.lastError && (
            <Badge variant="destructive" className="text-xs">
              Error
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[300px] flex items-center gap-1"
          >
            {source.url}
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last fetched: {formatDate(source.lastFetchedAt)}
          </span>
        </div>
        {source.lastError && (
          <p className="text-xs text-destructive mt-1 truncate" title={source.lastError}>
            {source.lastError}
          </p>
        )}
        {testResult && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs mt-1",
              testResult.success ? "text-green-600" : "text-destructive"
            )}
          >
            {testResult.success ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {source.active ? "Active" : "Inactive"}
        </span>
        <Switch
          checked={source.active}
          onCheckedChange={onToggleActive}
          aria-label={`Toggle ${source.name} active status`}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onTest}
          disabled={isTesting}
          title="Test feed"
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Delete"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default RSSSourceManager;

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  FileText,
  Briefcase,
  Calendar,
  Clock,
  Send,
  CheckCircle,
  AlertCircle,
  Inbox,
  ChevronRight,
} from "lucide-react";

interface Edition {
  id: string;
  week: number;
  year: number;
  status: "DRAFT" | "FINALIZED" | "SENT";
  finalizedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  articleCount: number;
  projectCount: number;
}

function getStatusBadge(status: Edition["status"]) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="secondary">Draft</Badge>;
    case "FINALIZED":
      return <Badge variant="warning">Finalized</Badge>;
    case "SENT":
      return <Badge variant="success">Sent</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCurrentWeekAndYear(): { week: number; year: number } {
  const now = new Date();
  const year = now.getFullYear();

  // Calculate ISO week number
  const tempDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return { week, year };
}

export default function EditionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create edition dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newEditionWeek, setNewEditionWeek] = useState<number>(1);
  const [newEditionYear, setNewEditionYear] = useState<number>(2026);

  useEffect(() => {
    loadEditions();

    // Set default week/year for new edition
    const { week, year } = getCurrentWeekAndYear();
    setNewEditionWeek(week);
    setNewEditionYear(year);
  }, []);

  const loadEditions = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/editions");
      const result = await res.json();

      if (result.success) {
        setEditions(result.data);
      } else {
        setError(result.error || "Failed to load editions");
      }
    } catch (err) {
      console.error("Error loading editions:", err);
      setError("Failed to load editions");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEdition = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: newEditionWeek,
          year: newEditionYear,
          autoPopulate: true,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setShowCreateDialog(false);
        // Navigate to the new edition
        router.push(`/dashboard/send/${result.data.id}`);
      } else {
        setCreateError(result.error || "Failed to create edition");
      }
    } catch (err) {
      console.error("Error creating edition:", err);
      setCreateError("Failed to create edition");
    } finally {
      setCreating(false);
    }
  };

  const handleEditionClick = (editionId: string) => {
    router.push(`/dashboard/send/${editionId}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Newsletter Editions" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Loading editions...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Newsletter Editions" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Error Loading Editions</h2>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Button onClick={loadEditions}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Empty state
  if (editions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Newsletter Editions" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <Inbox className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">No Editions Yet</h2>
              <p className="text-muted-foreground mb-6">
                Create your first newsletter edition to get started. Editions help you organize
                and track your newsletters by week.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Edition
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Create Edition Dialog */}
        <CreateEditionDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          week={newEditionWeek}
          year={newEditionYear}
          onWeekChange={setNewEditionWeek}
          onYearChange={setNewEditionYear}
          onSubmit={handleCreateEdition}
          creating={creating}
          error={createError}
        />
      </div>
    );
  }

  // Editions list
  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Newsletter Editions" />

      <div className="flex-1 p-6 overflow-auto">
        {/* Header with Create Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">All Editions</h2>
            <p className="text-sm text-muted-foreground">
              {editions.length} edition{editions.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Edition
          </Button>
        </div>

        {/* Editions Table/Cards */}
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {editions.map((edition) => (
                <div
                  key={edition.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleEditionClick(edition.id)}
                >
                  {/* Left: Week/Year and Status */}
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Week {edition.week}, {edition.year}
                        </span>
                        {getStatusBadge(edition.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Created {formatDate(edition.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Counts */}
                  <div className="hidden md:flex items-center gap-6">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>{edition.articleCount} articles</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <span>{edition.projectCount} projects</span>
                    </div>
                  </div>

                  {/* Right: Sent Date or Status Indicator */}
                  <div className="flex items-center gap-4">
                    {edition.status === "SENT" && edition.sentAt ? (
                      <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                        <Send className="w-4 h-4" />
                        <span>{formatDate(edition.sentAt)}</span>
                      </div>
                    ) : edition.status === "FINALIZED" ? (
                      <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4" />
                        <span>Ready to send</span>
                      </div>
                    ) : (
                      <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>In progress</span>
                      </div>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {editions.filter((e) => e.status === "DRAFT").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Draft Editions</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {editions.filter((e) => e.status === "FINALIZED").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Ready to Send</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {editions.filter((e) => e.status === "SENT").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Sent Editions</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Edition Dialog */}
      <CreateEditionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        week={newEditionWeek}
        year={newEditionYear}
        onWeekChange={setNewEditionWeek}
        onYearChange={setNewEditionYear}
        onSubmit={handleCreateEdition}
        creating={creating}
        error={createError}
      />
    </div>
  );
}

interface CreateEditionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  week: number;
  year: number;
  onWeekChange: (week: number) => void;
  onYearChange: (year: number) => void;
  onSubmit: () => void;
  creating: boolean;
  error: string | null;
}

function CreateEditionDialog({
  open,
  onOpenChange,
  week,
  year,
  onWeekChange,
  onYearChange,
  onSubmit,
  creating,
  error,
}: CreateEditionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Edition</DialogTitle>
          <DialogDescription>
            Create a new newsletter edition. Approved articles and featured projects
            will be automatically added.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="week">Week Number</Label>
              <Input
                id="week"
                type="number"
                min={1}
                max={53}
                value={week}
                onChange={(e) => onWeekChange(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => onYearChange(parseInt(e.target.value) || 2026)}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            This will create a draft edition for Week {week}, {year} and automatically
            populate it with approved articles and featured projects.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Edition
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

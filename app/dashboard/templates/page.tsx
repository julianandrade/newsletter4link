"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Zap,
  Star,
  Info,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TemplatesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

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

      if (!response.ok) throw new Error("Failed to update template");

      // Update local state optimistically
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === template.id) {
            return { ...t, isActive: !template.isActive };
          }
          // If activating this one, deactivate others
          if (!template.isActive && t.isActive) {
            return { ...t, isActive: false };
          }
          return t;
        })
      );
    } catch (error) {
      console.error("Error updating template:", error);
      fetchTemplates(); // Refresh on error
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

      // Update local state optimistically
      setTemplates((prev) =>
        prev.map((t) => {
          if (t.id === template.id) {
            return { ...t, isDefault: !template.isDefault };
          }
          // If setting this as default, unset others
          if (!template.isDefault && t.isDefault) {
            return { ...t, isDefault: false };
          }
          return t;
        })
      );
    } catch (error) {
      console.error("Error updating template:", error);
      fetchTemplates(); // Refresh on error
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await fetch(`/api/templates/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete template");
      }

      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete template");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1">
        <AppHeader title="Email Templates" />

        <div className="flex-1 p-6 space-y-6">
          {/* Info Card */}
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">Template Settings</p>
                  <ul className="space-y-1 text-blue-700 dark:text-blue-300">
                    <li>
                      <strong>Active</strong> — Used when sending newsletters
                      without selecting a specific template
                    </li>
                    <li>
                      <strong>Default</strong> — Pre-selected in the template
                      dropdown on the Send page
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Templates List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Templates</CardTitle>
                <CardDescription>
                  Manage your newsletter email templates
                </CardDescription>
              </div>
              <Button asChild>
                <Link href="/dashboard/templates/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Template
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground mb-4">No templates yet.</p>
                  <Button asChild>
                    <Link href="/dashboard/templates/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First Template
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={`p-4 border rounded-lg transition-colors ${
                        template.isActive
                          ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/50"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Template Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{template.name}</h3>
                            {template.isActive && (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            )}
                            {template.isDefault && (
                              <Badge
                                variant="secondary"
                                className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                              >
                                <Star className="h-3 w-3 mr-1" />
                                Default
                              </Badge>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {template.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            Updated {formatDate(template.updatedAt)}
                          </p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-6">
                          {/* Toggle Switches */}
                          <div className="flex items-center gap-6">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`active-${template.id}`}
                                    checked={template.isActive}
                                    onCheckedChange={() => handleToggleActive(template)}
                                    disabled={updating === template.id}
                                  />
                                  <Label
                                    htmlFor={`active-${template.id}`}
                                    className="text-sm cursor-pointer"
                                  >
                                    Active
                                  </Label>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Used when sending without selecting a template</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`default-${template.id}`}
                                    checked={template.isDefault}
                                    onCheckedChange={() => handleToggleDefault(template)}
                                    disabled={updating === template.id}
                                  />
                                  <Label
                                    htmlFor={`default-${template.id}`}
                                    className="text-sm cursor-pointer"
                                  >
                                    Default
                                  </Label>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Pre-selected in the Send page dropdown</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 border-l pl-4">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" asChild>
                                  <Link href={`/dashboard/templates/${template.id}`}>
                                    <Pencil className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit template</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(template)}
                                  disabled={template.isActive}
                                  className={template.isActive ? "opacity-50" : ""}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {template.isActive
                                  ? "Cannot delete active template"
                                  : "Delete template"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

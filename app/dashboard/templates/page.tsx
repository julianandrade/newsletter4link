"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, CheckCircle, Star } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
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

  const fetchTemplates = () => {
    setIsLoading(true);
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        // Ensure we always set an array, even if API returns error object
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}/activate`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to activate template");

      // Refresh templates
      fetchTemplates();
    } catch (error) {
      console.error("Error activating template:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete template");
      }

      // Refresh templates
      fetchTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete template");
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Email Templates" />

      <div className="flex-1 p-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>Manage your newsletter email templates</CardDescription>
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
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      template.isActive ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
                        {template.isActive && (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Updated {formatDate(template.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!template.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(template.id)}
                        >
                          <Star className="h-4 w-4 mr-1" />
                          Activate
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/dashboard/templates/${template.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template.id)}
                        disabled={template.isActive}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

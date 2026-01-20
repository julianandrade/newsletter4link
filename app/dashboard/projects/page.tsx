"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Star, Users, Calendar } from "lucide-react";

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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    team: "",
    projectDate: "",
    impact: "",
    imageUrl: "",
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      team: "",
      projectDate: "",
      impact: "",
      imageUrl: "",
    });
    setEditingId(null);
    setDialogOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
        resetForm();
      }
    } catch (error) {
      console.error("Error saving project:", error);
    }
  };

  const handleEdit = (project: Project) => {
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

  const handleDeleteClick = (project: Project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;

    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setProjects(projects.filter((p) => p.id !== projectToDelete.id));
      }
    } catch (error) {
      console.error("Error deleting project:", error);
    } finally {
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    }
  };

  const toggleFeatured = async (id: string, featured: boolean) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !featured }),
      });

      const data = await res.json();

      if (data.success) {
        setProjects(
          projects.map((p) =>
            p.id === id ? { ...p, featured: !featured } : p
          )
        );
      }
    } catch (error) {
      console.error("Error toggling featured:", error);
    }
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Projects" />
        <main className="flex-1 p-6">
          <p className="text-muted-foreground">Loading projects...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Projects" />

      <main className="flex-1 p-6 space-y-6">
        {/* Header with Add Button */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground">
              Manage Link&apos;s AI projects and achievements
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Project" : "Add New Project"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Update the project details below."
                    : "Fill in the details for your new project."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Enter project name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe what this project does"
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="team">Team *</Label>
                    <Input
                      id="team"
                      value={formData.team}
                      onChange={(e) =>
                        setFormData({ ...formData, team: e.target.value })
                      }
                      placeholder="e.g., Data Science"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="projectDate">Date *</Label>
                    <Input
                      id="projectDate"
                      type="date"
                      value={formData.projectDate}
                      onChange={(e) =>
                        setFormData({ ...formData, projectDate: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="impact">Impact / Results</Label>
                  <Textarea
                    id="impact"
                    value={formData.impact}
                    onChange={(e) =>
                      setFormData({ ...formData, impact: e.target.value })
                    }
                    rows={2}
                    placeholder="e.g., 40% reduction in support tickets"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Image URL (optional)</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, imageUrl: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingId ? "Update Project" : "Create Project"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{projectToDelete?.name}
                &quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Project Cards Grid */}
        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-center">
                No projects yet. Add your first project to showcase Link&apos;s
                AI work.
              </p>
              <Button className="mt-4" onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className="flex flex-col">
                <CardContent className="flex-1 pt-6">
                  {/* Featured Badge */}
                  {project.featured && (
                    <Badge variant="default" className="mb-3 gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      Featured
                    </Badge>
                  )}

                  {/* Project Name */}
                  <h3 className="text-lg font-semibold mb-2">{project.name}</h3>

                  {/* Team and Date */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {project.team}
                    </Badge>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(project.projectDate).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </span>
                  </div>

                  {/* Description */}
                  <CardDescription className="line-clamp-3 mb-3">
                    {project.description}
                  </CardDescription>

                  {/* Impact */}
                  {project.impact && (
                    <div className="p-3 bg-muted rounded-lg mb-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        Impact
                      </p>
                      <p className="text-sm">{project.impact}</p>
                    </div>
                  )}
                </CardContent>

                {/* Actions Row */}
                <div className="flex items-center gap-1 p-4 pt-0 border-t mt-auto">
                  <Button
                    size="sm"
                    variant={project.featured ? "secondary" : "ghost"}
                    onClick={() => toggleFeatured(project.id, project.featured)}
                    title={project.featured ? "Remove from featured" : "Feature in newsletter"}
                  >
                    <Star
                      className={`h-4 w-4 ${
                        project.featured ? "fill-current" : ""
                      }`}
                    />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(project)}
                    title="Edit project"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteClick(project)}
                    title="Delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Star,
  Users,
  Calendar,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Types
export interface Project {
  id: string;
  name: string;
  description: string;
  team: string;
  projectDate: string;
  impact: string | null;
  imageUrl: string | null;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EditionProjectPickerProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[], orderedProjects: Project[]) => void;
  initialProjects?: Project[];
  className?: string;
}

export function EditionProjectPicker({
  selectedIds,
  onSelectionChange,
  initialProjects = [],
  className,
}: EditionProjectPickerProps) {
  // State
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Project[]>(
    initialProjects.filter((p) => selectedIds.includes(p.id))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Fetch available projects
  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects");
      const data = await response.json();

      if (data.success) {
        // Filter by search query client-side since API may not support search
        let projects = data.data as Project[];
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          projects = projects.filter(
            (p) =>
              p.name.toLowerCase().includes(query) ||
              p.description.toLowerCase().includes(query) ||
              p.team.toLowerCase().includes(query)
          );
        }
        setAvailableProjects(projects);
      } else {
        setError(data.error || "Failed to fetch projects");
      }
    } catch (err) {
      setError("Failed to fetch projects");
      console.error("Error fetching projects:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Initial fetch
  useEffect(() => {
    fetchProjects();
  }, []);

  // Debounced search
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchProjects();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, fetchProjects]);

  // Sync selected projects when selectedIds prop changes
  useEffect(() => {
    if (initialProjects.length > 0 && selectedIds.length > 0) {
      const orderedSelected = selectedIds
        .map((id) => initialProjects.find((p) => p.id === id))
        .filter(Boolean) as Project[];
      setSelectedProjects(orderedSelected);
    }
  }, [selectedIds, initialProjects]);

  // Add project to selection
  const handleAddProject = (project: Project) => {
    if (selectedProjects.find((p) => p.id === project.id)) return;

    const newSelected = [...selectedProjects, project];
    setSelectedProjects(newSelected);
    onSelectionChange(
      newSelected.map((p) => p.id),
      newSelected
    );
  };

  // Remove project from selection
  const handleRemoveProject = (projectId: string) => {
    const newSelected = selectedProjects.filter((p) => p.id !== projectId);
    setSelectedProjects(newSelected);
    onSelectionChange(
      newSelected.map((p) => p.id),
      newSelected
    );
  };

  // Move project up in order
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSelected = [...selectedProjects];
    [newSelected[index - 1], newSelected[index]] = [
      newSelected[index],
      newSelected[index - 1],
    ];
    setSelectedProjects(newSelected);
    onSelectionChange(
      newSelected.map((p) => p.id),
      newSelected
    );
  };

  // Move project down in order
  const handleMoveDown = (index: number) => {
    if (index === selectedProjects.length - 1) return;
    const newSelected = [...selectedProjects];
    [newSelected[index], newSelected[index + 1]] = [
      newSelected[index + 1],
      newSelected[index],
    ];
    setSelectedProjects(newSelected);
    onSelectionChange(
      newSelected.map((p) => p.id),
      newSelected
    );
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSelected = [...selectedProjects];
    const [draggedItem] = newSelected.splice(draggedIndex, 1);
    newSelected.splice(index, 0, draggedItem);
    setSelectedProjects(newSelected);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      onSelectionChange(
        selectedProjects.map((p) => p.id),
        selectedProjects
      );
    }
    setDraggedIndex(null);
  };

  // Filter available projects to exclude already selected
  const filteredAvailable = availableProjects.filter(
    (project) => !selectedProjects.find((s) => s.id === project.id)
  );

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-4", className)}>
      {/* Available Projects Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Available Projects
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-32 text-sm text-destructive">
                {error}
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                {searchQuery
                  ? "No projects match your search"
                  : "No projects available"}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAvailable.map((project) => (
                  <div
                    key={project.id}
                    className="group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {/* Project Image Thumbnail */}
                    {project.imageUrl && (
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                        <img
                          src={project.imageUrl}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-medium leading-tight line-clamp-1">
                            {project.name}
                          </h4>
                          {project.featured && (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleAddProject(project)}
                        >
                          <Plus className="h-4 w-4" />
                          <span className="sr-only">Add project</span>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {project.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {project.team}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(project.projectDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            {filteredAvailable.length} project
            {filteredAvailable.length !== 1 ? "s" : ""} available
          </div>
        </CardContent>
      </Card>

      {/* Selected Projects Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Selected Projects ({selectedProjects.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Drag to reorder or use the arrow buttons
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[400px] pr-4">
            {selectedProjects.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No projects selected. Add projects from the left panel.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedProjects.map((project, index) => (
                  <div
                    key={project.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "group flex items-start gap-2 p-3 rounded-lg border bg-card transition-all",
                      draggedIndex === index && "opacity-50 border-primary"
                    )}
                  >
                    {/* Drag Handle */}
                    <div className="cursor-grab active:cursor-grabbing pt-0.5">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Order Number */}
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {index + 1}
                    </div>

                    {/* Project Image Thumbnail */}
                    {project.imageUrl && (
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                        <img
                          src={project.imageUrl}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Project Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-medium leading-tight line-clamp-1">
                          {project.name}
                        </h4>
                        {project.featured && (
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {project.team}
                        </span>
                        <span>·</span>
                        <span>{formatDate(project.projectDate)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-3 w-3" />
                        <span className="sr-only">Move up</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === selectedProjects.length - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                        <span className="sr-only">Move down</span>
                      </Button>
                    </div>

                    {/* Remove Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveProject(project.id)}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove project</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            {selectedProjects.length} project
            {selectedProjects.length !== 1 ? "s" : ""} selected
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

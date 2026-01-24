"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Upload,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Check,
  ImagePlus,
  AlertCircle,
} from "lucide-react";

/**
 * MediaAsset shape from the API
 */
interface MediaAsset {
  id: string;
  filename: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
}

/**
 * API response shape for listing media
 */
interface MediaListResponse {
  success: boolean;
  data: MediaAsset[];
  count: number;
  total: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * API response shape for upload
 */
interface MediaUploadResponse {
  success: boolean;
  data?: MediaAsset;
  error?: string;
  message?: string;
}

/**
 * Props for the MediaLibrary component
 */
export interface MediaLibraryProps {
  /** Called when user selects an image */
  onSelect: (url: string) => void;
  /** Custom trigger element, defaults to a button */
  trigger?: React.ReactNode;
  /** Currently selected URL (for highlighting) */
  selectedUrl?: string;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * MediaLibrary component - A dialog for browsing, uploading, and selecting media assets
 */
export function MediaLibrary({
  onSelect,
  trigger,
  selectedUrl,
}: MediaLibraryProps) {
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Fetch media assets from the API
   */
  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/media?type=image&limit=100");
      const data: MediaListResponse = await response.json();

      if (data.success) {
        setMedia(data.data);
      } else {
        setError("Failed to load media");
      }
    } catch (err) {
      setError("Failed to load media");
      console.error("Error fetching media:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load media when dialog opens
   */
  useEffect(() => {
    if (open) {
      fetchMedia();
    }
  }, [open, fetchMedia]);

  /**
   * Handle file upload
   */
  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });

        const data: MediaUploadResponse = await response.json();

        if (data.success && data.data) {
          // Add to the beginning of the list
          setMedia((prev) => [data.data!, ...prev]);
        } else {
          setError(data.error || "Upload failed");
        }
      } catch (err) {
        setError("Upload failed");
        console.error("Error uploading file:", err);
      } finally {
        setUploading(false);
        // Reset the input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    []
  );

  /**
   * Handle media selection
   */
  const handleSelect = useCallback(
    (url: string) => {
      onSelect(url);
      setOpen(false);
    },
    [onSelect]
  );

  /**
   * Handle media deletion
   */
  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/media?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setMedia((prev) => prev.filter((m) => m.id !== id));
        setDeleteConfirmId(null);
      } else {
        setError(data.error || "Delete failed");
      }
    } catch (err) {
      setError("Delete failed");
      console.error("Error deleting media:", err);
    } finally {
      setDeleting(false);
    }
  }, []);

  /**
   * Trigger upload dialog
   */
  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <ImageIcon className="mr-2 h-4 w-4" />
            Browse Media
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
          <DialogDescription>
            Browse and select images, or upload new ones.
          </DialogDescription>
        </DialogHeader>

        {/* Upload section */}
        <div className="flex items-center justify-between border-b pb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            onClick={triggerUpload}
            disabled={uploading}
            variant="outline"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload New
              </>
            )}
          </Button>

          <p className="text-sm text-muted-foreground">
            Max 5MB. Supports JPEG, PNG, GIF, WebP, SVG
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Media grid */}
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : media.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ImagePlus className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">No media uploaded yet</p>
              <p className="text-sm">Upload your first image to get started</p>
              <Button onClick={triggerUpload} className="mt-4" variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4 p-1">
              {media.map((item) => (
                <MediaItem
                  key={item.id}
                  item={item}
                  isSelected={item.url === selectedUrl}
                  isConfirmingDelete={deleteConfirmId === item.id}
                  isDeleting={deleting && deleteConfirmId === item.id}
                  onSelect={() => handleSelect(item.url)}
                  onDelete={() => setDeleteConfirmId(item.id)}
                  onConfirmDelete={() => handleDelete(item.id)}
                  onCancelDelete={() => setDeleteConfirmId(null)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Props for MediaItem component
 */
interface MediaItemProps {
  item: MediaAsset;
  isSelected: boolean;
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

/**
 * Individual media item in the grid
 */
function MediaItem({
  item,
  isSelected,
  isConfirmingDelete,
  isDeleting,
  onSelect,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
}: MediaItemProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-lg border-2 transition-all",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          isSelected
            ? "border-primary ring-2 ring-primary ring-offset-2"
            : "border-transparent hover:border-muted-foreground/50"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="bg-primary text-primary-foreground rounded-full p-1">
              <Check className="h-4 w-4" />
            </div>
          </div>
        )}

        {/* Hover overlay with filename */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-white truncate">{item.filename}</p>
          <p className="text-xs text-white/70">{formatFileSize(item.size)}</p>
        </div>
      </button>

      {/* Delete button - shown on hover unless confirming */}
      {!isConfirmingDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            "absolute top-1 right-1 p-1.5 rounded-md",
            "bg-destructive text-destructive-foreground",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-destructive/90 focus:opacity-100"
          )}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}

      {/* Delete confirmation overlay */}
      {isConfirmingDelete && (
        <div className="absolute inset-0 bg-black/80 rounded-lg flex flex-col items-center justify-center gap-2 p-2">
          <p className="text-xs text-white text-center">Delete this image?</p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onConfirmDelete();
              }}
              disabled={isDeleting}
              className="h-7 px-2 text-xs"
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Delete"
              )}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onCancelDelete();
              }}
              disabled={isDeleting}
              className="h-7 px-2 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaLibrary;

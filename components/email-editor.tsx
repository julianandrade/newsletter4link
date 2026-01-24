"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MediaLibrary } from "@/components/media-library";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Image as ImageIcon,
  X,
  Plus,
  GripVertical,
  Pencil,
  Check,
  ExternalLink,
  Calendar,
  Users,
  ChevronUp,
  ChevronDown,
  Type,
  FileText,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export interface Article {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  category: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  team: string;
  impact?: string;
  imageUrl?: string;
  projectDate: string;
}

export interface CustomBlock {
  id: string;
  type: "text" | "image";
  content: string; // HTML for text, URL for image
  position:
    | "before-articles"
    | "after-articles"
    | "before-projects"
    | "after-projects";
}

export interface EditedNewsletterData {
  articles: Article[];
  projects: Project[];
  customBlocks: CustomBlock[];
}

export interface EmailEditorProps {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
  onDataChange: (data: EditedNewsletterData) => void;
}

// ============================================================================
// Toolbar Component
// ============================================================================

interface ToolbarProps {
  editor: Editor | null;
  onInsertImage: () => void;
}

function Toolbar({ editor, onInsertImage }: ToolbarProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  if (!editor) return null;

  const handleSetLink = () => {
    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  };

  const openLinkDialog = () => {
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setLinkDialogOpen(true);
  };

  return (
    <>
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className="h-8 w-8 p-0"
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className="h-8 w-8 p-0"
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          onClick={openLinkDialog}
          className="h-8 w-8 p-0"
          title="Insert Link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onInsertImage}
          className="h-8 w-8 p-0"
          title="Insert Image"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Insert Link</DialogTitle>
            <DialogDescription>
              Enter the URL for the link. Leave empty to remove the link.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSetLink();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLinkDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSetLink}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// Inline Editor Component (for editing summaries/descriptions)
// ============================================================================

interface InlineEditorProps {
  content: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

function InlineEditor({
  content,
  onSave,
  onCancel,
  placeholder = "Enter text...",
}: InlineEditorProps) {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Image.configure({
        inline: true,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded",
        },
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[100px] p-3 focus:outline-none",
      },
    },
  });

  const handleInsertImage = useCallback(
    (url: string) => {
      if (editor) {
        editor.chain().focus().setImage({ src: url }).run();
      }
      setShowMediaLibrary(false);
    },
    [editor]
  );

  const handleSave = () => {
    if (editor) {
      onSave(editor.getHTML());
    }
  };

  return (
    <div className="border rounded-md bg-background">
      <Toolbar
        editor={editor}
        onInsertImage={() => setShowMediaLibrary(true)}
      />
      <EditorContent editor={editor} />
      <div className="flex items-center justify-end gap-2 p-2 border-t">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave}>
          <Check className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
      {showMediaLibrary && (
        <MediaLibrary
          onSelect={handleInsertImage}
          trigger={<span className="hidden" />}
        />
      )}
    </div>
  );
}

// ============================================================================
// Article Card Component
// ============================================================================

interface ArticleCardProps {
  article: Article;
  onEdit: (article: Article) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function ArticleCard({
  article,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ArticleCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = (newSummary: string) => {
    onEdit({ ...article, summary: newSummary });
    setIsEditing(false);
  };

  return (
    <Card className="group relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base line-clamp-2">
              {article.title}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1.5">
              {article.category.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveUp}
              disabled={isFirst}
              className="h-7 w-7 p-0"
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveDown}
              disabled={isLast}
              className="h-7 w-7 p-0"
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-7 w-7 p-0"
              title="Edit summary"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              title="Remove from newsletter"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <InlineEditor
            content={article.summary}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
            placeholder="Enter article summary..."
          />
        ) : (
          <div
            className="prose prose-sm max-w-none text-muted-foreground cursor-pointer hover:bg-muted/50 rounded p-2 -m-2 transition-colors"
            onClick={() => setIsEditing(true)}
            dangerouslySetInnerHTML={{ __html: article.summary }}
          />
        )}
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
        >
          <ExternalLink className="h-3 w-3" />
          Read original
        </a>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Project Card Component
// ============================================================================

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function ProjectCard({
  project,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ProjectCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = (newDescription: string) => {
    onEdit({ ...project, description: newDescription });
    setIsEditing(false);
  };

  const formattedDate = useMemo(() => {
    try {
      return new Date(project.projectDate).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    } catch {
      return project.projectDate;
    }
  }, [project.projectDate]);

  return (
    <Card className="group relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.team}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formattedDate}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveUp}
              disabled={isFirst}
              className="h-7 w-7 p-0"
              title="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveDown}
              disabled={isLast}
              className="h-7 w-7 p-0"
              title="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-7 w-7 p-0"
              title="Edit description"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              title="Remove from newsletter"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {project.imageUrl && (
            <div className="flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.imageUrl}
                alt={project.name}
                className="w-24 h-24 object-cover rounded-md"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <InlineEditor
                content={project.description}
                onSave={handleSave}
                onCancel={() => setIsEditing(false)}
                placeholder="Enter project description..."
              />
            ) : (
              <div
                className="prose prose-sm max-w-none text-muted-foreground cursor-pointer hover:bg-muted/50 rounded p-2 -m-2 transition-colors"
                onClick={() => setIsEditing(true)}
                dangerouslySetInnerHTML={{ __html: project.description }}
              />
            )}
            {project.impact && (
              <p className="text-xs text-primary mt-2 font-medium">
                Impact: {project.impact}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Custom Block Component
// ============================================================================

interface CustomBlockCardProps {
  block: CustomBlock;
  onEdit: (block: CustomBlock) => void;
  onRemove: () => void;
}

function CustomBlockCard({ block, onEdit, onRemove }: CustomBlockCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = (newContent: string) => {
    onEdit({ ...block, content: newContent });
    setIsEditing(false);
  };

  return (
    <Card className="group relative border-dashed">
      <CardHeader className="pb-2 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {block.type === "text" ? (
              <Type className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">Custom Block</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {block.type === "text" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-7 w-7 p-0"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              title="Remove block"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {block.type === "text" ? (
          isEditing ? (
            <InlineEditor
              content={block.content}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
              placeholder="Enter custom content..."
            />
          ) : (
            <div
              className="prose prose-sm max-w-none cursor-pointer hover:bg-muted/50 rounded p-2 -m-2 transition-colors"
              onClick={() => setIsEditing(true)}
              dangerouslySetInnerHTML={{ __html: block.content }}
            />
          )
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.content}
            alt="Custom image"
            className="max-w-full h-auto rounded-md"
          />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Add Block Button
// ============================================================================

interface AddBlockButtonProps {
  position: CustomBlock["position"];
  onAddText: () => void;
  onAddImage: (url: string) => void;
}

function AddBlockButton({
  position,
  onAddText,
  onAddImage,
}: AddBlockButtonProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddText}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          <Type className="h-3 w-3 mr-1" />
          Text
        </Button>
        <MediaLibrary
          onSelect={onAddImage}
          trigger={
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              <ImageIcon className="h-3 w-3 mr-1" />
              Image
            </Button>
          }
        />
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ============================================================================
// Main Email Editor Component
// ============================================================================

export function EmailEditor({
  articles: initialArticles,
  projects: initialProjects,
  week,
  year,
  onDataChange,
}: EmailEditorProps) {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([]);

  // Notify parent of data changes
  useEffect(() => {
    onDataChange({ articles, projects, customBlocks });
  }, [articles, projects, customBlocks, onDataChange]);

  // Article handlers
  const handleEditArticle = useCallback((index: number, article: Article) => {
    setArticles((prev) => {
      const newArticles = [...prev];
      newArticles[index] = article;
      return newArticles;
    });
  }, []);

  const handleRemoveArticle = useCallback((index: number) => {
    setArticles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMoveArticle = useCallback((index: number, direction: -1 | 1) => {
    setArticles((prev) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const newArticles = [...prev];
      [newArticles[index], newArticles[newIndex]] = [
        newArticles[newIndex],
        newArticles[index],
      ];
      return newArticles;
    });
  }, []);

  // Project handlers
  const handleEditProject = useCallback((index: number, project: Project) => {
    setProjects((prev) => {
      const newProjects = [...prev];
      newProjects[index] = project;
      return newProjects;
    });
  }, []);

  const handleRemoveProject = useCallback((index: number) => {
    setProjects((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMoveProject = useCallback((index: number, direction: -1 | 1) => {
    setProjects((prev) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const newProjects = [...prev];
      [newProjects[index], newProjects[newIndex]] = [
        newProjects[newIndex],
        newProjects[index],
      ];
      return newProjects;
    });
  }, []);

  // Custom block handlers
  const handleAddTextBlock = useCallback((position: CustomBlock["position"]) => {
    const newBlock: CustomBlock = {
      id: `custom-${Date.now()}`,
      type: "text",
      content: "<p>Enter your custom content here...</p>",
      position,
    };
    setCustomBlocks((prev) => [...prev, newBlock]);
  }, []);

  const handleAddImageBlock = useCallback(
    (position: CustomBlock["position"], url: string) => {
      const newBlock: CustomBlock = {
        id: `custom-${Date.now()}`,
        type: "image",
        content: url,
        position,
      };
      setCustomBlocks((prev) => [...prev, newBlock]);
    },
    []
  );

  const handleEditCustomBlock = useCallback((block: CustomBlock) => {
    setCustomBlocks((prev) =>
      prev.map((b) => (b.id === block.id ? block : b))
    );
  }, []);

  const handleRemoveCustomBlock = useCallback((id: string) => {
    setCustomBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  // Filter custom blocks by position
  const getBlocksForPosition = useCallback(
    (position: CustomBlock["position"]) => {
      return customBlocks.filter((b) => b.position === position);
    },
    [customBlocks]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Week {week}, {year}
            </h2>
            <p className="text-sm text-muted-foreground">
              {articles.length} article{articles.length !== 1 ? "s" : ""},{" "}
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Before Articles - Custom Blocks */}
          <AddBlockButton
            position="before-articles"
            onAddText={() => handleAddTextBlock("before-articles")}
            onAddImage={(url) => handleAddImageBlock("before-articles", url)}
          />
          {getBlocksForPosition("before-articles").map((block) => (
            <CustomBlockCard
              key={block.id}
              block={block}
              onEdit={handleEditCustomBlock}
              onRemove={() => handleRemoveCustomBlock(block.id)}
            />
          ))}

          {/* Articles Section */}
          {articles.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Articles
              </h3>
              <div className="space-y-3">
                {articles.map((article, index) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onEdit={(a) => handleEditArticle(index, a)}
                    onRemove={() => handleRemoveArticle(index)}
                    onMoveUp={() => handleMoveArticle(index, -1)}
                    onMoveDown={() => handleMoveArticle(index, 1)}
                    isFirst={index === 0}
                    isLast={index === articles.length - 1}
                  />
                ))}
              </div>
            </section>
          )}

          {/* After Articles - Custom Blocks */}
          <AddBlockButton
            position="after-articles"
            onAddText={() => handleAddTextBlock("after-articles")}
            onAddImage={(url) => handleAddImageBlock("after-articles", url)}
          />
          {getBlocksForPosition("after-articles").map((block) => (
            <CustomBlockCard
              key={block.id}
              block={block}
              onEdit={handleEditCustomBlock}
              onRemove={() => handleRemoveCustomBlock(block.id)}
            />
          ))}

          {/* Before Projects - Custom Blocks */}
          <AddBlockButton
            position="before-projects"
            onAddText={() => handleAddTextBlock("before-projects")}
            onAddImage={(url) => handleAddImageBlock("before-projects", url)}
          />
          {getBlocksForPosition("before-projects").map((block) => (
            <CustomBlockCard
              key={block.id}
              block={block}
              onEdit={handleEditCustomBlock}
              onRemove={() => handleRemoveCustomBlock(block.id)}
            />
          ))}

          {/* Projects Section */}
          {projects.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Project Showcases
              </h3>
              <div className="space-y-3">
                {projects.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={(p) => handleEditProject(index, p)}
                    onRemove={() => handleRemoveProject(index)}
                    onMoveUp={() => handleMoveProject(index, -1)}
                    onMoveDown={() => handleMoveProject(index, 1)}
                    isFirst={index === 0}
                    isLast={index === projects.length - 1}
                  />
                ))}
              </div>
            </section>
          )}

          {/* After Projects - Custom Blocks */}
          <AddBlockButton
            position="after-projects"
            onAddText={() => handleAddTextBlock("after-projects")}
            onAddImage={(url) => handleAddImageBlock("after-projects", url)}
          />
          {getBlocksForPosition("after-projects").map((block) => (
            <CustomBlockCard
              key={block.id}
              block={block}
              onEdit={handleEditCustomBlock}
              onRemove={() => handleRemoveCustomBlock(block.id)}
            />
          ))}

          {/* Empty State */}
          {articles.length === 0 && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4" />
              <p className="text-lg font-medium">No content yet</p>
              <p className="text-sm">
                Add articles or projects to build your newsletter
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default EmailEditor;

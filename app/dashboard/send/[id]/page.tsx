"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { EditionArticlePicker, Article } from "@/components/edition-article-picker";
import { EditionProjectPicker, Project } from "@/components/edition-project-picker";
import { EditionUnlayerEditor, EditionUnlayerEditorRef } from "@/components/edition-unlayer-editor";
import { replaceContentMergeTags, type Article as ContentArticle, type Project as ContentProject } from "@/lib/email/content-renderer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/radar/compat";
import { Button } from "@/components/radar/compat";
import { Badge } from "@/components/radar/compat";
import {
  PageHeading,
  RadarButton,
  RadarMain,
} from "@/components/radar/primitives";
import {
  Callout,
  EmptyState,
  SkeletonRows,
} from "@/components/radar/controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/radar/compat";
import {
  Loader2,
  Save,
  Eye,
  Send,
  CheckCircle,
  ArrowLeft,
  Calendar,
  FileText,
  Briefcase,
  Clock,
  AlertCircle,
  Lock,
  Palette,
  Users,
  Mail,
  Search,
  Pencil,
  List,
  ExternalLink,
  RefreshCw,
  Globe,
} from "lucide-react";
import { Checkbox } from "@/components/radar/compat";
import { Input } from "@/components/radar/compat";
import { Textarea } from "@/components/radar/compat";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isBuiltInTemplateId } from "@/lib/email/builtin-template";

// Types
interface Template {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  designJson: object | null;
  /** RQ-003: the AI Radar edition, which is code rather than a stored row. */
  builtIn?: boolean;
}

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
}

interface EmailProvider {
  id: "resend" | "graph";
  name: string;
  configured: boolean;
  fromEmail: string | null;
}

interface EditionDetail {
  id: string;
  week: number;
  year: number;
  /** RQ-008: the edition's own name, null on a weekly. */
  title: string | null;
  kind: "WEEKLY" | "SPECIAL";
  publishDate: string;
  /** The title, or the week label when there is none. Derived by the API. */
  label: string;
  status: "DRAFT" | "FINALIZED" | "SENT";
  finalizedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  articles: Array<Article & { order: number }>;
  projects: Array<Project & { order: number }>;
  articleCount: number;
  projectCount: number;
  editorDesignJson: object | null;
  templateId: string | null;
  // SharePoint fields
  sharePointUrl: string | null;
  sharePointPageId: string | null;
  sharePointPublishedAt: string | null;
  sharePointError: string | null;
}

// Status badge component
function getStatusBadge(status: EditionDetail["status"]) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="secondary">Draft</Badge>;
    case "FINALIZED":
      return <Badge variant="warning">Finalised</Badge>;
    case "SENT":
      return <Badge variant="success">Sent</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Format date helper. en-GB, to match every other stamp in the app.
function formatDate(dateString: string | null) {
  if (!dateString) return "not set";
  return new Date(dateString).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EditionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const editionId = params.id as string;

  // State
  const [loading, setLoading] = useState(true);
  const [edition, setEdition] = useState<EditionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Subscriber state
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [selectedSubscriberIds, setSelectedSubscriberIds] = useState<string[]>([]);
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [lastPreviewedAt, setLastPreviewedAt] = useState<string | null>(null);

  // Recipient mode: "all" (all subscribers), "selected" (pick subscribers), "adhoc" (type emails)
  const [recipientMode, setRecipientMode] = useState<"all" | "selected" | "adhoc">("adhoc");
  const [adHocEmails, setAdHocEmails] = useState("");

  // Provider state
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<"resend" | "graph" | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<"resend" | "graph">("resend");

  // Selection state
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Article[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);

  // Edit mode state
  const [contentMode, setContentMode] = useState<"select" | "edit">("select");
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [editorDesign, setEditorDesign] = useState<object | null>(null);
  const editorRef = useRef<EditionUnlayerEditorRef>(null);

  // Dirty state tracking
  const [isDirty, setIsDirty] = useState(false);
  const hasUnsavedChanges = isDirty || isEditorDirty;

  // Drafts state (Ghost Writer)
  const [drafts, setDrafts] = useState<Array<{ id: string; status: string; approvedAt?: string | null; generatedAt?: string | null }>>([]);
  const [selectedApprovedDraftId, setSelectedApprovedDraftId] = useState<string | null>(null);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false);
  const [approvedDraftSubjectLines, setApprovedDraftSubjectLines] = useState<string[]>([]);
  const [isLoadingApprovedDraft, setIsLoadingApprovedDraft] = useState(false);
  const [approvedDraftHeroTitle, setApprovedDraftHeroTitle] = useState<string | null>(null);
  const [approvedDraftHeroSummary, setApprovedDraftHeroSummary] = useState<string | null>(null);

  // Action states
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sending, setSending] = useState(false);
  const [retryingSharePoint, setRetryingSharePoint] = useState(false);

  // Dialog states
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    message: string;
    data?: { sent: number; failed: number };
  } | null>(null);

  // Load edition data
  const loadEdition = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/editions/${editionId}`);
      const result = await res.json();

      if (result.success) {
        const data = result.data as EditionDetail;
        setEdition(data);

        // Initialize selections from edition data
        const articleIds = data.articles.map((a) => a.id);
        const projectIds = data.projects.map((p) => p.id);

        setSelectedArticleIds(articleIds);
        setSelectedArticles(data.articles);
        setSelectedProjectIds(projectIds);
        setSelectedProjects(data.projects);
        setIsDirty(false);

        // Initialize editor design and template if present
        if (data.editorDesignJson) {
          setEditorDesign(data.editorDesignJson);
        }
        if (data.templateId) {
          setSelectedTemplateId(data.templateId);
        }
      } else {
        setError(result.error || "Failed to load edition");
      }
    } catch (err) {
      console.error("Error loading edition:", err);
      setError("Failed to load edition");
    } finally {
      setLoading(false);
    }
  }, [editionId]);

  const loadDrafts = useCallback(async () => {
    setIsLoadingDrafts(true);
    try {
      const res = await fetch(`/api/drafts?editionId=${editionId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.drafts)) {
        setDrafts(data.drafts);
        const approvedDrafts = data.drafts
          .filter((draft: any) => draft.status === "APPROVED")
          .sort((a: any, b: any) =>
            new Date(b.approvedAt || b.generatedAt || 0).getTime() -
            new Date(a.approvedAt || a.generatedAt || 0).getTime()
          );
        setSelectedApprovedDraftId((prev) => {
          if (prev && approvedDrafts.some((draft: any) => draft.id === prev)) {
            return prev;
          }
          if (approvedDrafts.length === 1) {
            return approvedDrafts[0]?.id || null;
          }
          return null;
        });
      } else {
        setDrafts([]);
        setSelectedApprovedDraftId(null);
      }
    } catch (err) {
      console.error("Failed to load drafts:", err);
      setDrafts([]);
      setSelectedApprovedDraftId(null);
    } finally {
      setIsLoadingDrafts(false);
    }
  }, [editionId]);

  const loadApprovedDraftSubjectLines = useCallback(async () => {
    if (!selectedApprovedDraftId) {
      setApprovedDraftSubjectLines([]);
      setApprovedDraftHeroTitle(null);
      setApprovedDraftHeroSummary(null);
      return;
    }

    setIsLoadingApprovedDraft(true);
    try {
      const res = await fetch(`/api/drafts/${selectedApprovedDraftId}`);
      const data = await res.json();
      if (res.ok && data.draft?.content?.subjectLines) {
        const content = data.draft.content as {
          subjectLines?: string[];
          sections?: Array<{ articles?: Array<{ title?: string; summary?: string; isHero?: boolean }> }>;
        };
        setApprovedDraftSubjectLines(content.subjectLines || []);
        const allArticles = content.sections?.flatMap((section) => section.articles || []) || [];
        const heroArticle = allArticles.find((article) => article.isHero) || allArticles[0];
        setApprovedDraftHeroTitle(heroArticle?.title || null);
        setApprovedDraftHeroSummary(heroArticle?.summary || null);
      } else {
        setApprovedDraftSubjectLines([]);
        setApprovedDraftHeroTitle(null);
        setApprovedDraftHeroSummary(null);
      }
    } catch (err) {
      console.error("Failed to load draft subject lines:", err);
      setApprovedDraftSubjectLines([]);
      setApprovedDraftHeroTitle(null);
      setApprovedDraftHeroSummary(null);
    } finally {
      setIsLoadingApprovedDraft(false);
    }
  }, [selectedApprovedDraftId]);

  useEffect(() => {
    loadEdition();
    loadDrafts();
  }, [loadEdition, loadDrafts]);

  useEffect(() => {
    loadApprovedDraftSubjectLines();
  }, [loadApprovedDraftSubjectLines]);

  // Load templates
  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          /**
           * RQ-003: keep the built-in edition, which has no designJson because
           * it is code. The Unlayer filter used to drop it, so the only way to
           * reach it was an unnamed "Default Template" option.
           */
          const selectable = data.filter(
            (t: Template) => t.designJson || t.builtIn
          );
          setTemplates(selectable);
          if (!selectedTemplateId) {
            const preselected = selectable.find((t: Template) => t.isDefault);
            if (preselected) {
              setSelectedTemplateId(preselected.id);
            }
          }
        }
      })
      .catch(console.error);
  }, [selectedTemplateId]);

  // Load subscribers
  useEffect(() => {
    fetch("/api/subscribers")
      .then((res) => res.json())
      .then((data) => {
        const subscribers = Array.isArray(data.subscribers)
          ? data.subscribers
          : Array.isArray(data.data)
            ? data.data
            : [];
        if (data.success && subscribers.length > 0) {
          const activeSubscribers = subscribers.filter((s: Subscriber) => s.active);
          setSubscribers(activeSubscribers);
          // Select all by default
          setSelectedSubscriberIds(activeSubscribers.map((s: Subscriber) => s.id));
        } else if (data.success) {
          setSubscribers([]);
          setSelectedSubscriberIds([]);
        }
      })
      .catch(console.error);
  }, []);

  // Load email providers
  useEffect(() => {
    fetch("/api/email/providers")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.providers)) {
          setProviders(data.providers);
          setDefaultProvider(data.default || "resend");
          // Set selected provider to default
          setSelectedProvider(data.default || "resend");
        }
      })
      .catch(console.error);
  }, []);

  // Handle article selection change
  const handleArticleSelectionChange = (ids: string[], articles: Article[]) => {
    setSelectedArticleIds(ids);
    setSelectedArticles(articles);
    setIsDirty(true);
  };

  // Handle project selection change
  const handleProjectSelectionChange = (ids: string[], projects: Project[]) => {
    setSelectedProjectIds(ids);
    setSelectedProjects(projects);
    setIsDirty(true);
  };

  // Handle template selection - load design into editor
  const handleTemplateChange = useCallback(async (templateId: string) => {
    setSelectedTemplateId(templateId);

    // The built-in edition is code: there is no Unlayer design to load.
    if (templateId && templateId !== "default" && !isBuiltInTemplateId(templateId)) {
      // Find template and load its design
      const template = templates.find((t) => t.id === templateId);
      if (template?.designJson && editorRef.current?.isReady()) {
        editorRef.current.loadDesign(template.designJson);
        setEditorDesign(template.designJson);
      } else if (template?.designJson) {
        // Editor not ready yet, store design to load when ready
        setEditorDesign(template.designJson);
      }
    }
  }, [templates]);

  // Switch to edit mode
  const handleEnterEditMode = useCallback(() => {
    // If we have a saved design, use it; otherwise try to load from selected template
    if (!editorDesign && selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      if (template?.designJson) {
        setEditorDesign(template.designJson);
      }
    }
    setContentMode("edit");
    setIsEditorDirty(false);
  }, [editorDesign, selectedTemplateId, templates]);

  // Handle editor ready
  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true);
    // Load design if one is pending
    if (editorDesign && editorRef.current) {
      editorRef.current.loadDesign(editorDesign);
    }
  }, [editorDesign]);

  // Handle editor design change
  const handleEditorDesignChange = useCallback(() => {
    setIsEditorDirty(true);
  }, []);

  // Switch back to select mode
  const handleExitEditMode = useCallback(async () => {
    // Save current design before exiting
    if (editorRef.current?.isReady()) {
      try {
        const design = await editorRef.current.saveDesign();
        setEditorDesign(design);
      } catch (err) {
        console.error("Failed to save design:", err);
      }
    }
    setContentMode("select");
  }, []);

  // Save draft
  const handleSaveDraft = async () => {
    if (!edition) return;

    setSaving(true);
    try {
      // Save current editor design if in edit mode
      let designToSave = editorDesign;
      if (contentMode === "edit" && editorRef.current?.isReady()) {
        try {
          designToSave = await editorRef.current.saveDesign();
          setEditorDesign(designToSave);
        } catch (err) {
          console.error("Failed to save editor design:", err);
        }
      }

      const res = await fetch(`/api/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articles: selectedArticleIds.map((id, index) => ({
            articleId: id,
            order: index + 1,
          })),
          projects: selectedProjectIds.map((id, index) => ({
            projectId: id,
            order: index + 1,
          })),
          editorDesignJson: designToSave,
          templateId: selectedTemplateId || null,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setEdition(result.data);
        setIsDirty(false);
        setIsEditorDirty(false);
        toast.success("Draft saved");
      } else {
        setError(result.error || "Failed to save draft");
      }
    } catch (err) {
      console.error("Error saving draft:", err);
      setError("Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  // Generate preview
  const handlePreview = async () => {
    if (!edition) return;

    setPreviewing(true);
    setPreviewHtml(null);

    try {
      let html: string | null = null;

      // If in edit mode with Unlayer, export HTML directly and replace merge tags
      if (contentMode === "edit" && editorRef.current?.isReady()) {
        const { html: exportedHtml } = await editorRef.current.exportHtml();

        // Convert articles and projects to content renderer format
        const contentArticles: ContentArticle[] = selectedArticles.map((a) => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          sourceUrl: a.sourceUrl || "",
          category: a.category || [],
        }));

        const contentProjects: ContentProject[] = selectedProjects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          team: p.team || "",
          impact: p.impact,
          imageUrl: p.imageUrl,
        }));

        // Replace merge tags with actual content
        html = replaceContentMergeTags(exportedHtml, {
          articles: contentArticles,
          projects: contentProjects,
          week: edition.week,
          year: edition.year,
        });

        setPreviewHtml(html);
        setShowPreviewDialog(true);
        setLastPreviewedAt(new Date().toISOString());
      } else {
        // Use server-side preview for select mode
        const res = await fetch("/api/email/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editionId,
            templateId: selectedTemplateId || undefined,
            draftId: selectedApprovedDraftId || undefined,
          }),
        });

        const result = await res.json();

        if (result.success) {
          setPreviewHtml(result.html);
          setShowPreviewDialog(true);
          setLastPreviewedAt(new Date().toISOString());
        } else {
          toast.error(result.error || "Failed to generate preview");
        }
      }
    } catch (err) {
      console.error("Error generating preview:", err);
      toast.error("Failed to generate preview");
    } finally {
      setPreviewing(false);
    }
  };

  // Finalize edition
  const handleFinalize = async () => {
    if (!edition) return;

    setFinalizing(true);
    try {
      // First save any pending changes
      if (isDirty) {
        await handleSaveDraft();
      }

      const res = await fetch(`/api/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINALIZED" }),
      });

      const result = await res.json();

      if (result.success) {
        setEdition(result.data);
        setShowFinalizeDialog(false);
      } else {
        setError(result.error || "Failed to finalize edition");
      }
    } catch (err) {
      console.error("Error finalizing edition:", err);
      setError("Failed to finalize edition");
    } finally {
      setFinalizing(false);
    }
  };

  // Revert to draft
  const handleRevertToDraft = async () => {
    if (!edition || edition.status !== "FINALIZED") return;

    try {
      const res = await fetch(`/api/editions/${editionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });

      const result = await res.json();

      if (result.success) {
        setEdition(result.data);
      } else {
        setError(result.error || "Failed to revert to draft");
      }
    } catch (err) {
      console.error("Error reverting to draft:", err);
      setError("Failed to revert to draft");
    }
  };

  // Send newsletter
  const handleSend = async () => {
    if (!edition) return;

    if (drafts.length > 0 && !selectedApprovedDraftId) {
      setSendResult({
        success: false,
        message: "No approved draft found. Approve a draft before sending.",
      });
      return;
    }

    // Validate recipients based on mode
    if (recipientMode === "all" && subscribers.length === 0) {
      setSendResult({
        success: false,
        message: "No subscribers available",
      });
      return;
    }
    if (recipientMode === "selected" && selectedSubscriberIds.length === 0) {
      setSendResult({
        success: false,
        message: "Please select at least one subscriber",
      });
      return;
    }
    if (recipientMode === "adhoc" && parsedAdHocEmails.length === 0) {
      setSendResult({
        success: false,
        message: "Please enter at least one valid email address",
      });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      // Build request body based on recipient mode
      const requestBody: Record<string, unknown> = {
        editionId,
        templateId: selectedTemplateId || undefined,
        draftId: selectedApprovedDraftId || undefined,
        // Only pass provider if different from default
        provider: selectedProvider !== defaultProvider ? selectedProvider : undefined,
      };

      // If in edit mode with Unlayer, export and include custom HTML
      if (contentMode === "edit" && editorRef.current?.isReady()) {
        const { html: exportedHtml, design } = await editorRef.current.exportHtml();

        // Convert articles and projects to content renderer format
        const contentArticles: ContentArticle[] = selectedArticles.map((a) => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          sourceUrl: a.sourceUrl || "",
          category: a.category || [],
        }));

        const contentProjects: ContentProject[] = selectedProjects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          team: p.team || "",
          impact: p.impact,
          imageUrl: p.imageUrl,
        }));

        // Replace merge tags with actual content
        const finalHtml = replaceContentMergeTags(exportedHtml, {
          articles: contentArticles,
          projects: contentProjects,
          week: edition.week,
          year: edition.year,
        });

        requestBody.customHtml = finalHtml;

        // Also save the design
        setEditorDesign(design);
      }

      // Add recipient params based on mode
      if (recipientMode === "adhoc") {
        requestBody.emails = parsedAdHocEmails;
      } else if (recipientMode === "selected") {
        requestBody.subscriberIds = selectedSubscriberIds;
      }
      // For "all" mode, don't pass subscriberIds - API will send to all

      const res = await fetch("/api/email/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const result = await res.json();

      setSendResult({
        success: result.success,
        message: result.message || (result.success ? "Newsletter sent!" : result.error),
        data: result.data,
      });

      if (result.success) {
        toast.success(`Newsletter sent to ${result.data?.sent || 0} subscribers`);
        // Reload edition to get updated status
        await loadEdition();
        await loadDrafts();
      }
    } catch (err) {
      console.error("Error sending newsletter:", err);
      setSendResult({
        success: false,
        message: "Failed to send newsletter",
      });
    } finally {
      setSending(false);
    }
  };

  // Retry SharePoint publish
  const handleRetrySharePoint = async () => {
    if (!edition) return;

    setRetryingSharePoint(true);
    try {
      const res = await fetch("/api/sharepoint/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId: edition.id }),
      });

      const result = await res.json();

      if (result.success) {
        toast.success("Published to SharePoint");
        await loadEdition();
      } else {
        toast.error(result.error || "Failed to publish to SharePoint");
      }
    } catch (err) {
      console.error("Error retrying SharePoint publish:", err);
      toast.error("Failed to publish to SharePoint");
    } finally {
      setRetryingSharePoint(false);
    }
  };

  // Check if edition is editable
  const isEditable = edition?.status === "DRAFT";
  const isFinalized = edition?.status === "FINALIZED";
  const isSent = edition?.status === "SENT";

  // Filtered subscribers for search
  const filteredSubscribers = subscribers.filter((s) => {
    const searchLower = subscriberSearch.toLowerCase();
    return (
      s.email.toLowerCase().includes(searchLower) ||
      (s.name && s.name.toLowerCase().includes(searchLower))
    );
  });

  // Parse ad-hoc emails (comma or newline separated)
  const adHocEntries = adHocEmails
    .split(/[,\n]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const parsedAdHocEmails = adHocEntries.filter((e) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  );
  const invalidAdHocEmails = adHocEntries.filter(
    (e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  );

  // Calculate recipient count based on mode
  const getRecipientCount = () => {
    switch (recipientMode) {
      case "all":
        return subscribers.length;
      case "selected":
        return selectedSubscriberIds.length;
      case "adhoc":
        return parsedAdHocEmails.length;
    }
  };
  const recipientCount = getRecipientCount();

  // Check if send is allowed
  const canSend = recipientCount > 0 &&
    (selectedProvider ? providers.find(p => p.id === selectedProvider)?.configured : true) &&
    (drafts.length === 0 || !!selectedApprovedDraftId);

  const sendBlockReason = !recipientCount
    ? "No recipients selected."
    : drafts.length > 0 && !selectedApprovedDraftId
      ? "Select an approved draft before sending."
      : selectedProvider && !providers.find(p => p.id === selectedProvider)?.configured
        ? "Selected email provider is not configured."
        : null;

  // Configured providers count
  const configuredProviders = providers.filter((p) => p.configured);
  const showProviderToggle = configuredProviders.length > 1;

  // Get selected provider info
  const selectedProviderInfo = providers.find((p) => p.id === selectedProvider);

  // Subscriber selection handlers
  const handleSelectAllSubscribers = () => {
    setSelectedSubscriberIds(subscribers.map((s) => s.id));
  };

  const handleSelectFilteredSubscribers = (limit?: number) => {
    const filteredIds = filteredSubscribers.map((s) => s.id);
    const ids = typeof limit === "number" ? filteredIds.slice(0, limit) : filteredIds;
    setSelectedSubscriberIds(ids);
  };

  const handleDeselectAllSubscribers = () => {
    setSelectedSubscriberIds([]);
  };

  const handleToggleSubscriber = (id: string) => {
    setSelectedSubscriberIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleRemoveInvalidAdHocEmails = () => {
    setAdHocEmails(parsedAdHocEmails.join("\n"));
  };

  // Loading state
  if (loading) {
    return (
      <>
        <AppHeader />
        <RadarMain width="1320px">
          <PageHeading eyebrow="Edition" title="Opening the builder" />
          <SkeletonRows rows={5} />
        </RadarMain>
      </>
    );
  }

  // Error state
  if (error && !edition) {
    return (
      <>
        <AppHeader />
        <RadarMain width="980px">
          <PageHeading eyebrow="Edition" title="That edition could not be opened" />
          <EmptyState
            title="The edition would not load"
            actions={
              <>
                <RadarButton variant="accent" onClick={loadEdition}>
                  Try again
                </RadarButton>
                <RadarButton onClick={() => router.push("/dashboard/send")}>
                  Back to editions
                </RadarButton>
              </>
            }
          >
            {error}
          </EmptyState>
        </RadarMain>
      </>
    );
  }

  if (!edition) return null;

  return (
    <>
      <AppHeader />

      <RadarMain width="1320px">
        <PageHeading
          eyebrow={`Edition · ${edition.label}`}
          title={
            isSent
              ? "Sent and locked"
              : isFinalized
                ? `Ready to send to ${recipientCount} ${recipientCount === 1 ? "reader" : "readers"}`
                : "Building the edition"
          }
          subtitle={
            <>
              Created {formatDate(edition.createdAt)}
              {edition.finalizedAt && ` · finalised ${formatDate(edition.finalizedAt)}`}
              {edition.sentAt && ` · sent ${formatDate(edition.sentAt)}`}
              {hasUnsavedChanges && " · unsaved changes"}
            </>
          }
          actions={
            <>
              <span id="preview-panel" className="sr-only" />
              {getStatusBadge(edition.status)}

              <RadarButton onClick={() => router.push("/dashboard/send")}>
                All editions
              </RadarButton>

              {isEditable && (
                <RadarButton
                  onClick={handleSaveDraft}
                  disabled={saving || (!isDirty && !isEditorDirty)}
                >
                  {saving ? "Saving…" : "Save draft"}
                </RadarButton>
              )}

              <RadarButton onClick={handlePreview} disabled={previewing}>
                {previewing ? "Rendering…" : "Preview"}
              </RadarButton>

              {isEditable && (
                <RadarButton
                  variant="accent"
                  onClick={() => setShowFinalizeDialog(true)}
                  disabled={finalizing}
                >
                  Finalise
                </RadarButton>
              )}

              {isFinalized && (
                <RadarButton onClick={handleRevertToDraft}>
                  Back to draft
                </RadarButton>
              )}

              {isFinalized && (
                <RadarButton
                  variant="accent"
                  onClick={() => setShowSendDialog(true)}
                  disabled={sending || !canSend}
                  title={!canSend ? sendBlockReason || undefined : undefined}
                >
                  Send to {recipientCount}{" "}
                  {recipientCount === 1 ? "reader" : "readers"}
                </RadarButton>
              )}
            </>
          }
        />

        {/* Load failure that still left an edition on screen */}
        {error && (
          <Callout tone="err" title="Something went wrong" className="mb-5">
            {error}
          </Callout>
        )}

        {isFinalized && !canSend && sendBlockReason && (
          <Callout tone="warn" title="Not ready to send yet" className="mb-5">
            {sendBlockReason}
          </Callout>
        )}

        {/* Send Readiness */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Send Readiness</CardTitle>
            <CardDescription>
              Quick checklist before sending this edition
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                <div>
                  <p className="text-sm font-medium">Approved Draft</p>
                  <p className="text-xs text-radar-ink2">
                    {drafts.length === 0
                      ? "No drafts required"
                      : selectedApprovedDraftId
                        ? `Draft ${selectedApprovedDraftId.slice(0, 6)} selected`
                        : "Select an approved draft"}
                  </p>
                </div>
                {drafts.length === 0 || selectedApprovedDraftId ? (
                  <Badge variant="success">Ready</Badge>
                ) : (
                  <Badge variant="warning">Blocked</Badge>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href="#drafts-panel">Open</a>
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                <div>
                  <p className="text-sm font-medium">Template</p>
                  <p className="text-xs text-radar-ink2">
                    {selectedTemplateId ? "Custom template selected" : "Default template"}
                  </p>
                </div>
                <Badge variant="success">Ready</Badge>
                <Button variant="ghost" size="sm" asChild>
                  <a href="#template-panel">Open</a>
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                <div>
                  <p className="text-sm font-medium">Recipients</p>
                  <p className="text-xs text-radar-ink2">
                    {recipientCount > 0
                      ? `${recipientCount} ${recipientMode === "adhoc" ? "email" : "subscriber"}${recipientCount !== 1 ? "s" : ""}`
                      : "No recipients selected"}
                  </p>
                </div>
                {recipientCount > 0 ? (
                  <Badge variant="success">Ready</Badge>
                ) : (
                  <Badge variant="warning">Blocked</Badge>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href="#recipients-panel">Open</a>
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                <div>
                  <p className="text-sm font-medium">Preview</p>
                  <p className="text-xs text-radar-ink2">
                    {lastPreviewedAt
                      ? `Last previewed ${formatDate(lastPreviewedAt)}`
                      : "Run a preview before sending"}
                  </p>
                </div>
                {lastPreviewedAt ? (
                  <Badge variant="success">Ready</Badge>
                ) : (
                  <Badge variant="secondary">Optional</Badge>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href="#preview-panel">Open</a>
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 gap-3">
                <div>
                  <p className="text-sm font-medium">Unsaved Changes</p>
                  <p className="text-xs text-radar-ink2">
                    {hasUnsavedChanges ? "Save before final send" : "All changes saved"}
                  </p>
                </div>
                {hasUnsavedChanges ? (
                  <Badge variant="warning">Attention</Badge>
                ) : (
                  <Badge variant="success">Ready</Badge>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href="#preview-panel">Review</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sent Edition Read-Only Banner */}
        {isSent && (
          <div className="mb-6 p-4 rounded-lg bg-radar-surface border border-radar-ok">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-radar-ok" />
              <div>
                <p className="font-medium text-radar-ink">
                  This edition has been sent
                </p>
                <p className="text-sm text-radar-ink2">
                  Sent on {formatDate(edition.sentAt)}. The content below is read-only.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Post-Send Summary */}
        {(sendResult?.success || isSent) && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Send Summary</CardTitle>
              <CardDescription>Quick recap and links for this edition</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Recipients</p>
                  <p className="text-sm text-radar-ink2">
                    {sendResult?.data ? (
                      <>
                        {sendResult.data.sent} sent
                        {sendResult.data.failed > 0 && ` • ${sendResult.data.failed} failed`}
                      </>
                    ) : (
                      `${recipientCount} ${recipientMode === "adhoc" ? "ad-hoc" : "subscriber"}${recipientCount !== 1 ? "s" : ""}`
                    )}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Draft</p>
                  <p className="text-sm text-radar-ink2">
                    {selectedApprovedDraftId ? `Draft ${selectedApprovedDraftId.slice(0, 6)}` : "No draft selected"}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">SharePoint</p>
                  <p className="text-sm text-radar-ink2">
                    {edition.sharePointUrl ? "Published" : edition.sharePointError ? "Error" : "Not published"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {edition.sharePointUrl && (
                  <Button variant="outline" size="sm" onClick={() => window.open(edition.sharePointUrl || "", "_blank")}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View SharePoint
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handlePreview}>
                  <Eye className="w-4 h-4 mr-2" />
                  Open Preview
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SharePoint Archive Status - for sent editions */}
        {isSent && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    edition.sharePointUrl
                      ? "bg-radar-surface2"
                      : edition.sharePointError
                      ? "bg-radar-surface2"
                      : "bg-radar-surface2"
                  }`}>
                    <Globe className={`w-5 h-5 ${
                      edition.sharePointUrl
                        ? "text-radar-primary2"
                        : edition.sharePointError
                        ? "text-radar-err"
                        : "text-radar-ink2"
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium">SharePoint Archive</p>
                    {edition.sharePointUrl ? (
                      <p className="text-sm text-radar-ink2">
                        Published {formatDate(edition.sharePointPublishedAt)}
                      </p>
                    ) : edition.sharePointError ? (
                      <p className="text-sm text-radar-err">
                        Failed: {edition.sharePointError}
                      </p>
                    ) : (
                      <p className="text-sm text-radar-ink2">
                        Not published to SharePoint
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {edition.sharePointUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(edition.sharePointUrl!, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on SharePoint
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetrySharePoint}
                      disabled={retryingSharePoint}
                    >
                      {retryingSharePoint ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Publishing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          {edition.sharePointError ? "Retry Publish" : "Publish Now"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-radar-surface2 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-radar-primary2" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedArticleIds.length}</div>
                  <div className="text-sm text-radar-ink2">
                    Article{selectedArticleIds.length !== 1 ? "s" : ""} Selected
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-radar-surface2 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-radar-primary2" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedProjectIds.length}</div>
                  <div className="text-sm text-radar-ink2">
                    Project{selectedProjectIds.length !== 1 ? "s" : ""} Selected
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-radar-surface2 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-radar-ink2" />
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {edition.label}
                  </div>
                  <div className="text-sm text-radar-ink2">Edition Period</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-radar-surface2 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-radar-ink2" />
                </div>
                <div>
                  <div className="text-sm font-medium">Activity</div>
                  <div className="text-xs text-radar-ink2">
                    Updated {formatDate(edition.updatedAt)}
                  </div>
                  {edition.finalizedAt && (
                    <div className="text-xs text-radar-ink2">
                      Finalized {formatDate(edition.finalizedAt)}
                    </div>
                  )}
                  {edition.sentAt && (
                    <div className="text-xs text-radar-ink2">
                      Sent {formatDate(edition.sentAt)}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Draft Status */}
        <Card id="drafts-panel" className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Generation Drafts</p>
                {isLoadingDrafts ? (
                  <p className="text-sm text-radar-ink2">Loading drafts...</p>
                ) : drafts.length === 0 ? (
                  <p className="text-sm text-radar-ink2">
                    No drafts found for this edition.
                  </p>
                ) : (
                  <>
                    {drafts.filter((draft) => draft.status === "APPROVED").length > 0 ? (
                      <p className="text-sm text-radar-ink2">
                        {drafts.filter((draft) => draft.status === "APPROVED").length > 1 && !selectedApprovedDraftId
                          ? "Multiple approved drafts available. Select one to send."
                          : "Select an approved draft to send."}
                      </p>
                    ) : (
                      <p className="text-sm text-radar-err">
                        Drafts exist but none are approved. Approve one before sending.
                      </p>
                    )}
                  </>
                )}
              </div>
              {selectedApprovedDraftId && (
                <Badge variant="success">Approved</Badge>
              )}
              {!selectedApprovedDraftId && drafts.length > 0 && (
                <Badge variant="warning">Approval Required</Badge>
              )}
            </div>
            {drafts.filter((draft) => draft.status === "APPROVED").length > 1 && (
              <div className="mt-4">
                <Label className="text-sm">Approved Draft</Label>
                <Select
                  value={selectedApprovedDraftId || ""}
                  onValueChange={(value) => setSelectedApprovedDraftId(value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select approved draft" />
                  </SelectTrigger>
                  <SelectContent>
                    {drafts
                      .filter((draft) => draft.status === "APPROVED")
                      .map((draft) => (
                        <SelectItem key={draft.id} value={draft.id}>
                          Draft {draft.id.slice(0, 6)} •{" "}
                          {draft.approvedAt
                            ? `Approved ${formatDate(draft.approvedAt)}`
                            : `Generated ${formatDate(draft.generatedAt || null)}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedApprovedDraftId && (
              <div className="mt-4 rounded-md border border-dashed border-muted-foreground/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Subject Lines</p>
                  {isLoadingApprovedDraft && (
                    <Loader2 className="h-4 w-4 animate-spin text-radar-ink2" />
                  )}
                </div>
                {approvedDraftSubjectLines.length === 0 ? (
                  <p className="text-sm text-radar-ink2 mt-2">
                    No subject lines available for this draft.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-radar-ink2">
                    {approvedDraftSubjectLines.slice(0, 3).map((line, index) => (
                      <li key={`${index}-${line}`} className="truncate">
                        {index + 1}. {line}
                      </li>
                    ))}
                    {approvedDraftSubjectLines.length > 3 && (
                      <li className="text-xs text-radar-ink2">
                        + {approvedDraftSubjectLines.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
                {(approvedDraftHeroTitle || approvedDraftHeroSummary) && (
                  <div className="mt-3 border-t border-dashed border-muted-foreground/30 pt-3">
                    <p className="text-sm font-medium">Hero Preview</p>
                    <p className="mt-1 text-sm text-radar-ink2 truncate">
                      {approvedDraftHeroTitle || "Untitled hero"}
                    </p>
                    {approvedDraftHeroSummary && (
                      <p className="mt-1 text-xs text-radar-ink2 line-clamp-2">
                        {approvedDraftHeroSummary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Template Selection */}
        <Card id="template-panel" className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-radar-ink2" />
              <CardTitle className="text-base font-medium">Email Template</CardTitle>
            </div>
            <CardDescription>
              Select a template to use for this newsletter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <Select
                  value={selectedTemplateId || "default"}
                  onValueChange={(value) => handleTemplateChange(value === "default" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                        {template.builtIn && " (built in)"}
                        {template.isDefault && " · preselected"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTemplateId && selectedTemplateId !== "default" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/dashboard/templates/${selectedTemplateId}`, '_blank')}
                >
                  Edit Template
                </Button>
              )}
            </div>
            {templates.length === 0 && (
              <p className="text-sm text-radar-ink2 mt-2">
                No custom templates available.{" "}
                <a href="/dashboard/templates" className="text-radar-accent hover:underline">
                  Create one
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Email Provider Selection - only show when finalized and multiple providers configured */}
        {isFinalized && showProviderToggle && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-radar-ink2" />
                <CardTitle className="text-base font-medium">Email Provider</CardTitle>
              </div>
              <CardDescription>
                Select which email service to use for sending
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selectedProvider || defaultProvider}
                onValueChange={(value: string) => setSelectedProvider(value as "resend" | "graph")}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {providers.map((provider) => (
                  <div key={provider.id} className="relative">
                    <div
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors ${
                        selectedProvider === provider.id
                          ? "border-radar-accent bg-radar-surface2"
                          : "border-muted hover:border-muted-foreground/50"
                      } ${!provider.configured ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      onClick={() => provider.configured && setSelectedProvider(provider.id)}
                    >
                      <RadioGroupItem
                        value={provider.id}
                        id={`provider-${provider.id}`}
                        disabled={!provider.configured}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor={`provider-${provider.id}`}
                          className={`font-medium ${!provider.configured ? "cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {provider.name}
                          {provider.id === defaultProvider && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Default
                            </Badge>
                          )}
                        </Label>
                        <p className="text-sm text-radar-ink2 mt-1">
                          {provider.configured ? (
                            <>From: {provider.fromEmail}</>
                          ) : (
                            <span className="text-radar-warn">Not configured</span>
                          )}
                        </p>
                        {provider.configured && (
                          <Badge variant="outline" className="mt-2 text-xs text-radar-ok border-green-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Ready
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {/* Provider info when only one configured */}
        {isFinalized && !showProviderToggle && configuredProviders.length === 1 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-radar-ink2" />
                <CardTitle className="text-base font-medium">Email Provider</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-radar-surface2">
                <CheckCircle className="w-5 h-5 text-radar-ok" />
                <div>
                  <p className="font-medium">{configuredProviders[0].name}</p>
                  <p className="text-sm text-radar-ink2">
                    From: {configuredProviders[0].fromEmail}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recipients Selection - only show when finalized */}
        {isFinalized && (
          <Card id="recipients-panel" className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-radar-ink2" />
                <div>
                  <CardTitle className="text-base font-medium">Recipients</CardTitle>
                  <CardDescription>
                    {recipientCount} {recipientMode === "adhoc" ? "email" : "subscriber"}{recipientCount !== 1 ? "s" : ""} selected
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
                  {/* Recipient mode selector */}
                  <RadioGroup
                    value={recipientMode}
                    onValueChange={(value: string) => setRecipientMode(value as "all" | "selected" | "adhoc")}
                    className="mb-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="adhoc" id="mode-adhoc" />
                      <Label htmlFor="mode-adhoc" className="cursor-pointer">
                        Ad-hoc emails (enter manually)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="all"
                        id="mode-all"
                        disabled={subscribers.length === 0}
                      />
                      <Label
                        htmlFor="mode-all"
                        className={`cursor-pointer ${subscribers.length === 0 ? "text-radar-ink2" : ""}`}
                      >
                        All subscribers ({subscribers.length})
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value="selected"
                        id="mode-selected"
                        disabled={subscribers.length === 0}
                      />
                      <Label
                        htmlFor="mode-selected"
                        className={`cursor-pointer ${subscribers.length === 0 ? "text-radar-ink2" : ""}`}
                      >
                        Select specific subscribers
                      </Label>
                    </div>
                  </RadioGroup>

                  {/* Ad-hoc email input */}
                  {recipientMode === "adhoc" && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Enter email addresses (one per line or comma-separated)&#10;example@company.com&#10;another@company.com"
                        value={adHocEmails}
                        onChange={(e) => setAdHocEmails(e.target.value)}
                        rows={5}
                        className="font-mono text-sm"
                      />
                      <p className="text-sm text-radar-ink2">
                        {parsedAdHocEmails.length > 0 ? (
                          <>
                            <span className="text-radar-ok font-medium">{parsedAdHocEmails.length}</span> valid email{parsedAdHocEmails.length !== 1 ? "s" : ""} detected
                          </>
                        ) : (
                          <span className="text-radar-warn">Enter at least one valid email address</span>
                        )}
                        {invalidAdHocEmails.length > 0 && (
                          <>
                            {" "}
                            •{" "}
                            <span className="text-radar-err font-medium">
                              {invalidAdHocEmails.length}
                            </span>{" "}
                            invalid
                          </>
                        )}
                      </p>
                      {invalidAdHocEmails.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2 text-xs text-radar-ink2">
                          <div className="flex flex-wrap gap-1">
                            {invalidAdHocEmails.slice(0, 3).map((email) => (
                              <Badge key={email} variant="destructive" className="text-xs">
                                {email}
                              </Badge>
                            ))}
                            {invalidAdHocEmails.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{invalidAdHocEmails.length - 3} more
                              </Badge>
                            )}
                          </div>
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRemoveInvalidAdHocEmails}
                            >
                              Remove invalid emails
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subscriber selection (for "selected" mode) */}
                  {recipientMode === "selected" && (
                    <>
                      {/* Search and actions */}
                      <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-radar-ink2" />
                          <Input
                            placeholder="Search subscribers..."
                            value={subscriberSearch}
                            onChange={(e) => setSubscriberSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAllSubscribers}
                            disabled={selectedSubscriberIds.length === subscribers.length}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectFilteredSubscribers()}
                            disabled={filteredSubscribers.length === 0}
                          >
                            Select Filtered
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectFilteredSubscribers(50)}
                            disabled={filteredSubscribers.length === 0}
                          >
                            Top 50
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectFilteredSubscribers(100)}
                            disabled={filteredSubscribers.length === 0}
                          >
                            Top 100
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeselectAllSubscribers}
                            disabled={selectedSubscriberIds.length === 0}
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>

                      {/* Subscriber list */}
                      <div className="border rounded-lg max-h-64 overflow-y-auto">
                        {filteredSubscribers.length === 0 ? (
                          <div className="p-4 text-center text-radar-ink2">
                            {subscriberSearch ? "No subscribers match your search" : "No active subscribers"}
                          </div>
                        ) : (
                          <div className="divide-y">
                            {filteredSubscribers.map((subscriber) => (
                              <div
                                key={subscriber.id}
                                className="flex items-center gap-3 p-3 hover:bg-radar-surface2 cursor-pointer"
                                onClick={() => handleToggleSubscriber(subscriber.id)}
                              >
                                <Checkbox
                                  checked={selectedSubscriberIds.includes(subscriber.id)}
                                  onCheckedChange={() => handleToggleSubscriber(subscriber.id)}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {subscriber.name || subscriber.email}
                                  </p>
                                  {subscriber.name && (
                                    <p className="text-xs text-radar-ink2 truncate">
                                      {subscriber.email}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Selection summary */}
                      <div className="mt-3 text-sm text-radar-ink2">
                        {selectedSubscriberIds.length === 0 ? (
                          <span className="text-radar-warn font-medium">
                            No subscribers selected
                          </span>
                        ) : (
                          <span>
                            <strong>{selectedSubscriberIds.length}</strong> subscriber{selectedSubscriberIds.length !== 1 ? "s" : ""} selected
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {/* All subscribers info */}
                  {recipientMode === "all" && subscribers.length > 0 && (
                    <div className="p-3 rounded-lg bg-radar-surface2 text-sm">
                      Newsletter will be sent to all <strong>{subscribers.length}</strong> active subscriber{subscribers.length !== 1 ? "s" : ""}.
                    </div>
                  )}
            </CardContent>
          </Card>
        )}

        {/* Content Mode Toggle - for draft and finalized editions */}
        {(isEditable || isFinalized) && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Content Mode</h3>
                  <p className="text-sm text-radar-ink2">
                    {contentMode === "select"
                      ? "Select which articles and projects to include"
                      : "Edit article summaries, project descriptions, and add custom content"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={contentMode === "select" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setContentMode("select")}
                  >
                    <List className="w-4 h-4 mr-2" />
                    Select Content
                  </Button>
                  <Button
                    variant={contentMode === "edit" ? "default" : "outline"}
                    size="sm"
                    onClick={contentMode === "edit" ? undefined : handleEnterEditMode}
                    disabled={!selectedTemplateId && !editorDesign}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Layout
                    {isEditorDirty && contentMode === "edit" && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Edited
                      </Badge>
                    )}
                  </Button>
                </div>
              </div>
              {contentMode === "edit" && isEditorDirty && (
                <p className="text-xs text-radar-warn mt-2">
                  Layout has been edited. Changes will be included when you preview or send.
                </p>
              )}
              {!selectedTemplateId && !editorDesign && (
                <p className="text-xs text-radar-ink2 mt-2">
                  Select a template above to enable layout editing.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Content Tabs - for Select mode */}
        {contentMode === "select" && (
          <Tabs defaultValue="articles" className="space-y-4">
            <TabsList>
              <TabsTrigger value="articles" className="gap-2">
                <FileText className="w-4 h-4" />
                Articles ({selectedArticleIds.length})
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-2">
                <Briefcase className="w-4 h-4" />
                Projects ({selectedProjectIds.length})
              </TabsTrigger>
            </TabsList>

          <TabsContent value="articles">
            {isSent ? (
              // Read-only view for sent editions
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Selected Articles
                  </CardTitle>
                  <CardDescription>
                    These articles were included in the sent newsletter
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedArticles.length === 0 ? (
                    <p className="text-sm text-radar-ink2">No articles were included.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedArticles.map((article, index) => (
                        <div
                          key={article.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-radar-surface"
                        >
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-radar-surface2 text-radar-accent text-xs font-medium shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium leading-tight">
                              {article.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-radar-ink2">
                              {article.relevanceScore && (
                                <Badge variant="secondary" className="text-xs">
                                  Score: {article.relevanceScore.toFixed(1)}
                                </Badge>
                              )}
                              {article.category.slice(0, 2).map((cat) => (
                                <Badge key={cat} variant="outline" className="text-xs">
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              // Editable view for draft/finalized editions
              <EditionArticlePicker
                selectedIds={selectedArticleIds}
                onSelectionChange={handleArticleSelectionChange}
                initialArticles={selectedArticles}
              />
            )}
          </TabsContent>

          <TabsContent value="projects">
            {isSent ? (
              // Read-only view for sent editions
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Selected Projects
                  </CardTitle>
                  <CardDescription>
                    These projects were showcased in the sent newsletter
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedProjects.length === 0 ? (
                    <p className="text-sm text-radar-ink2">No projects were included.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedProjects.map((project, index) => (
                        <div
                          key={project.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-radar-surface"
                        >
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-radar-surface2 text-radar-accent text-xs font-medium shrink-0">
                            {index + 1}
                          </div>
                          {project.imageUrl && (
                            <div className="w-10 h-10 rounded-md overflow-hidden bg-radar-surface2 shrink-0">
                              <img
                                src={project.imageUrl}
                                alt={project.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium leading-tight">
                              {project.name}
                            </h4>
                            <p className="text-xs text-radar-ink2 line-clamp-1 mt-0.5">
                              {project.description}
                            </p>
                            <div className="text-xs text-radar-ink2 mt-1">
                              {project.team}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              // Editable view for draft/finalized editions
              <EditionProjectPicker
                selectedIds={selectedProjectIds}
                onSelectionChange={handleProjectSelectionChange}
                initialProjects={selectedProjects}
              />
            )}
          </TabsContent>
          </Tabs>
        )}

        {/* Unlayer Editor - for Edit mode */}
        {contentMode === "edit" && edition && (
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Pencil className="w-4 h-4" />
                    Edit Email Layout
                  </CardTitle>
                  <CardDescription>
                    Drag and drop elements, edit text, and customize your newsletter design
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExitEditMode}>
                  <List className="w-4 h-4 mr-2" />
                  Back to Selection
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[700px]">
                <EditionUnlayerEditor
                  ref={editorRef}
                  design={editorDesign}
                  articles={selectedArticles.map((a) => ({
                    id: a.id,
                    title: a.title,
                    summary: a.summary,
                    sourceUrl: a.sourceUrl || "",
                    category: a.category || [],
                  }))}
                  projects={selectedProjects.map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description || "",
                    team: p.team || "",
                    impact: p.impact,
                    imageUrl: p.imageUrl,
                  }))}
                  week={edition.week}
                  year={edition.year}
                  onReady={handleEditorReady}
                  onDesignChange={handleEditorDesignChange}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </RadarMain>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview of how the newsletter will appear to subscribers
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-radar-surface2/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {selectedApprovedDraftId && (
                <Badge variant="secondary">Draft {selectedApprovedDraftId.slice(0, 6)}</Badge>
              )}
              {lastPreviewedAt && (
                <span className="text-xs text-radar-ink2">
                  Last previewed {formatDate(lastPreviewedAt)}
                </span>
              )}
              {!selectedApprovedDraftId && drafts.length > 0 && (
                <Badge variant="warning">No approved draft selected</Badge>
              )}
            </div>
            {approvedDraftSubjectLines.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-radar-ink2">Subject lines</p>
                <ul className="mt-1 space-y-1 text-xs text-radar-ink2">
                  {approvedDraftSubjectLines.slice(0, 3).map((line, index) => (
                    <li key={`${index}-${line}`} className="truncate">
                      {index + 1}. {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto border rounded-lg bg-white">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[600px] border-0"
                title="Email Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-[400px] text-radar-ink2">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading preview...
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Confirmation Dialog */}
      <AlertDialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize Edition?</AlertDialogTitle>
            <AlertDialogDescription>
              Finalizing this edition will mark it as ready to send. You can still edit
              the content after finalizing, but you will need to revert to draft first.
              <br />
              <br />
              <strong>Current content:</strong>
              <br />
              - {selectedArticleIds.length} article{selectedArticleIds.length !== 1 ? "s" : ""}
              <br />
              - {selectedProjectIds.length} project{selectedProjectIds.length !== 1 ? "s" : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalize} disabled={finalizing}>
              {finalizing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Finalizing...
                </>
              ) : (
                "Finalize Edition"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sendResult ? (sendResult.success ? "Newsletter Sent!" : "Send Failed") : "Send Newsletter?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {sendResult ? (
                <div className="space-y-2">
                  <p>{sendResult.message}</p>
                  {sendResult.data && (
                    <div className="mt-3 p-3 rounded-lg bg-radar-surface2">
                      <p className="text-sm">
                        <strong>Sent:</strong> {sendResult.data.sent} subscribers
                      </p>
                      {sendResult.data.failed > 0 && (
                        <p className="text-sm text-radar-err">
                          <strong>Failed:</strong> {sendResult.data.failed} subscribers
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  This will send the newsletter to{" "}
                  <strong>{recipientCount}</strong>{" "}
                  {recipientMode === "adhoc" ? "email address" : "subscriber"}
                  {recipientCount !== 1 ? "es" : ""}. This action cannot be undone.
                  <br />
                  <br />
                  {selectedApprovedDraftId && (
                    <>
                      <strong>Draft:</strong> {selectedApprovedDraftId.slice(0, 6)}
                      <br />
                    </>
                  )}
                  {approvedDraftSubjectLines.length > 0 && (
                    <>
                      <strong>Subject lines:</strong> {approvedDraftSubjectLines.slice(0, 2).join(" • ")}
                      {approvedDraftSubjectLines.length > 2 && " • ..."}
                      <br />
                    </>
                  )}
                  <strong>Edition:</strong> {edition.label}
                  <br />
                  <strong>Content:</strong> {selectedArticleIds.length} article
                  {selectedArticleIds.length !== 1 ? "s" : ""}, {selectedProjectIds.length}{" "}
                  project{selectedProjectIds.length !== 1 ? "s" : ""}
                  <br />
                  <strong>Recipients:</strong>{" "}
                  {recipientMode === "adhoc" ? (
                    <>{recipientCount} ad-hoc email{recipientCount !== 1 ? "s" : ""}</>
                  ) : recipientMode === "all" ? (
                    <>All {subscribers.length} subscribers</>
                  ) : (
                    <>{selectedSubscriberIds.length} of {subscribers.length} subscribers</>
                  )}
                  {selectedProviderInfo && (
                    <>
                      <br />
                      <strong>Provider:</strong> {selectedProviderInfo.name}
                      {selectedProviderInfo.fromEmail && (
                        <span className="text-radar-ink2"> ({selectedProviderInfo.fromEmail})</span>
                      )}
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {sendResult ? (
              <AlertDialogAction onClick={() => setShowSendDialog(false)}>
                Close
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleSend}
                  disabled={sending || !canSend}
                  className="bg-radar-ok hover:brightness-110"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send to {recipientCount}
                    </>
                  )}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

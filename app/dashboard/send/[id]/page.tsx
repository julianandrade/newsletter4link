"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { EditionArticlePicker, Article } from "@/components/edition-article-picker";
import { EditionProjectPicker, Project } from "@/components/edition-project-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Types
interface Template {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
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
  status: "DRAFT" | "FINALIZED" | "SENT";
  finalizedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  articles: Array<Article & { order: number }>;
  projects: Array<Project & { order: number }>;
  articleCount: number;
  projectCount: number;
}

// Status badge component
function getStatusBadge(status: EditionDetail["status"]) {
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

// Format date helper
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
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);

  // Provider state
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<"resend" | "graph" | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<"resend" | "graph">("resend");

  // Selection state
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Article[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Project[]>([]);

  // Dirty state tracking
  const [isDirty, setIsDirty] = useState(false);

  // Action states
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sending, setSending] = useState(false);

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

  useEffect(() => {
    loadEdition();
  }, [loadEdition]);

  // Load templates
  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Filter to only show templates with designJson (editable in Unlayer)
          setTemplates(data);
          // Set default template if one exists
          const defaultTemplate = data.find((t: Template) => t.isDefault);
          if (defaultTemplate) {
            setSelectedTemplateId(defaultTemplate.id);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Load subscribers
  useEffect(() => {
    fetch("/api/subscribers")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subscribers)) {
          const activeSubscribers = data.subscribers.filter((s: Subscriber) => s.active);
          setSubscribers(activeSubscribers);
          // Select all by default
          setSelectedSubscriberIds(activeSubscribers.map((s: Subscriber) => s.id));
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

  // Save draft
  const handleSaveDraft = async () => {
    if (!edition) return;

    setSaving(true);
    try {
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
        }),
      });

      const result = await res.json();

      if (result.success) {
        setEdition(result.data);
        setIsDirty(false);
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
      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId,
          templateId: selectedTemplateId || undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setPreviewHtml(result.html);
        setShowPreviewDialog(true);
      } else {
        setError(result.error || "Failed to generate preview");
      }
    } catch (err) {
      console.error("Error generating preview:", err);
      setError("Failed to generate preview");
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

    // Validate recipients
    if (selectedSubscriberIds.length === 0) {
      setSendResult({
        success: false,
        message: "Please select at least one recipient",
      });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch("/api/email/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId,
          templateId: selectedTemplateId || undefined,
          // Only pass subscriberIds if not all are selected
          subscriberIds: selectedSubscriberIds.length < subscribers.length
            ? selectedSubscriberIds
            : undefined,
          // Only pass provider if different from default
          provider: selectedProvider !== defaultProvider ? selectedProvider : undefined,
        }),
      });

      const result = await res.json();

      setSendResult({
        success: result.success,
        message: result.message || (result.success ? "Newsletter sent!" : result.error),
        data: result.data,
      });

      if (result.success) {
        // Reload edition to get updated status
        await loadEdition();
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

  // Check if send is allowed
  const canSend = selectedSubscriberIds.length > 0 &&
    (selectedProvider ? providers.find(p => p.id === selectedProvider)?.configured : true);

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

  // Configured providers count
  const configuredProviders = providers.filter((p) => p.configured);
  const showProviderToggle = configuredProviders.length > 1;

  // Get selected provider info
  const selectedProviderInfo = providers.find((p) => p.id === selectedProvider);

  // Subscriber selection handlers
  const handleSelectAllSubscribers = () => {
    setSelectedSubscriberIds(subscribers.map((s) => s.id));
  };

  const handleDeselectAllSubscribers = () => {
    setSelectedSubscriberIds([]);
  };

  const handleToggleSubscriber = (id: string) => {
    setSelectedSubscriberIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Edition Details" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Loading edition...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !edition) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Edition Details" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Error Loading Edition</h2>
              <p className="text-muted-foreground mb-6">{error}</p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => router.push("/dashboard/send")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Editions
                </Button>
                <Button onClick={loadEdition}>Try Again</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!edition) return null;

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={`Week ${edition.week}, ${edition.year}`} />

      <div className="flex-1 p-6 overflow-auto">
        {/* Error Toast */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/send")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">
                  Week {edition.week}, {edition.year}
                </h1>
                {getStatusBadge(edition.status)}
                {isDirty && isEditable && (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                    Unsaved changes
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Created {formatDate(edition.createdAt)}
                {edition.finalizedAt && ` | Finalized ${formatDate(edition.finalizedAt)}`}
                {edition.sentAt && ` | Sent ${formatDate(edition.sentAt)}`}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Save Draft - only for DRAFT status */}
            {isEditable && (
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saving || !isDirty}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </>
                )}
              </Button>
            )}

            {/* Preview - available for all statuses */}
            <Button variant="outline" onClick={handlePreview} disabled={previewing}>
              {previewing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </>
              )}
            </Button>

            {/* Finalize - only for DRAFT status */}
            {isEditable && (
              <Button onClick={() => setShowFinalizeDialog(true)} disabled={finalizing}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Finalize
              </Button>
            )}

            {/* Revert to Draft - only for FINALIZED status */}
            {isFinalized && (
              <Button variant="outline" onClick={handleRevertToDraft}>
                <Clock className="w-4 h-4 mr-2" />
                Revert to Draft
              </Button>
            )}

            {/* Send - only for FINALIZED status */}
            {isFinalized && (
              <Button
                onClick={() => setShowSendDialog(true)}
                disabled={sending || !canSend}
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="w-4 h-4 mr-2" />
                Send to {selectedSubscriberIds.length} Subscriber{selectedSubscriberIds.length !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>

        {/* Sent Edition Read-Only Banner */}
        {isSent && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">
                  This edition has been sent
                </p>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Sent on {formatDate(edition.sentAt)}. The content below is read-only.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedArticleIds.length}</div>
                  <div className="text-sm text-muted-foreground">
                    Article{selectedArticleIds.length !== 1 ? "s" : ""} Selected
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{selectedProjectIds.length}</div>
                  <div className="text-sm text-muted-foreground">
                    Project{selectedProjectIds.length !== 1 ? "s" : ""} Selected
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <div className="text-lg font-bold">
                    Week {edition.week}, {edition.year}
                  </div>
                  <div className="text-sm text-muted-foreground">Edition Period</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Template Selection */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-muted-foreground" />
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
                  onValueChange={(value) => setSelectedTemplateId(value === "default" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Template</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                        {template.isDefault && " (Default)"}
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
              <p className="text-sm text-muted-foreground mt-2">
                No custom templates available.{" "}
                <a href="/dashboard/templates" className="text-primary hover:underline">
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
                <Mail className="w-5 h-5 text-muted-foreground" />
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
                          ? "border-primary bg-primary/5"
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
                        <p className="text-sm text-muted-foreground mt-1">
                          {provider.configured ? (
                            <>From: {provider.fromEmail}</>
                          ) : (
                            <span className="text-yellow-600">Not configured</span>
                          )}
                        </p>
                        {provider.configured && (
                          <Badge variant="outline" className="mt-2 text-xs text-green-600 border-green-300">
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
                <Mail className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Email Provider</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium">{configuredProviders[0].name}</p>
                  <p className="text-sm text-muted-foreground">
                    From: {configuredProviders[0].fromEmail}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recipients Selection - only show when finalized */}
        {isFinalized && (
          <Card className="mb-6">
            <Collapsible open={recipientsExpanded} onOpenChange={setRecipientsExpanded}>
              <CardHeader className="pb-3">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base font-medium">Recipients</CardTitle>
                        <CardDescription>
                          {selectedSubscriberIds.length} of {subscribers.length} subscribers selected
                        </CardDescription>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      {recipientsExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {/* Search and actions */}
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
                      <div className="p-4 text-center text-muted-foreground">
                        {subscriberSearch ? "No subscribers match your search" : "No active subscribers"}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredSubscribers.map((subscriber) => (
                          <div
                            key={subscriber.id}
                            className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
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
                                <p className="text-xs text-muted-foreground truncate">
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
                  <div className="mt-3 text-sm text-muted-foreground">
                    {selectedSubscriberIds.length === 0 ? (
                      <span className="text-yellow-600 font-medium">
                        No recipients selected - select at least one to send
                      </span>
                    ) : (
                      <span>
                        Sending to <strong>{selectedSubscriberIds.length}</strong> subscriber
                        {selectedSubscriberIds.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}

        {/* Content Tabs */}
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
                    <p className="text-sm text-muted-foreground">No articles were included.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedArticles.map((article, index) => (
                        <div
                          key={article.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium leading-tight">
                              {article.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
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
                    <p className="text-sm text-muted-foreground">No projects were included.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedProjects.map((project, index) => (
                        <div
                          key={project.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                            {index + 1}
                          </div>
                          {project.imageUrl && (
                            <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
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
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {project.description}
                            </p>
                            <div className="text-xs text-muted-foreground mt-1">
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
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview of how the newsletter will appear to subscribers
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-lg bg-white">
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[600px] border-0"
                title="Email Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
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
                    <div className="mt-3 p-3 rounded-lg bg-muted">
                      <p className="text-sm">
                        <strong>Sent:</strong> {sendResult.data.sent} subscribers
                      </p>
                      {sendResult.data.failed > 0 && (
                        <p className="text-sm text-red-600">
                          <strong>Failed:</strong> {sendResult.data.failed} subscribers
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  This will send the newsletter to{" "}
                  <strong>
                    {selectedSubscriberIds.length === subscribers.length
                      ? "all active"
                      : selectedSubscriberIds.length}
                  </strong>{" "}
                  subscriber{selectedSubscriberIds.length !== 1 ? "s" : ""}. This action cannot
                  be undone.
                  <br />
                  <br />
                  <strong>Edition:</strong> Week {edition.week}, {edition.year}
                  <br />
                  <strong>Content:</strong> {selectedArticleIds.length} article
                  {selectedArticleIds.length !== 1 ? "s" : ""}, {selectedProjectIds.length}{" "}
                  project{selectedProjectIds.length !== 1 ? "s" : ""}
                  <br />
                  <strong>Recipients:</strong> {selectedSubscriberIds.length} of {subscribers.length} subscribers
                  {selectedProviderInfo && (
                    <>
                      <br />
                      <strong>Provider:</strong> {selectedProviderInfo.name}
                      {selectedProviderInfo.fromEmail && (
                        <span className="text-muted-foreground"> ({selectedProviderInfo.fromEmail})</span>
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
                  className="bg-green-600 hover:bg-green-700"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send to {selectedSubscriberIds.length}
                    </>
                  )}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

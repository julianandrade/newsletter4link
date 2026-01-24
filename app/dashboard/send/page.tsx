"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Send,
  Mail,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  Briefcase,
  Users,
  Monitor,
  Smartphone,
  Palette,
  Star,
  Check,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NewsletterData {
  articles: Array<{
    title: string;
    summary: string;
    sourceUrl: string;
    category: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    team: string;
    impact?: string;
  }>;
  week: number;
  year: number;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
}

export default function SendPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NewsletterData | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [settingDefault, setSettingDefault] = useState(false);

  useEffect(() => {
    loadTemplates();
    loadSubscriberCount();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const res = await fetch("/api/templates");
      if (res.ok) {
        const templateList: EmailTemplate[] = await res.json();
        setTemplates(templateList);

        // Auto-select the default template, or keep "default" (React Email)
        const defaultTemplate = templateList.find((t) => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
          // Load preview with the default template
          loadPreview(defaultTemplate.id);
        } else {
          // No default template, use the built-in React Email template
          loadPreview();
        }
      } else {
        // No templates available, just load default preview
        loadPreview();
      }
    } catch (error) {
      console.error("Error loading templates:", error);
      loadPreview();
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadPreview = async (templateId?: string) => {
    try {
      setLoading(true);
      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: templateId && templateId !== "default" ? templateId : undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setData(result.data);
        setPreviewHtml(result.html);
      } else {
        setMessage({ type: "error", text: result.error || "Failed to load preview" });
      }
    } catch (error) {
      console.error("Error loading preview:", error);
      setMessage({ type: "error", text: "Failed to load preview" });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    loadPreview(templateId);
  };

  const handleSetDefault = async () => {
    if (selectedTemplateId === "default") {
      // Cannot set built-in template as default via API
      // Could clear all isDefault flags, but for now just show a message
      setMessage({ type: "error", text: "The built-in template is always available" });
      return;
    }

    setSettingDefault(true);
    try {
      const res = await fetch(`/api/templates/${selectedTemplateId}/set-default`, {
        method: "POST",
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setMessage({ type: "success", text: result.message });
        // Refresh templates to update isDefault flags
        const templatesRes = await fetch("/api/templates");
        if (templatesRes.ok) {
          setTemplates(await templatesRes.json());
        }
      } else {
        setMessage({ type: "error", text: result.error || "Failed to set default" });
      }
    } catch (error) {
      console.error("Error setting default template:", error);
      setMessage({ type: "error", text: "Failed to set default template" });
    } finally {
      setSettingDefault(false);
    }
  };

  const loadSubscriberCount = async () => {
    try {
      const res = await fetch("/api/subscribers");
      const result = await res.json();
      if (result.success) {
        setSubscriberCount(result.count || 0);
      }
    } catch (error) {
      console.error("Error loading subscriber count:", error);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail) {
      setMessage({ type: "error", text: "Please enter an email address" });
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      const res = await fetch("/api/email/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          templateId: selectedTemplateId !== "default" ? selectedTemplateId : undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setMessage({
          type: "success",
          text: `Test email sent to ${testEmail}!`,
        });
        setTestEmail("");
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to send test email",
        });
      }
    } catch (error) {
      console.error("Error sending test:", error);
      setMessage({ type: "error", text: "Failed to send test email" });
    } finally {
      setSending(false);
    }
  };

  const handleSendAll = async () => {
    setShowConfirmDialog(false);
    setSendingAll(true);
    setMessage(null);

    try {
      const res = await fetch("/api/email/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId !== "default" ? selectedTemplateId : undefined,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setMessage({
          type: "success",
          text: result.message || "Newsletter sent successfully!",
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to send newsletter",
        });
      }
    } catch (error) {
      console.error("Error sending newsletter:", error);
      setMessage({ type: "error", text: "Failed to send newsletter" });
    } finally {
      setSendingAll(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Send Newsletter" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Loading newsletter preview...</span>
          </div>
        </div>
      </div>
    );
  }

  // No articles state
  if (!data || data.articles.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Send Newsletter" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">No Articles Ready</h2>
              <p className="text-muted-foreground mb-6">
                No approved articles found. Please approve some articles before
                sending a newsletter.
              </p>
              <Button onClick={() => (window.location.href = "/dashboard/review")}>
                Go to Review Articles
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Send Newsletter" />

      <div className="flex-1 p-6 overflow-auto">
        {/* Status Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <p
              className={
                message.type === "success"
                  ? "text-green-800 dark:text-green-200"
                  : "text-red-800 dark:text-red-200"
              }
            >
              {message.text}
            </p>
          </div>
        )}

        {/* Two-Panel Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Panel - Preview (60%) */}
          <div className="lg:w-[60%]">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Email Preview</CardTitle>
                      <CardDescription>
                        Week {data.week}, {data.year}
                      </CardDescription>
                    </div>
                    {/* Desktop/Mobile Toggle */}
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                      <Button
                        variant={previewMode === "desktop" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => setPreviewMode("desktop")}
                      >
                        <Monitor className="w-4 h-4 mr-1.5" />
                        Desktop
                      </Button>
                      <Button
                        variant={previewMode === "mobile" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => setPreviewMode("mobile")}
                      >
                        <Smartphone className="w-4 h-4 mr-1.5" />
                        Mobile
                      </Button>
                    </div>
                  </div>

                  {/* Template Selector */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Palette className="w-4 h-4" />
                      <span>Template:</span>
                    </div>
                    <Select
                      value={selectedTemplateId}
                      onValueChange={handleTemplateChange}
                      disabled={loadingTemplates || loading}
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          <div className="flex items-center gap-2">
                            <span>Built-in Template</span>
                          </div>
                        </SelectItem>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex items-center gap-2">
                              <span>{template.name}</span>
                              {template.isDefault && (
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplateId !== "default" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSetDefault}
                        disabled={settingDefault || templates.find(t => t.id === selectedTemplateId)?.isDefault}
                        className="h-8"
                      >
                        {settingDefault ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : templates.find(t => t.id === selectedTemplateId)?.isDefault ? (
                          <>
                            <Check className="w-4 h-4 mr-1.5 text-green-500" />
                            Default
                          </>
                        ) : (
                          <>
                            <Star className="w-4 h-4 mr-1.5" />
                            Set as default
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Email Preview Container */}
                <div className="bg-muted/30 rounded-lg p-4 flex justify-center">
                  <div
                    className={`bg-white dark:bg-zinc-900 rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${
                      previewMode === "desktop" ? "w-full" : "w-[375px]"
                    }`}
                  >
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[600px] border-0"
                      title="Newsletter Preview"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Actions (40%) */}
          <div className="lg:w-[40%] flex flex-col gap-4">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Newsletter Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-sm font-medium">Articles ready</span>
                    </div>
                    <span className="text-xl font-bold">{data.articles.length}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <span className="text-sm font-medium">Featured projects</span>
                    </div>
                    <span className="text-xl font-bold">{data.projects.length}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Users className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <span className="text-sm font-medium">Subscribers</span>
                    </div>
                    <span className="text-xl font-bold">{subscriberCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Test Email Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Send Test Email</CardTitle>
                <CardDescription>
                  Preview the newsletter in your inbox before sending
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="testEmail" className="sr-only">
                      Email Address
                    </Label>
                    <Input
                      id="testEmail"
                      type="email"
                      placeholder="your@email.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSendTest();
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleSendTest}
                    disabled={sending || !testEmail}
                    variant="outline"
                    className="w-full"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Test
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Send Newsletter Card */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Send Newsletter</CardTitle>
                <CardDescription>
                  Send to {subscriberCount} active subscriber{subscriberCount !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={sendingAll || subscriberCount === 0 || data.articles.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {sendingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Newsletter
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  This action cannot be undone
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Newsletter?</DialogTitle>
            <DialogDescription>
              You are about to send this newsletter to{" "}
              <strong>{subscriberCount}</strong> subscriber{subscriberCount !== 1 ? "s" : ""}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Articles:</span>
                <span className="font-medium">{data.articles.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Projects:</span>
                <span className="font-medium">{data.projects.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Week:</span>
                <span className="font-medium">
                  Week {data.week}, {data.year}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendAll}>
              <Send className="w-4 h-4 mr-2" />
              Confirm Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send, Mail, Eye, Loader2, CheckCircle, AlertCircle } from "lucide-react";

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

export default function SendPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NewsletterData | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [subscriberCount, setSubscriberCount] = useState(0);

  useEffect(() => {
    loadPreview();
    loadSubscriberCount();
  }, []);

  const loadPreview = async () => {
    try {
      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
        body: JSON.stringify({ email: testEmail }),
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
    if (
      !confirm(
        `Are you sure you want to send this newsletter to ${subscriberCount} subscribers? This cannot be undone.`
      )
    ) {
      return;
    }

    setSendingAll(true);
    setMessage(null);

    try {
      const res = await fetch("/api/email/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Send Newsletter</h1>
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading newsletter preview...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.articles.length === 0) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Send Newsletter</h1>
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400 mb-4">
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
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Send Newsletter</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Week {data.week}, {data.year}
          </p>
        </div>

        {/* Status Message */}
        {message && (
          <Card
            className={`mb-6 ${
              message.type === "success"
                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                : "border-red-500 bg-red-50 dark:bg-red-900/20"
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {message.type === "success" ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
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
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Newsletter Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  Articles
                </p>
                <p className="text-2xl font-bold">{data.articles.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  Projects
                </p>
                <p className="text-2xl font-bold">{data.projects.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  Subscribers
                </p>
                <p className="text-2xl font-bold">{subscriberCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Preview */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Content Preview</CardTitle>
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="w-4 h-4 mr-2" />
                {showPreview ? "Hide" : "Show"} Email Preview
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!showPreview ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Articles ({data.articles.length})</h4>
                  <div className="space-y-2">
                    {data.articles.map((article, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Badge variant="outline">{index + 1}</Badge>
                        <div>
                          <p className="text-sm font-medium">{article.title}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {article.category.join(", ")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {data.projects.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-2">
                      Internal Projects ({data.projects.length})
                    </h4>
                    <div className="space-y-2">
                      {data.projects.map((project, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <Badge variant="secondary">{index + 1}</Badge>
                          <div>
                            <p className="text-sm font-medium">{project.name}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {project.team}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 overflow-auto max-h-[600px]">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[600px] border-0"
                  title="Newsletter Preview"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Send Test Email */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Send Test Email</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="testEmail">Email Address</Label>
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
              <div className="flex items-end">
                <Button
                  onClick={handleSendTest}
                  disabled={sending || !testEmail}
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
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Test the newsletter before sending to all subscribers
            </p>
          </CardContent>
        </Card>

        {/* Send to All Subscribers */}
        <Card>
          <CardHeader>
            <CardTitle>Send to All Subscribers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 mb-4">
              <div>
                <p className="font-semibold text-orange-900 dark:text-orange-200">
                  Ready to send
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  This will send the newsletter to {subscriberCount} active
                  subscribers
                </p>
              </div>
              <Button
                onClick={handleSendAll}
                disabled={sendingAll || subscriberCount === 0}
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
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              ⚠️ This action cannot be undone. Make sure you've sent a test
              email first.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

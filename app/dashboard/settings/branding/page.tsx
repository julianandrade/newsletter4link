"use client";

import { useEffect, useState, useRef } from "react";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  Trash2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface BrandingSettings {
  logoUrl: string | null;
  bannerUrl: string | null;
}

export default function BrandingSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<BrandingSettings>({
    logoUrl: null,
    bannerUrl: null,
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Upload states
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // File input refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBrandingSettings();
  }, []);

  const loadBrandingSettings = async () => {
    try {
      const response = await fetch("/api/settings/branding");
      const result = await response.json();

      if (result.success) {
        setSettings(result.data);
      }
    } catch (error) {
      console.error("Error loading branding settings:", error);
      setMessage({ type: "error", text: "Failed to load branding settings" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (
    file: File,
    type: "logo" | "banner"
  ): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        return result.data.url;
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to upload file",
        });
        return null;
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      setMessage({ type: "error", text: "Failed to upload file" });
      return null;
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setMessage(null);

    const url = await handleFileUpload(file, "logo");
    if (url) {
      setSettings((prev) => ({ ...prev, logoUrl: url }));
      // Auto-save after upload
      await saveSettings({ ...settings, logoUrl: url });
    }

    setUploadingLogo(false);
    // Reset file input
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBanner(true);
    setMessage(null);

    const url = await handleFileUpload(file, "banner");
    if (url) {
      setSettings((prev) => ({ ...prev, bannerUrl: url }));
      // Auto-save after upload
      await saveSettings({ ...settings, bannerUrl: url });
    }

    setUploadingBanner(false);
    // Reset file input
    if (bannerInputRef.current) {
      bannerInputRef.current.value = "";
    }
  };

  const saveSettings = async (settingsToSave: BrandingSettings) => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsToSave),
      });

      const result = await response.json();

      if (result.success) {
        setSettings(result.data);
        setMessage({ type: "success", text: "Branding settings saved" });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to save settings",
        });
      }
    } catch (error) {
      console.error("Error saving branding settings:", error);
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setIsSaving(false);
      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleClearLogo = async () => {
    const newSettings = { ...settings, logoUrl: null };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const handleClearBanner = async () => {
    const newSettings = { ...settings, bannerUrl: null };
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <AppHeader title="Branding Settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <AppHeader title="Branding Settings" />

      <div className="flex-1 p-6">
        {/* Back Link */}
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

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

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Logo Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Newsletter Logo
              </CardTitle>
              <CardDescription>
                Upload a logo to display at the top of your newsletters.
                Recommended size: 200x80px
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Preview */}
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center min-h-[160px] bg-muted/30">
                {settings.logoUrl ? (
                  <div className="flex flex-col items-center gap-4">
                    <img
                      src={settings.logoUrl}
                      alt="Logo preview"
                      className="max-h-20 max-w-full object-contain"
                    />
                    <p className="text-xs text-muted-foreground truncate max-w-full">
                      {settings.logoUrl.split("/").pop()}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-12 w-12" />
                    <p className="text-sm">No logo uploaded</p>
                  </div>
                )}
              </div>

              {/* Logo Actions */}
              <div className="flex gap-2">
                <Input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                  id="logo-upload"
                />
                <Label htmlFor="logo-upload" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Logo
                      </>
                    )}
                  </Button>
                </Label>
                {settings.logoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearLogo}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Banner Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Newsletter Banner
              </CardTitle>
              <CardDescription>
                Upload a banner image for the header of your newsletters.
                Recommended size: 600x200px
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Banner Preview */}
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center min-h-[160px] bg-muted/30">
                {settings.bannerUrl ? (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <img
                      src={settings.bannerUrl}
                      alt="Banner preview"
                      className="max-h-32 max-w-full object-contain rounded"
                    />
                    <p className="text-xs text-muted-foreground truncate max-w-full">
                      {settings.bannerUrl.split("/").pop()}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="h-12 w-12" />
                    <p className="text-sm">No banner uploaded</p>
                  </div>
                )}
              </div>

              {/* Banner Actions */}
              <div className="flex gap-2">
                <Input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBannerChange}
                  className="hidden"
                  id="banner-upload"
                />
                <Label htmlFor="banner-upload" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={uploadingBanner}
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    {uploadingBanner ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Banner
                      </>
                    )}
                  </Button>
                </Label>
                {settings.bannerUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearBanner}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">How branding is used</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Logo:</strong> Displayed at the top of each newsletter
                email
              </li>
              <li>
                <strong>Banner:</strong> Optional header image for visual impact
              </li>
              <li>
                Images are automatically optimized and hosted on our CDN for
                fast delivery
              </li>
              <li>
                For best results, use PNG or WebP format with transparent
                backgrounds for logos
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

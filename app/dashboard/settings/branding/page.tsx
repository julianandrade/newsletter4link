"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  PageHeading,
  RadarButton,
  radarButtonClass,
  RadarMain,
  SectionLabel,
} from "@/components/radar/primitives";
import { RadarPanel, SkeletonRows } from "@/components/radar/controls";

interface BrandingSettings {
  logoUrl: string | null;
  bannerUrl: string | null;
}

type Slot = "logo" | "banner";

const SLOTS: {
  key: Slot;
  field: keyof BrandingSettings;
  title: string;
  note: string;
  size: string;
  previewHeight: string;
}[] = [
  {
    key: "logo",
    field: "logoUrl",
    title: "Logo",
    note: "Sits at the top of every edition, above the first story.",
    size: "200 by 80 pixels, PNG or WebP with a transparent background",
    previewHeight: "max-h-20",
  },
  {
    key: "banner",
    field: "bannerUrl",
    title: "Banner",
    note: "Optional. A wide image behind the masthead.",
    size: "600 by 200 pixels",
    previewHeight: "max-h-32",
  },
];

export default function BrandingSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<BrandingSettings>({
    logoUrl: null,
    bannerUrl: null,
  });
  const [uploading, setUploading] = useState<Slot | null>(null);

  const inputRefs = {
    logo: useRef<HTMLInputElement>(null),
    banner: useRef<HTMLInputElement>(null),
  };

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
      toast.error("Could not load the branding settings");
    } finally {
      setIsLoading(false);
    }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
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
      }
      toast.error(result.error || "The upload failed");
      return null;
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("The upload failed");
      return null;
    }
  };

  const saveSettings = async (settingsToSave: BrandingSettings) => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsToSave),
      });

      const result = await response.json();

      if (result.success) {
        setSettings(result.data);
        toast.success("Branding saved");
      } else {
        toast.error(result.error || "Could not save the branding");
      }
    } catch (error) {
      console.error("Error saving branding settings:", error);
      toast.error("Could not save the branding");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    slot: Slot
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(slot);

    const url = await uploadFile(file);
    if (url) {
      const field = slot === "logo" ? "logoUrl" : "bannerUrl";
      // Save from the current settings plus this change, so the other slot is kept.
      await saveSettings({ ...settings, [field]: url });
    }

    setUploading(null);
    const ref = inputRefs[slot].current;
    if (ref) ref.value = "";
  };

  const handleClear = async (slot: Slot) => {
    const field = slot === "logo" ? "logoUrl" : "bannerUrl";
    await saveSettings({ ...settings, [field]: null });
  };

  return (
    <>
      <AppHeader />

      <RadarMain width="980px">
        <PageHeading
          eyebrow="Settings · branding"
          title="What the newsletter wears"
          subtitle="These two images travel with every send, on top of whichever template is in use."
          actions={
            <Link href="/dashboard/settings" className={radarButtonClass()}>
              All settings
            </Link>
          }
        />

        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {SLOTS.map((slot) => {
              const url = settings[slot.field];
              const isUploading = uploading === slot.key;

              return (
                <RadarPanel key={slot.key} title={slot.title} note={slot.note}>
                  <div className="flex min-h-[168px] items-center justify-center rounded-xl border border-dashed border-radar-line bg-radar-surface2 p-4">
                    {url ? (
                      <div className="flex w-full flex-col items-center gap-3">
                        {/* Remote CDN images, so a plain img rather than next/image: the host would
                            have to be listed in images.remotePatterns first. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`${slot.title} preview`}
                          className={`${slot.previewHeight} max-w-full object-contain`}
                        />
                        <p className="m-0 max-w-full truncate text-[11px] text-radar-ink3">
                          {url.split("/").pop()}
                        </p>
                      </div>
                    ) : (
                      <p className="m-0 text-center text-[12.5px] text-radar-ink3">
                        No {slot.title.toLowerCase()} yet.
                        <br />
                        <span className="text-[11.5px]">{slot.size}</span>
                      </p>
                    )}
                  </div>

                  <input
                    ref={inputRefs[slot.key]}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleChange(event, slot.key)}
                    className="hidden"
                    id={`${slot.key}-upload`}
                  />

                  <div className="mt-4 flex gap-2">
                    <RadarButton
                      variant="accent"
                      className="flex-1"
                      disabled={isUploading || isSaving}
                      onClick={() => inputRefs[slot.key].current?.click()}
                    >
                      {isUploading
                        ? "Uploading…"
                        : url
                          ? `Replace the ${slot.title.toLowerCase()}`
                          : `Upload a ${slot.title.toLowerCase()}`}
                    </RadarButton>
                    {url && (
                      <RadarButton
                        onClick={() => handleClear(slot.key)}
                        disabled={isSaving || isUploading}
                        className="hover:border-radar-err hover:text-radar-err"
                      >
                        Remove
                      </RadarButton>
                    )}
                  </div>
                </RadarPanel>
              );
            })}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-radar-line2 bg-radar-surface2 px-4 py-3.5">
          <SectionLabel className="mb-2">Worth knowing</SectionLabel>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-radar-ink2">
            <li>
              Uploads are optimised and served from the CDN, so a large source file
              is fine.
            </li>
            <li>
              Transparent PNG or WebP keeps the logo readable on both light and dark
              email clients.
            </li>
            <li>
              Editions already sent keep the images they were sent with; changes
              apply from the next send.
            </li>
          </ul>
        </div>
      </RadarMain>
    </>
  );
}

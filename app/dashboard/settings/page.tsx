"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import {
  ChipGroup,
  Num,
  PageHeading,
  RadarButton,
  RadarMain,
  SectionLabel,
} from "@/components/radar/primitives";
import {
  Callout,
  RadarField,
  RadarInput,
  RadarPanel,
  RadarSelect,
  RadarTextarea,
  SkeletonRows,
} from "@/components/radar/controls";
import { UsageCard } from "@/components/usage-card";
import {
  AI_MODELS,
  LEGACY_AI_MODELS,
  EMBEDDING_MODELS,
} from "@/lib/ai-models";
import { cn } from "@/lib/utils";

interface Settings {
  relevanceThreshold: number;
  maxArticlesPerEdition: number;
  vectorSimilarityThreshold: number;
  articleMaxAgeDays: number;
  aiModel: string;
  embeddingModel: string;
  brandVoicePrompt: string | null;
}

type View = "curation" | "ai" | "appearance" | "plan";

const BRAND_VOICE_LIMIT = 500;

export default function SettingsPage() {
  const [view, setView] = useState<View>("curation");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((previous) => (previous ? { ...previous, [key]: value } : previous));
    setIsDirty(true);
  };

  const handleSaveSettings = async () => {
    if (!settings || isSaving) return;
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save settings");
      }

      const updated = await response.json();
      setSettings(updated);
      setIsDirty(false);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the settings"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const brandVoiceLength = settings?.brandVoicePrompt?.length ?? 0;
  const modelIsCurrent =
    !settings?.aiModel ||
    AI_MODELS.some((model) => model.value === settings.aiModel);
  const modelIsKnown =
    modelIsCurrent ||
    LEGACY_AI_MODELS.some((model) => model.value === settings?.aiModel);

  return (
    <>
      <AppHeader />

      <RadarMain width="980px">
        <PageHeading
          eyebrow="Settings"
          title="How the engine behaves"
          subtitle="These settings apply to the whole organization: what curation keeps, which models score and write, and how the newsletter looks."
          actions={
            <ChipGroup<View>
              label="Settings sections"
              idBase="settings-view"
              value={view}
              onChange={setView}
              options={[
                { value: "curation", label: "Curation" },
                { value: "ai", label: "Models" },
                { value: "appearance", label: "Appearance" },
                { value: "plan", label: "Plan" },
              ]}
            />
          }
        />

        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            {view === "curation" && (
              <div
                role="tabpanel"
                id="settings-view-panel-curation"
                aria-labelledby="settings-view-tab-curation"
              >
                <RadarPanel
                  title="What curation keeps"
                  note="Applied on every run, to every source."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <RadarField
                      label="Score threshold"
                      htmlFor="relevanceThreshold"
                      hint="Stories below this never reach the review queue. 6 is a sensible floor; raise it if the queue is noisy."
                    >
                      <RadarInput
                        id="relevanceThreshold"
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={settings?.relevanceThreshold ?? 6}
                        onChange={(event) =>
                          update(
                            "relevanceThreshold",
                            parseFloat(event.target.value)
                          )
                        }
                      />
                    </RadarField>

                    <RadarField
                      label="Stories per edition"
                      htmlFor="maxArticles"
                      hint="The cap the builder pulls up to when an edition is created."
                    >
                      <RadarInput
                        id="maxArticles"
                        type="number"
                        min="1"
                        max="100"
                        value={settings?.maxArticlesPerEdition ?? 10}
                        onChange={(event) =>
                          update(
                            "maxArticlesPerEdition",
                            parseInt(event.target.value, 10)
                          )
                        }
                      />
                    </RadarField>

                    <RadarField
                      label="Oldest story to collect"
                      htmlFor="articleMaxAge"
                      hint="In days. Anything published before this window is skipped."
                    >
                      <RadarInput
                        id="articleMaxAge"
                        type="number"
                        min="1"
                        max="365"
                        value={settings?.articleMaxAgeDays ?? 7}
                        onChange={(event) =>
                          update(
                            "articleMaxAgeDays",
                            parseInt(event.target.value, 10)
                          )
                        }
                      />
                    </RadarField>

                    <RadarField
                      label="Duplicate sensitivity"
                      htmlFor="similarityThreshold"
                      hint="Between 0 and 1. Higher means only near-identical stories are treated as duplicates."
                    >
                      <RadarInput
                        id="similarityThreshold"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings?.vectorSimilarityThreshold ?? 0.85}
                        onChange={(event) =>
                          update(
                            "vectorSimilarityThreshold",
                            parseFloat(event.target.value)
                          )
                        }
                      />
                    </RadarField>
                  </div>
                </RadarPanel>
              </div>
            )}

            {view === "ai" && (
              <div
                role="tabpanel"
                id="settings-view-panel-ai"
                aria-labelledby="settings-view-tab-ai"
                className="flex flex-col gap-5"
              >
                {!modelIsCurrent && (
                  <Callout tone="warn" title="This organization is on an older model">
                    {modelIsKnown
                      ? "It still works, but the current models score more accurately for the same cost or less. Switching is safe: only new runs are affected."
                      : `The stored model id (${settings?.aiModel}) is not one this screen knows about. Pick a current model to be sure runs keep working.`}
                  </Callout>
                )}

                <RadarPanel
                  title="Models"
                  note="Claude scores and summarises; OpenAI embeddings power duplicate detection and search."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <RadarField
                      label="Scoring and writing"
                      htmlFor="aiModel"
                      hint="Used for relevance scores, summaries and Ghost Writer."
                    >
                      <RadarSelect
                        id="aiModel"
                        value={settings?.aiModel ?? ""}
                        onChange={(event) => update("aiModel", event.target.value)}
                      >
                        <optgroup label="Current">
                          {AI_MODELS.map((model) => (
                            <option key={model.value} value={model.value}>
                              {model.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Earlier models">
                          {LEGACY_AI_MODELS.map((model) => (
                            <option key={model.value} value={model.value}>
                              {model.label}
                            </option>
                          ))}
                        </optgroup>
                        {/* Keeps an unrecognised stored id visible instead of blank. */}
                        {!modelIsKnown && settings?.aiModel && (
                          <option value={settings.aiModel}>
                            {settings.aiModel} (stored)
                          </option>
                        )}
                      </RadarSelect>
                    </RadarField>

                    <RadarField
                      label="Embeddings"
                      htmlFor="embeddingModel"
                      hint="Changing this re-embeds new stories only; older vectors stay as they are."
                    >
                      <RadarSelect
                        id="embeddingModel"
                        value={settings?.embeddingModel ?? ""}
                        onChange={(event) =>
                          update("embeddingModel", event.target.value)
                        }
                      >
                        {EMBEDDING_MODELS.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                      </RadarSelect>
                    </RadarField>
                  </div>
                </RadarPanel>

                <RadarPanel
                  title="Brand voice"
                  note="The standing instruction behind every score, summary and generated edition."
                >
                  <RadarField
                    label="What this newsletter is for"
                    htmlFor="brandVoicePrompt"
                    hint={
                      <>
                        Name your sector, your readers and what you do not want.{" "}
                        <Num
                          className={cn(
                            brandVoiceLength > BRAND_VOICE_LIMIT - 50 &&
                              "text-radar-warn"
                          )}
                        >
                          {brandVoiceLength}
                        </Num>{" "}
                        of <Num>{BRAND_VOICE_LIMIT}</Num> characters.
                      </>
                    }
                  >
                    <RadarTextarea
                      id="brandVoicePrompt"
                      rows={5}
                      maxLength={BRAND_VOICE_LIMIT}
                      value={settings?.brandVoicePrompt ?? ""}
                      onChange={(event) =>
                        update("brandVoicePrompt", event.target.value || null)
                      }
                      placeholder="We advise financial-sector clients on digital transformation. Professional but plain. We want practical AI applications, especially compliance and automation, and concrete results over announcements. No hype."
                    />
                  </RadarField>
                </RadarPanel>
              </div>
            )}

            {view === "appearance" && (
              <div
                role="tabpanel"
                id="settings-view-panel-appearance"
                aria-labelledby="settings-view-tab-appearance"
                className="flex flex-col gap-3"
              >
                <SectionLabel className="mb-1">
                  How the newsletter and the app look
                </SectionLabel>
                {[
                  {
                    href: "/dashboard/settings/branding",
                    title: "Logo and banner",
                    note: "The images every edition is topped with.",
                  },
                  {
                    href: "/dashboard/settings/theme",
                    title: "Theme",
                    note: "Pick your own, or set the one everyone in the organization starts with.",
                  },
                  {
                    href: "/dashboard/templates",
                    title: "Email templates",
                    note: "The frame each edition is poured into.",
                  },
                ].map((row) => (
                  <Link
                    key={row.href}
                    href={row.href}
                    className="flex items-center gap-4 rounded-xl border border-radar-line bg-radar-surface px-4 py-3.5 no-underline transition-colors hover:border-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-radar-ink">
                        {row.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-radar-ink2">
                        {row.note}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-[14px] text-radar-ink3">
                      ›
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {view === "plan" && (
              <div
                role="tabpanel"
                id="settings-view-panel-plan"
                aria-labelledby="settings-view-tab-plan"
                className="flex flex-col gap-5"
              >
                <UsageCard />

                <Link
                  href="/dashboard/settings/organization"
                  className="flex items-center gap-4 rounded-xl border border-radar-line bg-radar-surface px-4 py-3.5 no-underline transition-colors hover:border-radar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-radar-ink">
                      Organization
                    </span>
                    <span className="mt-0.5 block text-[12px] text-radar-ink2">
                      Name, industry, sending domain and the people with access.
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[14px] text-radar-ink3">
                    ›
                  </span>
                </Link>
              </div>
            )}
          </>
        )}
      </RadarMain>

      {/* One save bar for every section, so the button never hides below a fold. */}
      {isDirty && (view === "curation" || view === "ai") && (
        <div className="radar-enter sticky bottom-0 z-20 border-t border-radar-line bg-radar-surface px-4 py-3 shadow-radar-lg sm:px-6">
          <div className="mx-auto flex w-full max-w-[980px] flex-wrap items-center gap-3">
            <p className="m-0 flex-1 text-[12.5px] text-radar-ink">
              Unsaved changes. They take effect on the next curation run.
            </p>
            <RadarButton
              onClick={() => {
                setIsDirty(false);
                setIsLoading(true);
                fetch("/api/settings")
                  .then((r) => r.json())
                  .then((data) => setSettings(data))
                  .catch(console.error)
                  .finally(() => setIsLoading(false));
              }}
              disabled={isSaving}
            >
              Discard
            </RadarButton>
            <RadarButton
              variant="accent"
              onClick={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save settings"}
            </RadarButton>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

/**
 * RQ-005 AC-6.1 and AC-6.6: add to this week's edition without leaving it.
 *
 * The pool comes from `GET /api/editions/proposal/candidates` (unit B), which is
 * a separate route from the proposal itself because the pool runs to hundreds of
 * rows and the screen only needs it when this picker opens.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Num,
  RadarButton,
  ScoreMeter,
  SectionLabel,
  SourceStamp,
} from "@/components/radar/primitives";
import {
  EmptyNote,
  LoadError,
  RadarInput,
  SkeletonRows,
} from "@/components/radar/controls";
import { SelectCheckbox } from "@/components/radar/selection";
import { cn } from "@/lib/utils";
import type { ProposalArticle, ProposalProject } from "./state";

interface CandidatePool {
  articles: ProposalArticle[];
  projects: ProposalProject[];
}

export function AddToProposal({
  open,
  onOpenChange,
  onAdd,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (
    articles: ProposalArticle[],
    projects: ProposalProject[]
  ) => Promise<void> | void;
  busy?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [pool, setPool] = useState<CandidatePool>({ articles: [], projects: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (term.trim()) params.set("search", term.trim());

      const res = await fetch(`/api/editions/proposal/candidates?${params}`);
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error || `The candidate pool request failed (${res.status})`
        );
      }

      setPool({
        articles: json.data?.articles ?? [],
        projects: json.data?.projects ?? [],
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load what is waiting for an edition"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setChosen(new Set());
    void load("");
  }, [open, load]);

  // Debounced, so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(search), 300);
    return () => clearTimeout(timer);
  }, [search, open, load]);

  const toggle = (id: string) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosenArticles = pool.articles.filter((a) => chosen.has(a.id));
  const chosenProjects = pool.projects.filter((p) => chosen.has(p.id));
  const total = chosenArticles.length + chosenProjects.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from what is waiting</DialogTitle>
          <DialogDescription>
            Approved stories and featured projects that are not in this week&rsquo;s
            edition yet. Adding one takes effect straight away, so there is
            nothing to save.
          </DialogDescription>
        </DialogHeader>

        <RadarInput
          type="search"
          aria-label="Search what is waiting"
          placeholder="Search titles and summaries"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="max-h-[46vh] overflow-y-auto">
          {error && (
            <LoadError
              what="The candidate pool"
              message={error}
              onRetry={() => void load(search)}
            />
          )}

          {loading && !error && <SkeletonRows rows={4} />}

          {!loading &&
            !error &&
            pool.articles.length === 0 &&
            pool.projects.length === 0 && (
              <EmptyNote>
                Nothing is waiting. Approve a story in the queue and it appears
                here.
              </EmptyNote>
            )}

          {!loading && !error && pool.articles.length > 0 && (
            <div className="border-t border-radar-line">
              {pool.articles.map((article) => (
                <label
                  key={article.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border-b border-radar-line2 py-3 transition-colors",
                    chosen.has(article.id)
                      ? "bg-radar-surface2"
                      : "hover:bg-radar-surface2"
                  )}
                >
                  <SelectCheckbox
                    checked={chosen.has(article.id)}
                    onToggle={() => toggle(article.id)}
                    label={`Add ${article.title}`}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <SourceStamp
                      sourceUrl={article.sourceUrl}
                      publishedAt={article.publishedAt}
                      capturedAt={article.capturedAt}
                    />
                    <span className="font-editorial block text-[14.5px] leading-[1.3] text-radar-ink text-pretty">
                      {article.title}
                    </span>
                  </span>
                  <ScoreMeter score={article.relevanceScore} className="shrink-0" />
                </label>
              ))}
            </div>
          )}

          {!loading && !error && pool.projects.length > 0 && (
            <div className="mt-4">
              <SectionLabel className="mb-2">Projects</SectionLabel>
              <div className="border-t border-radar-line">
                {pool.projects.map((project) => (
                  <label
                    key={project.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 border-b border-radar-line2 py-3 transition-colors",
                      chosen.has(project.id)
                        ? "bg-radar-surface2"
                        : "hover:bg-radar-surface2"
                    )}
                  >
                    <SelectCheckbox
                      checked={chosen.has(project.id)}
                      onToggle={() => toggle(project.id)}
                      label={`Add ${project.name}`}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-radar-ink3">
                        {project.team}
                      </span>
                      <span className="font-editorial block text-[14.5px] leading-[1.3] text-radar-ink text-pretty">
                        {project.name}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <RadarButton onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </RadarButton>
          <RadarButton
            variant="accent"
            disabled={total === 0 || busy}
            onClick={() => void onAdd(chosenArticles, chosenProjects)}
          >
            {busy ? "Adding…" : <>Add <Num>{total}</Num></>}
          </RadarButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

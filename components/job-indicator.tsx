"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Sparkles,
  Search,
  Mail,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";

interface BackgroundJob {
  id: string;
  type: "GENERATION" | "SEARCH" | "EMAIL_SEND";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  currentStage: string | null;
  startedAt: string;
}

interface JobIndicatorProps {
  collapsed?: boolean;
}

// Map job types to their respective pages and icons
const JOB_CONFIG: Record<
  BackgroundJob["type"],
  { label: string; href: string; icon: typeof Sparkles }
> = {
  GENERATION: {
    label: "Ghost Writer",
    href: "/dashboard/generate",
    icon: Sparkles,
  },
  SEARCH: {
    label: "Trend Radar",
    href: "/dashboard/search",
    icon: Search,
  },
  EMAIL_SEND: {
    label: "Email Send",
    href: "/dashboard/send",
    icon: Mail,
  },
};

const POLL_INTERVAL = 5000; // 5 seconds

export function JobIndicator({ collapsed = false }: JobIndicatorProps) {
  const [runningJobs, setRunningJobs] = useState<BackgroundJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const fetchRunningJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?status=RUNNING&limit=10");
      if (res.ok) {
        const data = await res.json();
        setRunningJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch running jobs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling (faster when dropdown is open)
  useEffect(() => {
    fetchRunningJobs();

    const interval = setInterval(fetchRunningJobs, isOpen ? 2000 : POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRunningJobs, isOpen]);

  // Don't render anything if no running jobs and not loading
  if (!isLoading && runningJobs.length === 0) {
    return null;
  }

  const jobCount = runningJobs.length;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-10 h-10 p-0 mx-auto relative",
                  jobCount > 0 && "text-primary"
                )}
                disabled={isLoading && jobCount === 0}
              >
                {isLoading && jobCount === 0 ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Activity className="h-5 w-5" />
                    {jobCount > 0 && (
                      <Badge
                        variant="default"
                        className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                      >
                        {jobCount}
                      </Badge>
                    )}
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <JobDropdownContent jobs={runningJobs} />
          </DropdownMenu>
        </TooltipTrigger>
        <TooltipContent side="right">
          {jobCount > 0
            ? `${jobCount} running job${jobCount > 1 ? "s" : ""}`
            : "No running jobs"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-2",
            jobCount > 0 && "text-primary"
          )}
          disabled={isLoading && jobCount === 0}
        >
          {isLoading && jobCount === 0 ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
          <span className="flex-1 text-left">
            {jobCount > 0
              ? `${jobCount} Running Job${jobCount > 1 ? "s" : ""}`
              : "Background Jobs"}
          </span>
          {jobCount > 0 && (
            <Badge variant="default" className="ml-auto">
              {jobCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <JobDropdownContent jobs={runningJobs} />
    </DropdownMenu>
  );
}

function JobDropdownContent({ jobs }: { jobs: BackgroundJob[] }) {
  if (jobs.length === 0) {
    return (
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Background Jobs</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
          No running jobs
        </div>
      </DropdownMenuContent>
    );
  }

  return (
    <DropdownMenuContent align="end" className="w-80">
      <DropdownMenuLabel>Running Jobs</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {jobs.map((job) => {
        const config = JOB_CONFIG[job.type];
        const Icon = config.icon;

        return (
          <DropdownMenuItem key={job.id} asChild className="cursor-pointer">
            <Link href={config.href} className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-medium">{config.label}</span>
                <StatusIcon status={job.status} />
              </div>
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{job.currentStage || "Processing..."}</span>
                  <span>{job.progress}%</span>
                </div>
                <Progress value={job.progress} className="h-1.5" />
              </div>
            </Link>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuContent>
  );
}

function StatusIcon({ status }: { status: BackgroundJob["status"] }) {
  switch (status) {
    case "RUNNING":
      return <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto" />;
    case "COMPLETED":
      return <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />;
    case "FAILED":
    case "CANCELLED":
      return <XCircle className="h-3 w-3 text-destructive ml-auto" />;
    default:
      return null;
  }
}

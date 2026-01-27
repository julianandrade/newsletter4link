"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Plus,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  industry: string;
  logoUrl: string | null;
  role: string;
}

interface OrgSwitcherProps {
  collapsed?: boolean;
}

export function OrgSwitcher({ collapsed = false }: OrgSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.data || []);
        setCurrentOrgId(data.currentOrgId);
      }
    } catch (error) {
      console.error("Failed to fetch organizations:", error);
    } finally {
      setLoading(false);
    }
  };

  const switchOrganization = async (orgId: string) => {
    if (orgId === currentOrgId) {
      setOpen(false);
      return;
    }

    try {
      const res = await fetch("/api/organizations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      if (res.ok) {
        setCurrentOrgId(orgId);
        setOpen(false);
        // Refresh the page to load new org data
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to switch organization:", error);
    }
  };

  const currentOrg = organizations.find((o) => o.id === currentOrgId);

  if (loading) {
    return (
      <div className={cn("px-2 py-2", collapsed && "px-1")}>
        <div className="h-9 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  // If no organizations, show create prompt
  if (organizations.length === 0) {
    return (
      <div className={cn("px-2 py-2", collapsed && "px-1")}>
        <Button
          variant="outline"
          size="sm"
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => router.push("/onboarding")}
        >
          {collapsed ? (
            <Plus className="h-4 w-4" />
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Create Organization
            </>
          )}
        </Button>
      </div>
    );
  }

  // Collapsed view
  if (collapsed) {
    return (
      <div className="px-1 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-9 px-0"
              onClick={() => setOpen(!open)}
            >
              {currentOrg?.logoUrl ? (
                <img
                  src={currentOrg.logoUrl}
                  alt={currentOrg.name}
                  className="h-6 w-6 rounded"
                />
              ) : (
                <Building2 className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="font-medium">{currentOrg?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {currentOrg?.plan.toLowerCase()} plan
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  // Expanded view with dropdown
  return (
    <div className="px-2 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2 truncate">
              {currentOrg?.logoUrl ? (
                <img
                  src={currentOrg.logoUrl}
                  alt={currentOrg.name}
                  className="h-5 w-5 rounded"
                />
              ) : (
                <Building2 className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{currentOrg?.name || "Select..."}</span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search organizations..." />
            <CommandList>
              <CommandEmpty>No organization found.</CommandEmpty>
              <CommandGroup heading="Organizations">
                {organizations.map((org) => (
                  <CommandItem
                    key={org.id}
                    value={org.name}
                    onSelect={() => switchOrganization(org.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {org.logoUrl ? (
                        <img
                          src={org.logoUrl}
                          alt={org.name}
                          className="h-5 w-5 rounded shrink-0"
                        />
                      ) : (
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm">{org.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {org.role.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4 shrink-0",
                        currentOrgId === org.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    router.push("/onboarding");
                  }}
                  className="cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </CommandItem>
                {currentOrg && (
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      router.push("/dashboard/settings/organization");
                    }}
                    className="cursor-pointer"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Organization Settings
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Plan badge */}
      {currentOrg && (
        <div className="mt-2 px-1">
          <Badge
            variant={currentOrg.plan === "FREE" ? "secondary" : "default"}
            className="text-xs"
          >
            {currentOrg.plan.toLowerCase()} plan
          </Badge>
        </div>
      )}
    </div>
  );
}

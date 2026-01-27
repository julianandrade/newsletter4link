"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Plus,
  Upload,
  Search,
  Users,
  MoreHorizontal,
  Trash2,
  Mail,
  UserX,
  UserCheck,
  Download,
} from "lucide-react";

interface Subscriber {
  id: string;
  email: string;
  name?: string;
  active: boolean;
  preferredLanguage: string;
  preferredStyle: string;
  createdAt: string;
}

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newLanguage, setNewLanguage] = useState("en");
  const [newStyle, setNewStyle] = useState("comprehensive");
  const [isAdding, setIsAdding] = useState(false);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  useEffect(() => {
    loadSubscribers();
  }, [showInactive]);

  const loadSubscribers = async () => {
    setIsLoading(true);
    try {
      const url = showInactive ? "/api/subscribers?all=true" : "/api/subscribers";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSubscribers(data.data);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to load subscribers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubscriber = async () => {
    if (!newEmail.trim() || isAdding) return;

    setIsAdding(true);
    setError(null);

    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          preferredLanguage: newLanguage,
          preferredStyle: newStyle,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubscribers([data.data, ...subscribers]);
        setIsAddDialogOpen(false);
        setNewEmail("");
        setNewName("");
        setNewLanguage("en");
        setNewStyle("comprehensive");
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to add subscriber");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleActive = async (subscriber: Subscriber) => {
    try {
      const res = await fetch(`/api/subscribers/${subscriber.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !subscriber.active }),
      });

      const data = await res.json();
      if (data.success) {
        setSubscribers(
          subscribers.map((s) =>
            s.id === subscriber.id ? { ...s, active: !s.active } : s
          )
        );
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to update subscriber");
    }
  };

  const handleDelete = async (subscriberId: string) => {
    if (!confirm("Are you sure you want to delete this subscriber?")) return;

    try {
      const res = await fetch(`/api/subscribers/${subscriberId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSubscribers(subscribers.filter((s) => s.id !== subscriberId));
      } else {
        const data = await res.json();
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to delete subscriber");
    }
  };

  const handleImport = async () => {
    if (!csvContent.trim() || isImporting) return;

    setIsImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const res = await fetch("/api/subscribers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvContent.trim() }),
      });

      const data = await res.json();
      if (data.success) {
        setImportResult({ imported: data.imported, skipped: data.skipped });
        loadSubscribers();
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to import subscribers");
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = () => {
    const csv = [
      "email,name,language,style,active",
      ...subscribers.map(
        (s) =>
          `${s.email},${s.name || ""},${s.preferredLanguage},${s.preferredStyle},${s.active}`
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSubscribers = subscribers.filter((s) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.email.toLowerCase().includes(query) ||
      s.name?.toLowerCase().includes(query)
    );
  });

  const activeCount = subscribers.filter((s) => s.active).length;
  const inactiveCount = subscribers.filter((s) => !s.active).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Subscribers" />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Subscribers
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your newsletter subscribers
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>

            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Subscribers</DialogTitle>
                  <DialogDescription>
                    Paste CSV content with email addresses (one per line or comma-separated)
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <textarea
                    className="w-full h-40 p-3 border rounded-md font-mono text-sm"
                    placeholder="email@example.com&#10;another@example.com&#10;&#10;Or with names:&#10;email@example.com,John Doe"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                  />
                  {importResult && (
                    <div className="text-sm">
                      <span className="text-green-600">
                        Imported: {importResult.imported}
                      </span>
                      {importResult.skipped > 0 && (
                        <span className="text-muted-foreground ml-4">
                          Skipped: {importResult.skipped}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                    Close
                  </Button>
                  <Button onClick={handleImport} disabled={isImporting}>
                    {isImporting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      "Import"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Subscriber
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Subscriber</DialogTitle>
                  <DialogDescription>
                    Add a new subscriber to your newsletter
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name (optional)</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={newLanguage} onValueChange={setNewLanguage}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="pt-pt">Portuguese (PT)</SelectItem>
                          <SelectItem value="pt-br">Portuguese (BR)</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="ar">Arabic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Style</Label>
                      <Select value={newStyle} onValueChange={setNewStyle}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="executive">Executive</SelectItem>
                          <SelectItem value="technical">Technical</SelectItem>
                          <SelectItem value="comprehensive">Comprehensive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddSubscriber} disabled={isAdding}>
                    {isAdding ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Subscriber"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCount}</p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gray-100 rounded-lg">
                  <UserX className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inactiveCount}</p>
                  <p className="text-sm text-muted-foreground">Inactive</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{subscribers.length}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant={showInactive ? "default" : "outline"}
                onClick={() => setShowInactive(!showInactive)}
              >
                {showInactive ? "Showing All" : "Show Inactive"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscribers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Subscribers</CardTitle>
            <CardDescription>
              {filteredSubscribers.length} subscriber{filteredSubscribers.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredSubscribers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "No subscribers match your search" : "No subscribers yet"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscribers.map((subscriber) => (
                    <TableRow key={subscriber.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {subscriber.email}
                        </div>
                      </TableCell>
                      <TableCell>{subscriber.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{subscriber.preferredLanguage}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{subscriber.preferredStyle}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={subscriber.active ? "default" : "outline"}>
                          {subscriber.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(subscriber.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleToggleActive(subscriber)}>
                              {subscriber.active ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(subscriber.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, Trash2, Download } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    name: "",
  });
  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const fetchSubscribers = async () => {
    try {
      const res = await fetch("/api/subscribers");
      const data = await res.json();
      if (data.success) {
        setSubscribers(data.data);
      }
    } catch (error) {
      console.error("Error fetching subscribers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        await fetchSubscribers();
        setFormData({ email: "", name: "" });
        setShowAddForm(false);
      } else {
        alert(data.error || "Failed to add subscriber");
      }
    } catch (error) {
      console.error("Error adding subscriber:", error);
      alert("Failed to add subscriber");
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();

    // Parse CSV
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      alert("CSV must have at least a header row and one data row");
      return;
    }

    const subscribers = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      if (values[0]) {
        subscribers.push({
          email: values[0],
          name: values[1] || undefined,
        });
      }
    }

    try {
      const res = await fetch("/api/subscribers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribers }),
      });

      const data = await res.json();

      if (data.success) {
        setImportResult(data.data);
        await fetchSubscribers();
        setCsvText("");
        setTimeout(() => {
          setShowImportForm(false);
          setImportResult(null);
        }, 3000);
      }
    } catch (error) {
      console.error("Error importing subscribers:", error);
      alert("Failed to import subscribers");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to unsubscribe this user?")) return;

    try {
      const res = await fetch(`/api/subscribers/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        setSubscribers(subscribers.filter((s) => s.id !== id));
      }
    } catch (error) {
      console.error("Error deleting subscriber:", error);
    }
  };

  const downloadSampleCSV = () => {
    const csv = `email,name
john.doe@example.com,John Doe
maria.silva@example.com,Maria Silva
carlos.rodriguez@example.com,Carlos Rodriguez`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-subscribers.csv";
    a.click();
  };

  const filteredSubscribers = subscribers.filter(
    (sub) =>
      sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Subscribers</h1>
          <p className="text-slate-600">Loading subscribers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Subscribers</h1>
            <p className="text-slate-600 dark:text-slate-400">
              {subscribers.length} total subscribers
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportForm(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Subscriber
            </Button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add New Subscriber</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit">Add Subscriber</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddForm(false);
                      setFormData({ email: "", name: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Import Form */}
        {showImportForm && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Import Subscribers from CSV</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadSampleCSV}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download Sample
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleImport} className="space-y-4">
                <div>
                  <Label htmlFor="csv">
                    CSV Data (format: email, name)
                  </Label>
                  <textarea
                    id="csv"
                    className="w-full h-48 p-3 border rounded-md font-mono text-sm"
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="email,name&#10;john@example.com,John Doe&#10;jane@example.com,Jane Smith"
                  />
                </div>

                {importResult && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                      Import completed!
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      ✓ {importResult.success} added
                    </p>
                    {importResult.duplicates > 0 && (
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        ⚠ {importResult.duplicates} duplicates skipped
                      </p>
                    )}
                    {importResult.failed > 0 && (
                      <p className="text-sm text-red-700 dark:text-red-300">
                        ✗ {importResult.failed} failed
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="submit">Import</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowImportForm(false);
                      setCsvText("");
                      setImportResult(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Subscribers List */}
        <Card>
          <CardContent className="p-0">
            {filteredSubscribers.length === 0 ? (
              <div className="p-12 text-center text-slate-600 dark:text-slate-400">
                No subscribers found.
              </div>
            ) : (
              <div className="divide-y">
                {filteredSubscribers.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{sub.email}</p>
                        {!sub.active && (
                          <Badge variant="destructive">Unsubscribed</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {sub.name || "No name"} • Added{" "}
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(sub.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

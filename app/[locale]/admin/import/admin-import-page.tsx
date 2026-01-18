"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle, Download } from "lucide-react";

interface ImportResult {
  success: boolean;
  message: string;
  eventSlug?: string;
}

export function AdminImportPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Imported: ${data.title}`,
          eventSlug: data.slug,
        });
        setUrl("");
      } else {
        setResult({
          success: false,
          message: data.error || "Import failed",
        });
      }
    } catch {
      setResult({
        success: false,
        message: "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Import Event</h1>
        <p className="mt-2 text-muted-foreground">
          Import events from external platforms with one click
        </p>
      </div>

      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Quick Import
          </CardTitle>
          <CardDescription>
            Paste a Facebook or Eventbrite event URL to import it instantly
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://facebook.com/events/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
              className="flex-1"
            />
            <Button
              onClick={handleImport}
              disabled={loading || !url.trim()}
              className="min-w-[100px]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Import"
              )}
            </Button>
          </div>

          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                result.success
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="flex-1">{result.message}</span>
              {result.eventSlug && (
                <a
                  href={`/events/${result.eventSlug}`}
                  className="underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Event
                </a>
              )}
            </div>
          )}

          <div className="text-sm text-muted-foreground border-t pt-4">
            <p className="font-medium mb-2">Supported URLs:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <span className="font-mono text-xs">facebook.com/events/...</span>{" "}
                - Facebook Events
              </li>
              <li>
                <span className="font-mono text-xs">eventbrite.com/e/...</span>{" "}
                - Eventbrite Events
              </li>
              <li>
                <span className="font-mono text-xs">lu.ma/...</span> - Lu.ma
                Events
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Paste the event URL in the input above</li>
            <li>
              Apify scrapes the event data (title, description, date, location,
              image)
            </li>
            <li>Event is automatically created with an organizer profile</li>
            <li>Images are re-uploaded to our CDN for permanent hosting</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

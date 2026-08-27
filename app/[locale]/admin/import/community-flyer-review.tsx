"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommunityFlyerReview as FlyerSuggestion } from "@/lib/import/community-flyer-review";

export function CommunityFlyerReview() {
  const [suggestions, setSuggestions] = useState<FlyerSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/import/community-flyers");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load flyer suggestions");
      setSuggestions(body.suggestions || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load flyer suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  async function updateSuggestion(id: string, action: "reject" | "retry") {
    setWorkingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/import/community-flyers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not update suggestion");
      if (action === "retry") {
        setSuggestions((current) => current.map((item) =>
          item.id === id ? { ...item, status: "pending", errorDetail: null } : item
        ));
      } else {
        setSuggestions((current) => current.map((item) =>
          item.id === id
            ? { ...item, status: "failed", errorDetail: "Rejected by moderator" }
            : item
        ));
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update suggestion");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
            Community flyer review
          </CardTitle>
          <CardDescription className="mt-1">
            Review community uploads. A flyer is never published until you complete the event form.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void loadSuggestions()}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
        {loading && suggestions.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            Loading suggestions…
          </div>
        ) : suggestions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No community flyers need review.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {suggestions.map((suggestion) => (
              <article key={suggestion.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="relative aspect-[2/1] bg-muted">
                  <Image
                    src={suggestion.flyerUrl}
                    alt="Submitted event flyer"
                    fill
                    sizes="(min-width: 1024px) 40vw, 90vw"
                    className="object-contain"
                  />
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold">{suggestion.title}</h3>
                      <span className={`rounded-full px-2 py-1 text-xs ${
                        suggestion.status === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      }`}>
                        {suggestion.status}
                      </span>
                    </div>
                    {suggestion.errorDetail && (
                      <p className="mt-1 text-xs text-destructive">{suggestion.errorDetail}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild className="min-h-11 flex-1">
                      <Link href={`/events/new?reviewFlyer=${encodeURIComponent(suggestion.id)}`}>
                        Review & create event
                      </Link>
                    </Button>
                    {suggestion.status === "failed" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={workingId === suggestion.id}
                        onClick={() => void updateSuggestion(suggestion.id, "retry")}
                      >
                        <RefreshCw aria-hidden="true" /> Retry
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 text-destructive"
                        disabled={workingId === suggestion.id}
                        onClick={() => void updateSuggestion(suggestion.id, "reject")}
                      >
                        <X aria-hidden="true" /> Reject
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

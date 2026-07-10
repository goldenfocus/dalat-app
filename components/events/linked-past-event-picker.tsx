"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link2, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PastEventOption {
  id: string;
  title: string;
  slug: string;
  starts_at: string;
}

interface LinkedPastEventPickerProps {
  eventId: string;
  initialLinkedEventId: string | null;
}

/**
 * Admin-only control (rendered only for admins in EventForm's edit mode).
 * Links a past event whose published moments are showcased on this event's
 * page until it has moments of its own. Saves immediately via the admin API
 * so authorization is enforced server-side, independent of the form submit.
 */
export function LinkedPastEventPicker({
  eventId,
  initialLinkedEventId,
}: LinkedPastEventPickerProps) {
  const t = useTranslations("eventForm");
  const locale = useLocale();
  const [linkedEvent, setLinkedEvent] = useState<PastEventOption | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PastEventOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the currently linked event's title for display
  useEffect(() => {
    if (!initialLinkedEventId) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, slug, starts_at")
        .eq("id", initialLinkedEventId)
        .single();
      if (data) setLinkedEvent(data as PastEventOption);
    })();
  }, [initialLinkedEventId]);

  // Debounced search over published past events
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, title, slug, starts_at")
        .eq("status", "published")
        .lt("starts_at", new Date().toISOString())
        .neq("id", eventId)
        .ilike("title", `%${q}%`)
        .order("starts_at", { ascending: false })
        .limit(8);
      setResults((data ?? []) as PastEventOption[]);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, eventId]);

  const save = async (target: PastEventOption | null) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/link-past-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, linkedEventId: target?.id ?? null }),
      });
      if (!res.ok) throw new Error("link_failed");
      setLinkedEvent(target);
      setQuery("");
      setResults([]);
    } catch {
      setError(t("linkedPastEventError"));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="space-y-2">
      <Label htmlFor="linkedPastEvent" className="flex items-center gap-2">
        <Link2 className="w-4 h-4" />
        {t("linkedPastEvent")}
      </Label>

      {linkedEvent ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{linkedEvent.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(linkedEvent.starts_at)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => save(null)}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
            <span className="ml-1">{t("unlinkPastEvent")}</span>
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id="linkedPastEvent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPastEvents")}
            disabled={saving}
          />
          {(searching || results.length > 0 || (query.trim().length >= 2 && !searching)) && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
              {searching ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("searchingEvents")}
                </div>
              ) : results.length > 0 ? (
                results.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                    onClick={() => save(option)}
                  >
                    <span className="text-sm truncate">{option.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(option.starts_at)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {t("noPastEventsFound")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{t("linkedPastEventHelp")}</p>
    </div>
  );
}

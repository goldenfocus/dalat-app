"use client";

import { useEffect, useState } from "react";
import { EventGrid } from "./event-grid";
import { useEventViewPreferences } from "@/lib/hooks/use-local-storage";
import type { CardEvent, EventCounts, EventSocial } from "@/lib/types";

interface EventGridWithViewsProps {
  /** Server-rendered default (grid + default density) — zero card hydration */
  children: React.ReactNode;
  events: CardEvent[];
  counts: Record<string, EventCounts | undefined>;
  eventTranslations: Record<string, { title?: string } | undefined>;
  seriesRrules?: Record<string, string>;
  social?: Record<string, EventSocial | undefined>;
}

/**
 * Progressive enhancement over server-first event cards.
 *
 * Default path (majority of users): show RSC children, no card JS.
 * Non-default view prefs (list / immersive / compact): client EventGrid.
 */
export function EventGridWithViews({
  children,
  events,
  counts,
  eventTranslations,
  seriesRrules = {},
  social = {},
}: EventGridWithViewsProps) {
  const { mode, density } = useEventViewPreferences();
  // Avoid hydration mismatch: localStorage prefs only apply after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDefault = mode === "grid" && density === "default";

  if (!mounted || isDefault) {
    return <>{children}</>;
  }

  // Client EventGrid expects a Map; rebuild from the serializable record.
  const translationMap = new Map<string, { title?: string }>();
  for (const [id, value] of Object.entries(eventTranslations)) {
    if (value) translationMap.set(id, value);
  }

  return (
    <EventGrid
      events={events}
      counts={counts}
      social={social}
      eventTranslations={translationMap}
      seriesRrules={seriesRrules}
    />
  );
}

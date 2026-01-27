"use client";

import { useState } from "react";
import { ChevronDown, Calendar } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PastEvent {
  id: string;
  slug: string;
  title: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string | null;
}

interface PastEventsSectionProps {
  events: PastEvent[];
  locale: Locale;
  label: string;
}

export function PastEventsSection({ events, locale, label }: PastEventsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (events.length === 0) return null;

  return (
    <div id="past-events" className="mb-8 scroll-mt-20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted active:scale-[0.99] transition-all"
      >
        <span className="font-medium">
          {label} ({events.length})
        </span>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="grid gap-4 sm:grid-cols-2 mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.slug}`}>
              <Card className="hover:border-muted-foreground/30 transition-colors overflow-hidden opacity-80 hover:opacity-100">
                <CardContent className="p-0">
                  {event.image_url && (
                    <img
                      src={event.image_url}
                      alt=""
                      className="w-full aspect-[2/1] object-cover grayscale-[30%]"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold mb-2 line-clamp-2">{event.title}</h3>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {formatInDaLat(event.starts_at, "MMM d, yyyy", locale)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

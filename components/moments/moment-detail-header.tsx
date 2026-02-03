"use client";

import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, Grid3X3, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

interface MomentDetailHeaderProps {
  eventSlug: string;
  eventTitle: string;
  /** Where the user came from - affects back navigation */
  from?: string;
}

/**
 * Determines the back navigation URL based on context.
 *
 * TODO: This is where you decide navigation behavior!
 * Consider the trade-offs:
 * - Should "from=immersive" return to immersive mode? (better UX continuity)
 * - Or always return to grid? (simpler, but loses context)
 * - Should we remember scroll position? (complex but ideal)
 */
function getBackUrl(eventSlug: string, from?: string): string {
  const basePath = `/events/${eventSlug}/moments`;

  // Default behavior: always go to moments grid
  // The view mode switcher on that page will restore their preferred view
  return basePath;
}

export function MomentDetailHeader({
  eventSlug,
  eventTitle,
  from,
}: MomentDetailHeaderProps) {
  const t = useTranslations("moments");
  const backUrl = getBackUrl(eventSlug, from);

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Back button - mobile-first touch target per CLAUDE.md */}
          <Link
            href={backUrl}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {eventTitle}
            </span>
          </Link>

          {/* View mode hints - shows where user will land */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Grid3X3 className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">{t("viewAll")}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

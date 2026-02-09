"use client";

import { ImageIcon, Heart, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Sponsor, EventSponsor } from "@/lib/types";

interface SponsorDisplayProps {
  sponsors: (EventSponsor & { sponsors: Sponsor })[];
}

export function SponsorDisplay({ sponsors }: SponsorDisplayProps) {
  const t = useTranslations("events");

  if (!sponsors || sponsors.length === 0) {
    return null;
  }

  // Sort by sort_order
  const sortedSponsors = [...sponsors].sort((a, b) => a.sort_order - b.sort_order);

  // Single sponsor gets a special featured treatment
  if (sortedSponsors.length === 1) {
    const es = sortedSponsors[0];
    const sponsor = es.sponsors;
    if (!sponsor) return null;

    const content = (
      <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/50 dark:border-amber-800/30">
        {/* Logo */}
        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
          {sponsor.logo_url ? (
            <img
              src={sponsor.logo_url}
              alt={sponsor.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-0.5 flex items-center gap-1">
            <Heart className="w-3 h-3 fill-current" />
            {t("supportedBy")}
          </p>
          <p className="font-semibold text-foreground truncate">{sponsor.name}</p>
          {sponsor.website_url && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              {t("visitSponsor")}
              <ExternalLink className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    );

    if (sponsor.website_url) {
      return (
        <a
          href={sponsor.website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:opacity-90 transition-opacity"
        >
          {content}
        </a>
      );
    }

    return content;
  }

  // Multiple sponsors - grid layout with refined cards
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Heart className="w-4 h-4 text-amber-500 fill-amber-500" />
        <p className="text-sm font-medium text-muted-foreground">{t("supportedBy")}</p>
      </div>
      <div className={cn(
        "grid gap-3",
        sortedSponsors.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
      )}>
        {sortedSponsors.map((es) => {
          const sponsor = es.sponsors;
          if (!sponsor) return null;

          const content = (
            <div className="group relative flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100/50 dark:from-zinc-900 dark:to-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 hover:border-amber-300/50 dark:hover:border-amber-700/50 transition-all duration-300">
              {/* Logo */}
              <div className="w-14 h-14 rounded-xl overflow-hidden transition-transform duration-300 group-hover:scale-105 flex items-center justify-center">
                {sponsor.logo_url ? (
                  <img
                    src={sponsor.logo_url}
                    alt={sponsor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              {/* Name */}
              <span className="text-xs font-medium text-center text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2">
                {sponsor.name}
              </span>
              {/* External link indicator */}
              {sponsor.website_url && (
                <ExternalLink className="w-3 h-3 text-muted-foreground/50 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          );

          // If sponsor has a website, wrap in link
          if (sponsor.website_url) {
            return (
              <a
                key={es.sponsor_id}
                href={sponsor.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {content}
              </a>
            );
          }

          return <div key={es.sponsor_id}>{content}</div>;
        })}
      </div>
    </div>
  );
}

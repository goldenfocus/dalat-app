"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import { buildArchiveUrl, type MonthSlug } from "@/lib/events/archive-utils";

interface MonthNavigationProps {
  currentYear: number;
  currentMonth: number;
  prev: { year: number; month: number; slug: MonthSlug } | null;
  next: { year: number; month: number; slug: MonthSlug } | null;
  monthLabel: string;
  prevLabel?: string;
  nextLabel?: string;
  className?: string;
}

export function MonthNavigation({
  currentYear,
  currentMonth,
  prev,
  next,
  monthLabel,
  prevLabel = "Previous",
  nextLabel = "Next",
  className,
}: MonthNavigationProps) {
  const locale = useLocale();

  return (
    <nav
      className={cn(
        "flex items-center justify-between gap-2",
        className
      )}
      aria-label="Month navigation"
    >
      {/* Previous month */}
      {prev ? (
        <Link
          href={`/${locale}${buildArchiveUrl(prev.year, prev.month)}`}
          className="flex items-center gap-1 px-3 py-2 -ml-3 text-sm text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all rounded-lg"
          aria-label={`${prevLabel}: ${prev.slug} ${prev.year}`}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{prevLabel}</span>
        </Link>
      ) : (
        <div className="w-10" />
      )}

      {/* Current month display */}
      <div className="flex items-center gap-2 text-sm font-medium">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span>{monthLabel}</span>
      </div>

      {/* Next month */}
      {next ? (
        <Link
          href={`/${locale}${buildArchiveUrl(next.year, next.month)}`}
          className="flex items-center gap-1 px-3 py-2 -mr-3 text-sm text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all rounded-lg"
          aria-label={`${nextLabel}: ${next.slug} ${next.year}`}
        >
          <span className="hidden sm:inline">{nextLabel}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <div className="w-10" />
      )}
    </nav>
  );
}

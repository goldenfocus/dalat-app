"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { observeRentalStats } from "@/lib/rentals/stats-client";
import { rentalStatLabels, type RentalStatsCounts } from "@/lib/rentals/stats";

export function RentalPublicStats({ listingId, track = true }: { listingId: string; track?: boolean }) {
  const [result, setResult] = useState<{ id: string; counts: RentalStatsCounts }>();
  const t = useTranslations("rentalsPilot");
  const format = useFormatter();

  useEffect(
    () => observeRentalStats(listingId, track, counts => setResult(counts ? { id: listingId, counts } : undefined)),
    [listingId, track],
  );

  if (result?.id !== listingId) return null;
  return <dl aria-label={t("stats")} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {(Object.keys(rentalStatLabels) as Array<keyof RentalStatsCounts>).map(key => (
      <div key={key} className="flex flex-row-reverse items-baseline gap-1">
        <dt>{t(rentalStatLabels[key])}</dt>
        <dd className="font-medium tabular-nums text-foreground">{format.number(result.counts[key])}</dd>
      </div>
    ))}
  </dl>;
}

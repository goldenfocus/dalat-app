import { getFormatter, getTranslations } from "next-intl/server";
import { rentalStatLabels, type RentalStatsCounts } from "@/lib/rentals/stats";

export async function RentalOwnerStatCounts({ counts, locale }: { counts: RentalStatsCounts; locale: string }) {
  const [format, t] = await Promise.all([
    getFormatter({ locale }),
    getTranslations({ locale, namespace: "rentalsPilot" }),
  ]);
  return <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {(Object.keys(rentalStatLabels) as Array<keyof RentalStatsCounts>).map(key => (
      <div key={key} className="flex flex-col-reverse gap-1">
        <dt className="text-xs text-muted-foreground">{t(rentalStatLabels[key])}</dt>
        <dd className="text-lg font-semibold tabular-nums">{format.number(counts[key])}</dd>
      </div>
    ))}
  </dl>;
}

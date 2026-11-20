import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { rentalDirectionLinks, type RentalDirections } from "@/lib/rentals/directions";
import { CopyRentalAddress } from "./copy-address";

export async function RentalDirectionsPanel({ directions }: { directions: RentalDirections }) {
  const t = await getTranslations("rentalsPilot");
  const { address, map, grab } = rentalDirectionLinks(directions);
  if (!address && !map && !grab) return null;
  const button = "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm";
  return <section aria-label={t("directions")} className="space-y-2 border-t pt-4">
    {address && <p className="break-words">{address}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {map && <a href={map} target="_blank" rel="noreferrer" className={button}>
        <MapPin className="size-4" aria-hidden="true" />Google Maps
      </a>}
      {grab && <a href={grab} target="_blank" rel="noreferrer" className={button}>Grab</a>}
      {address && <CopyRentalAddress address={address} openGrab={!grab} />}
    </div>
  </section>;
}

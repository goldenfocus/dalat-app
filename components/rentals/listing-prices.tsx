import { getFormatter, getTranslations } from "next-intl/server";
import type { RentalListing } from "@/lib/rentals/data";
import { rentalDetails } from "@/lib/rentals/details";

export async function RentalListingPrices({ listing }: { listing: RentalListing }) {
  const [t, details, formatter] = await Promise.all([
    getTranslations("rentalsPilot"), getTranslations("rentalsDetails"), getFormatter(),
  ]);
  const { propertySize } = rentalDetails(listing.details);
  const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
  const prices = [["monthly", listing.monthly_rent], ["sixMonths", listing.six_month_rent], ["yearly", listing.yearly_rent]] as const;
  return <div className="space-y-2">
    <p className="flex flex-wrap gap-x-3 text-sm">
      <strong className="text-primary">{details(listing.offer_type)}</strong>
      {propertySize !== undefined && <span className="text-muted-foreground">
        {details("propertySize")} · {formatter.number(propertySize, { maximumFractionDigits: 2 })} m²
      </span>}
    </p>
    <dl className="divide-y rounded-xl bg-muted px-4 py-1">
      {listing.offer_type !== "sale" && prices.map(([term, amount]) => amount !== null && <div key={term} className="flex flex-wrap justify-between gap-x-3 py-2">
        <dt>{t(term)}</dt><dd data-rental-rate className="font-bold text-primary">{currency.format(amount)}</dd>
      </div>)}
      {listing.offer_type !== "rent" && <div className="flex flex-wrap justify-between gap-x-3 py-2">
        <dt>{details("salePrice")}</dt><dd className="font-bold text-primary">
          {listing.sale_price === null ? details("priceOnRequest") : currency.format(listing.sale_price)}
        </dd>
      </div>}
    </dl>
  </div>;
}

import { getFormatter, getTranslations } from "next-intl/server";
import type { RentalListing } from "@/lib/rentals/data";
import { rentalLeaseRates } from "@/lib/rentals/lease";
import { rentalDetails } from "@/lib/rentals/details";

export async function RentalListingPrices({ listing, locale }: { listing: RentalListing; locale: string }) {
  const [t, details, formatter] = await Promise.all([
    getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "rentalsDetails" }), getFormatter({ locale }),
  ]);
  const { propertySize } = rentalDetails(listing.details);
  const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
  const prices = rentalLeaseRates(listing);
  const minimumStay = listing.minimum_lease_months;
  const deposit = listing.deposit_months;
  return <div className="space-y-2">
    <p className="flex flex-wrap gap-x-3 text-sm">
      <strong className="text-primary">{details(listing.offer_type)}</strong>
      {propertySize !== undefined && <span className="text-muted-foreground">
        {details("propertySize")} · {formatter.number(propertySize, { maximumFractionDigits: 2 })} m²
      </span>}
    </p>
    <dl className="divide-y rounded-xl bg-muted px-4 py-1">
      {prices.map(rate => <div key={rate.months ?? "monthly"} className="flex flex-wrap justify-between gap-x-3 py-2">
        <dt>{rate.label === "leasePackage" ? t(rate.label, { count: rate.months }) : t(rate.label)}</dt>
        <dd data-rental-rate className="font-bold text-primary">{t("rentPerMonth", { amount: currency.format(rate.amount) })}</dd>
      </div>)}
      {listing.offer_type !== "sale" && minimumStay != null && <div className="flex flex-wrap justify-between gap-x-3 py-2 text-sm">
        <dt>{t("minimumStay")}</dt><dd>{t("leaseMonths", { count: minimumStay })}</dd>
      </div>}
      {listing.offer_type !== "sale" && deposit != null && <div className="flex flex-wrap justify-between gap-x-3 py-2 text-sm">
        <dt>{t("securityDeposit")}</dt><dd>{deposit === 0 ? t("noDeposit") : t("leaseMonths", { count: deposit })}</dd>
      </div>}
      {listing.offer_type !== "rent" && <div className="flex flex-wrap justify-between gap-x-3 py-2">
        <dt>{details("salePrice")}</dt><dd className="font-bold text-primary">
          {listing.sale_price === null ? details("priceOnRequest") : currency.format(listing.sale_price)}
        </dd>
      </div>}
    </dl>
  </div>;
}

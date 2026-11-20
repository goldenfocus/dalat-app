"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { rentalOfferTypes, type RentalListing } from "@/lib/rentals/data";

type Initial = Pick<RentalListing, "offer_type" | "sale_price" | "monthly_rent" | "six_month_rent" | "yearly_rent">;
const input = "min-h-11 w-full rounded-xl border bg-background px-3 text-sm";
const periods = [["monthly_rent", "monthly"], ["six_month_rent", "sixMonths"], ["yearly_rent", "yearly"]] as const;

export function RentalOfferEditor({ initial }: { initial: Initial | null }) {
  const [offer, setOffer] = useState(initial?.offer_type ?? "rent");
  const t = useTranslations("rentalsDetails");
  const pilot = useTranslations("rentalsPilot");

  return <div className="space-y-4">
    <label className="grid gap-1 text-sm">
      {t("offerType")}
      <select className={input} name="offer_type" value={offer}
        onChange={event => setOffer(event.target.value as RentalListing["offer_type"])}>
        {rentalOfferTypes.map(type => <option key={type} value={type}>{t(type)}</option>)}
      </select>
    </label>
    <fieldset hidden={offer === "sale"} disabled={offer === "sale"} className="min-w-0">
      <legend className="mb-2 font-semibold">{pilot("rent")}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {periods.map(([key, label]) => <label className="grid min-w-0 gap-1 text-sm" key={key}>
          {pilot(label)} (VND)
          <input name={key} inputMode="numeric" pattern="[0-9]+" required={key === "monthly_rent" && offer !== "sale"}
            className={input} defaultValue={initial?.[key] ?? undefined} />
        </label>)}
      </div>
    </fieldset>
    <label hidden={offer === "rent"} className={offer === "rent" ? "hidden" : "grid gap-1 text-sm"}>
      {t("salePrice")} (VND)
      <input name="sale_price" inputMode="numeric" pattern="[0-9]+" maxLength={15} disabled={offer === "rent"}
        className={input} defaultValue={initial?.sale_price ?? undefined} placeholder={t("priceOnRequest")} />
    </label>
  </div>;
}

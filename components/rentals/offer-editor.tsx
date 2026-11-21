"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { rentalOfferTypes, type RentalListing } from "@/lib/rentals/data";
import { maximumLeaseMonths, maximumLeasePackages, maximumMonthlyRent, rentalLeasePackages, standardLeasePackages } from "@/lib/rentals/lease";

type Initial = Parameters<typeof rentalLeasePackages>[0] & Pick<RentalListing, "sale_price">;
type PackageRow = { id: number; months: string; amount: string };
const input = "min-h-11 w-full rounded-xl border bg-background px-3 text-sm";
const priceLength = String(maximumMonthlyRent).length;
const monthRange = Array.from({ length: maximumLeaseMonths - 1 }, (_, index) => index + 2);

export function RentalOfferEditor({ initial }: { initial: Initial | null }) {
  const [offer, setOffer] = useState(initial?.offer_type ?? "rent");
  const [minimumStay, setMinimumStay] = useState(String(initial?.minimum_lease_months ?? ""));
  const [packages, setPackages] = useState<PackageRow[]>(() => initial
    ? rentalLeasePackages(initial).map((rate, index) => ({ id: index, months: String(rate.months), amount: String(rate.amount) }))
    : []);
  const nextPackageId = useRef(packages.length);
  const t = useTranslations("rentalsDetails");
  const pilot = useTranslations("rentalsPilot");
  const common = useTranslations("common");
  const minimumPackageLength = Math.max(2, Number(minimumStay));
  const usedDurations = new Set(packages.map(row => Number(row.months)));
  const suggestedDuration = [...standardLeasePackages.map(rate => rate.months), ...monthRange]
    .find(months => months >= minimumPackageLength && !usedDurations.has(months));
  const addPackage = () => {
    if (suggestedDuration === undefined) return;
    const id = nextPackageId.current++;
    setPackages(current => [...current, { id, months: String(suggestedDuration), amount: "" }]);
  };

  return <div className="space-y-4">
    <label className="grid gap-1 text-sm">
      {t("offerType")}
      <select className={input} name="offer_type" value={offer}
        onChange={event => setOffer(event.target.value as RentalListing["offer_type"])}>
        {rentalOfferTypes.map(type => <option key={type} value={type}>{t(type)}</option>)}
      </select>
    </label>
    <fieldset hidden={offer === "sale"} disabled={offer === "sale"} className="min-w-0 space-y-3">
      <legend className="mb-2 font-semibold">{pilot("rentCurrency")}</legend>
      <input type="hidden" name="leaseEditor" value="1" />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm">
          {pilot(Number(minimumStay) > 1 ? "monthlyRate" : "monthly")}
          <input name="monthly_rent" inputMode="numeric" pattern="[0-9]+" maxLength={priceLength}
            required={packages.length === 0} className={input} defaultValue={initial?.monthly_rent ?? undefined} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          {pilot("minimumStay")}
          <select name="minimum_lease_months" value={minimumStay}
            onChange={event => setMinimumStay(event.target.value)} className={input}>
            <option value="">{pilot("depositUnspecified")}</option>
            {[1, ...monthRange].map(months => <option key={months} value={months}>{pilot("leaseMonths", { count: months })}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          {pilot("securityDeposit")}
          <select name="deposit_months" defaultValue={initial?.deposit_months ?? ""} className={input}>
            <option value="">{pilot("depositUnspecified")}</option>
            <option value="0">{pilot("noDeposit")}</option>
            {[1, 2].map(months => <option key={months} value={months}>{pilot("leaseMonths", { count: months })}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="space-y-2 border-t pt-3">
        <legend className="sr-only">{pilot("leasePackages")}</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-hidden="true" className="text-sm font-medium">{pilot("leasePackages")}</p>
          <button type="button" disabled={packages.length >= maximumLeasePackages || suggestedDuration === undefined} onClick={addPackage}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-50">
            <Plus className="size-4" aria-hidden="true" />{pilot("addLeasePackage")}
          </button>
        </div>
        {packages.map(row => {
          const duplicate = row.months !== "" && packages.some(other =>
            row.id !== other.id && Number(row.months) === Number(other.months));
          return <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
            <label className="grid min-w-0 gap-1 text-sm">
              {pilot("leaseDuration")}
              <input name="lease_months" type="number" inputMode="numeric" min={minimumPackageLength} max={maximumLeaseMonths} step={1}
                value={row.months} required ref={element => { element?.setCustomValidity(duplicate ? pilot("duplicateLeaseDuration") : ""); }}
                onChange={event => setPackages(current => current.map(rate => rate.id === row.id ? { ...rate, months: event.target.value } : rate))}
                className={input} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {pilot("monthlyRate")}
              <input name="lease_rent" inputMode="numeric" pattern="[0-9]+" maxLength={priceLength} required
                defaultValue={row.amount} className={input} />
            </label>
            <button type="button" onClick={() => setPackages(current => current.filter(rate => rate.id !== row.id))}
              aria-label={common("remove")} className="grid size-11 place-items-center rounded-lg border">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>;
        })}
      </fieldset>
    </fieldset>
    <label hidden={offer === "rent"} className={offer === "rent" ? "hidden" : "grid gap-1 text-sm"}>
      {t("salePrice")} (VND)
      <input name="sale_price" inputMode="numeric" pattern="[0-9]+" maxLength={15} disabled={offer === "rent"}
        className={input} defaultValue={initial?.sale_price ?? undefined} placeholder={t("priceOnRequest")} />
    </label>
  </div>;
}

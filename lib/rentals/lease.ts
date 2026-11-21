import { z } from "zod";
import type { RentalListing } from "./data";

export const maximumLeaseMonths = 60;
export const maximumLeasePackages = 8;
export const maximumMonthlyRent = 1_000_000_000;
export const standardLeasePackages = [
  { months: 3, column: "three_month_rent" },
  { months: 6, column: "six_month_rent" },
  { months: 12, column: "yearly_rent" },
] as const;

export type RentalLeasePackage = { months: number; amount: number };
type LeaseFields = Pick<RentalListing, "offer_type" | "monthly_rent" | "three_month_rent" | "six_month_rent" | "yearly_rent"
  | "minimum_lease_months" | "deposit_months" | "custom_lease_rates">;

const amount = z.number().int().min(1).max(maximumMonthlyRent);
const packageSchema = z.object({ months: z.number().int().min(2).max(maximumLeaseMonths), amount }).strict();
const leasePackages = z.array(packageSchema).max(maximumLeasePackages);
const leaseForm = z.object({
  monthly_rent: amount.nullable(),
  minimum_lease_months: z.number().int().min(1).max(maximumLeaseMonths).nullable(),
  deposit_months: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable(),
  packages: leasePackages,
}).refine(({ monthly_rent, minimum_lease_months, packages }) =>
  (monthly_rent !== null || packages.length > 0)
  && new Set(packages.map(rate => rate.months)).size === packages.length
  && packages.every(rate => rate.months >= (minimum_lease_months ?? 1)));

function numberField(value: FormDataEntryValue | null | undefined): number | null {
  if (value == null || value === "") return null;
  return typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : NaN;
}

const emptyTerms = {
  monthly_rent: null, three_month_rent: null, six_month_rent: null, yearly_rent: null,
  minimum_lease_months: null, deposit_months: null, custom_lease_rates: [] as RentalLeasePackage[],
};

export function readRentalLeaseTerms(form: FormData, offer: FormDataEntryValue) {
  if (offer === "sale") return { ...emptyTerms };

  const months = form.getAll("lease_months");
  const rates = form.getAll("lease_rent");
  if (months.length !== rates.length || months.length > maximumLeasePackages) return null;
  const packages = form.has("leaseEditor")
    ? months.map((duration, index) => ({ months: numberField(duration), amount: numberField(rates[index]) }))
    : standardLeasePackages.flatMap(({ months, column }) => {
      const amount = numberField(form.get(column));
      return amount === null ? [] : [{ months, amount }];
    });
  const result = leaseForm.safeParse({
    monthly_rent: numberField(form.get("monthly_rent")),
    minimum_lease_months: numberField(form.get("minimum_lease_months")),
    deposit_months: numberField(form.get("deposit_months")),
    packages,
  });
  if (!result.success) return null;

  const byMonth = new Map(result.data.packages.map(rate => [rate.months, rate.amount]));
  return {
    monthly_rent: result.data.monthly_rent,
    minimum_lease_months: result.data.minimum_lease_months,
    deposit_months: result.data.deposit_months,
    three_month_rent: byMonth.get(3) ?? null,
    six_month_rent: byMonth.get(6) ?? null,
    yearly_rent: byMonth.get(12) ?? null,
    custom_lease_rates: result.data.packages.filter(rate => !standardLeasePackages.some(term => term.months === rate.months)),
  };
}

export function rentalLeasePackages(listing: LeaseFields): RentalLeasePackage[] {
  if (listing.offer_type === "sale") return [];
  const custom = leasePackages.safeParse(listing.custom_lease_rates);
  const standard = standardLeasePackages.flatMap(({ months, column }) => {
    const amount = listing[column];
    return amount == null ? [] : [{ months, amount }];
  });
  return [...standard, ...(custom.success ? custom.data : [])].sort((left, right) => left.months - right.months);
}

type RentalLeaseRate =
  | { months: null; amount: number; label: "monthly" | "monthlyRate" }
  | { months: number; amount: number; label: "leasePackage" };

export function rentalLeaseRates(listing: LeaseFields): RentalLeaseRate[] {
  if (listing.offer_type === "sale") return [];
  const rates: RentalLeaseRate[] = [];
  if (listing.monthly_rent != null) {
    rates.push({ months: null, amount: listing.monthly_rent, label: (listing.minimum_lease_months ?? 1) > 1 ? "monthlyRate" : "monthly" });
  }
  rates.push(...rentalLeasePackages(listing).map(rate => ({ ...rate, label: "leasePackage" as const })));
  return rates;
}

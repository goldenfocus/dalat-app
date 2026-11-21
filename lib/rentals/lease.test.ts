import { describe, expect, it } from "vitest";
import { readRentalLeaseTerms, rentalLeaseRates } from "./lease";
import type { RentalListing } from "./data";

function leaseForm(...entries: [string, string][]) {
  const form = new FormData();
  form.set("leaseEditor", "1");
  for (const [key, value] of entries) form.append(key, value);
  return form;
}

function rates(values: Partial<RentalListing>) {
  return rentalLeaseRates({
    offer_type: "rent", monthly_rent: null, yearly_rent: null, six_month_rent: null, ...values,
  });
}

describe("rental lease terms", () => {
  it("keeps older month-to-month, 6-month and annual rates", () => {
    expect(rates({ monthly_rent: 12_000_000, six_month_rent: 11_000_000, yearly_rent: 10_000_000 })).toEqual([
      { months: null, amount: 12_000_000, label: "monthly" },
      { months: 6, amount: 11_000_000, label: "leasePackage" },
      { months: 12, amount: 10_000_000, label: "leasePackage" },
    ]);
  });

  it("saves fixed, custom and optional deposit terms independently for a combined listing", () => {
    const form = leaseForm(["minimum_lease_months", "3"], ["deposit_months", "2"],
      ["lease_months", "18"], ["lease_rent", "11000000"], ["lease_months", "3"], ["lease_rent", "15000000"]);
    const saved = readRentalLeaseTerms(form, "both");
    expect(saved).toMatchObject({
      monthly_rent: null, minimum_lease_months: 3, deposit_months: 2, three_month_rent: 15_000_000,
      custom_lease_rates: [{ months: 18, amount: 11_000_000 }],
    });
    expect(rates({ ...saved, offer_type: "both" })).toEqual([
      { months: 3, amount: 15_000_000, label: "leasePackage" },
      { months: 18, amount: 11_000_000, label: "leasePackage" },
    ]);
  });

  it("supports month-to-month only and distinguishes zero deposit from unspecified", () => {
    const form = leaseForm(["monthly_rent", "12500000"], ["deposit_months", "0"]);
    expect(readRentalLeaseTerms(form, "rent")).toMatchObject({
      monthly_rent: 12_500_000, deposit_months: 0, minimum_lease_months: null,
      three_month_rent: null, six_month_rent: null, yearly_rent: null, custom_lease_rates: [],
    });
    const fixed = rates({ monthly_rent: 12_500_000, minimum_lease_months: 3 });
    expect(fixed[0].label).toBe("monthlyRate");
  });

  it("rejects missing, duplicate, invalid and too-short packages", () => {
    const tooShort = leaseForm(["minimum_lease_months", "6"], ["lease_months", "3"], ["lease_rent", "14000000"]);
    const duplicate = leaseForm(["monthly_rent", "16000000"], ["lease_months", "3"], ["lease_rent", "15000000"],
      ["lease_months", "03"], ["lease_rent", "14000000"]);
    expect(readRentalLeaseTerms(tooShort, "rent")).toBeNull();
    expect(readRentalLeaseTerms(duplicate, "rent")).toBeNull();
    expect(readRentalLeaseTerms(leaseForm(["lease_months", "3"]), "rent")).toBeNull();
    expect(readRentalLeaseTerms(leaseForm(["monthly_rent", "1e7"]), "rent")).toBeNull();
    expect(readRentalLeaseTerms(leaseForm(), "rent")).toBeNull();
  });

  it("clears rental terms on sale-only listings", () => {
    const form = leaseForm(["minimum_lease_months", "3"], ["deposit_months", "1"],
      ["lease_months", "3"], ["lease_rent", "15000000"]);
    expect(readRentalLeaseTerms(form, "sale")).toEqual({
      monthly_rent: null, minimum_lease_months: null, deposit_months: null, three_month_rent: null,
      six_month_rent: null, yearly_rent: null, custom_lease_rates: [],
    });
    expect(rates({ offer_type: "sale", monthly_rent: 15_000_000 })).toEqual([]);
  });
});

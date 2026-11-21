import { z } from "zod";

export const pilotListingId = "c7725f24-49f5-469f-b95f-417b7e5ec3d3";
export const pilotMedia = "/rentals/king-paradise";
export const rentalColumns = "id,host_id,title,description,source_locale,monthly_rent,three_month_rent,six_month_rent,yearly_rent,custom_lease_rates,minimum_lease_months,deposit_months,photos,videos,offer_type,sale_price,status,details,tour_frames,slug,updated_at";
export const rentalOfferTypes = ["rent", "sale", "both"] as const;

export type RentalListing = {
  id: string;
  slug?: string | null;
  updated_at?: string;
  host_id: string;
  title: string;
  description: string;
  source_locale: string;
  monthly_rent: number | null;
  three_month_rent?: number | null;
  custom_lease_rates?: unknown;
  minimum_lease_months?: number | null;
  deposit_months?: number | null;
  offer_type: typeof rentalOfferTypes[number];
  sale_price: number | null;
  six_month_rent: number | null;
  yearly_rent: number | null;
  photos: string[];
  videos: string[];
  details: unknown;
  tour_frames?: unknown;
  status: "draft" | "published";
};
export type RentalVisit = {
  id: string;
  listing_id: string | null;
  renter_id: string;
  slot_id: string | null;
  starts_at: string | null;
  status: "pending" | "proposed" | "confirmed" | "declined" | "cancelled";
};

export type RentalViewingThread = RentalVisit & { archived_listing_id: string | null };

export const rentalId = z.uuid();
export const isRentalPhotoPath = (value: string) =>
  /^\/api\/rentals\/photos\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(value);
export const safeRentalPhoto = (value: string) =>
  /^\/rentals\/king-paradise\/photo-[1-6]\.webp$/.test(value) || isRentalPhotoPath(value);

export function dalatViewingTime(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + ":00+07:00");
  return Number.isFinite(timestamp) && timestamp > Date.now() ? new Date(timestamp).toISOString() : null;
}

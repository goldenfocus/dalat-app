import { z } from "zod";

export const pilotListingId = "c7725f24-49f5-469f-b95f-417b7e5ec3d3";
export const pilotMedia = "/rentals/king-paradise";
export const rentalColumns = "id,host_id,title,description,source_locale,monthly_rent,six_month_rent,yearly_rent,photos,status,details";

export type RentalListing = {
  id: string;
  host_id: string;
  title: string;
  description: string;
  source_locale: string;
  monthly_rent: number;
  six_month_rent: number | null;
  yearly_rent: number | null;
  photos: string[];
  details: unknown;
  status: "draft" | "published";
};
export type RentalVisit = {
  id: string;
  listing_id: string;
  renter_id: string;
  slot_id: string | null;
  starts_at: string | null;
  status: "pending" | "proposed" | "confirmed" | "declined" | "cancelled";
};

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

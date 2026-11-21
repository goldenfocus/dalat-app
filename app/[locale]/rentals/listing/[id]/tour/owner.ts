import { notFound } from "next/navigation";
import { rentalColumns, rentalId, type RentalListing } from "@/lib/rentals/data";
import { createClient } from "@/lib/supabase/server";

export async function readOwnedRentalTour(id: string) {
  if (!rentalId.safeParse(id).success) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data } = await db.from("rental_listings").select(rentalColumns)
    .eq("id", id).eq("host_id", user.id).maybeSingle();
  if (!data) notFound();
  return { db, listing: data as RentalListing, ownerId: user.id };
}

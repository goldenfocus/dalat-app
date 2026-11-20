import { notFound } from "next/navigation";
import { rentalId } from "@/lib/rentals/data";
import { createClient } from "@/lib/supabase/server";

export async function ownerRentalDirections(id: string) {
  if (!rentalId.safeParse(id).success) notFound();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data: listing } = await db.from("rental_listings").select("id,title").eq("id", id).eq("host_id", user.id).maybeSingle();
  if (!listing) notFound();
  return { db, listing };
}

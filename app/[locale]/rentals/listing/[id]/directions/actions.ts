"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect, type Locale } from "@/lib/i18n/routing";
import { rentalDirectionsSchema } from "@/lib/rentals/directions";
import { ownerRentalDirections } from "./owner";

export async function saveRentalDirections(id: string, form: FormData) {
  const { db } = await ownerRentalDirections(id);
  const locale = await getLocale() as Locale;
  const path = "/rentals/listing/" + id;
  const fields = rentalDirectionsSchema.safeParse({
    address: form.get("address"), maps_url: form.get("maps_url"), grab_url: form.get("grab_url"),
    is_public: form.get("visibility") === "public",
  });
  if (!fields.success) return redirect({ href: path + "/directions?error=links", locale });
  const { data, error } = await db.from("rental_directions").upsert({ listing_id: id, ...fields.data }).select("listing_id").maybeSingle();
  revalidatePath("/[locale]/rentals/listing/[id]", "page");
  redirect({ href: data && !error ? path : path + "/directions?error=1", locale });
}

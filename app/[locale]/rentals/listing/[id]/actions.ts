"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect, type Locale } from "@/lib/i18n/routing";
import { rentalId } from "@/lib/rentals/data";
import { createClient } from "@/lib/supabase/server";

export async function publishSavedRental(form: FormData) {
  const id = rentalId.safeParse(form.get("listing"));
  const status = form.get("status");
  if (!id.success || (status !== "draft" && status !== "published")) notFound();
  const locale = await getLocale() as Locale;
  const path = "/rentals/listing/" + id.data;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) notFound();
  const { data, error } = await db.from("rental_listings").update({ status })
    .eq("id", id.data).eq("host_id", user.id).select("id").maybeSingle();
  revalidatePath("/[locale]/rentals", "page");
  revalidatePath("/[locale]/rentals/listing/[id]", "page");
  redirect({ href: data && !error ? path : path + "?error=1", locale });
}

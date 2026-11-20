"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { redirect, type Locale } from "@/lib/i18n/routing";
import { dalatViewingTime, rentalId } from "@/lib/rentals/data";
import { createClient } from "@/lib/supabase/server";

async function viewingAction(id: string) {
  if (!rentalId.safeParse(id).success) notFound();
  const locale = await getLocale() as Locale;
  const path = "/rentals/viewings/" + id;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const next = (locale === "en" ? "" : "/" + locale) + path;
    return redirect({ href: "/auth/login?next=" + encodeURIComponent(next), locale });
  }
  return { db, locale, path };
}

function finishViewing(path: string, locale: Locale, ok: boolean) {
  revalidatePath("/[locale]/rentals", "page");
  revalidatePath("/[locale]/rentals/listing/[id]", "page");
  revalidatePath("/[locale]/rentals/viewings/[id]", "page");
  redirect({ href: ok ? path : path + "?error=1", locale });
}

export async function sendViewingMessage(id: string, form: FormData) {
  const { db, locale, path } = await viewingAction(id);
  const message = z.string().trim().min(1).max(2000).safeParse(form.get("body"));
  const result = message.success
    ? await db.from("rental_visit_events").insert({ visit_id: id, body: message.data })
    : null;
  finishViewing(path, locale, !!result && !result.error);
}

export async function changeViewingStatus(id: string, form: FormData) {
  const { db, locale, path } = await viewingAction(id);
  const next = z.enum(["confirmed", "proposed", "declined", "cancelled"]).safeParse(form.get("next"));
  const reason = z.string().trim().max(250).safeParse(form.get("reason") ?? "");
  const result = !next.success || !reason.success ? null : next.data === "declined"
    ? await db.rpc("rental_decline_viewing", { visit: id, reason: reason.data, unlist: form.get("unlist") === "on" })
    : await db.rpc("rental_update_viewing", {
      visit: id, next_status: next.data,
      proposed_time: next.data === "proposed" ? dalatViewingTime(form.get("proposed_time")) : null,
    });
  finishViewing(path, locale, !result?.error && result?.data === true);
}

export async function proposeViewingTime(id: string, form: FormData) {
  const { db, locale, path } = await viewingAction(id);
  const slot = rentalId.nullable().safeParse(form.get("slot") || null);
  const time = dalatViewingTime(form.get("proposed_time"));
  const result = slot.success && (slot.data || time)
    ? await db.rpc("rental_propose_reschedule", { visit: id, chosen_slot: slot.data, requested_at: time })
    : null;
  finishViewing(path, locale, !result?.error && result?.data === true);
}

export async function answerViewingTime(id: string, form: FormData) {
  const { db, locale, path } = await viewingAction(id);
  const choice = z.enum(["accept", "keep", "withdraw"]).safeParse(form.get("decision"));
  const result = choice.success ? await db.rpc("rental_answer_reschedule", { visit: id, decision: choice.data }) : null;
  finishViewing(path, locale, !result?.error && result?.data === true);
}

export async function offerReplacementViewing(id: string, form: FormData) {
  const { db, locale, path } = await viewingAction(id);
  const time = dalatViewingTime(form.get("proposed_time"));
  const result = time ? await db.rpc("rental_offer_replacement", { visit: id, requested_at: time }) : null;
  const next = rentalId.safeParse(result?.data);
  finishViewing(next.success ? "/rentals/viewings/" + next.data : path, locale, next.success);
}

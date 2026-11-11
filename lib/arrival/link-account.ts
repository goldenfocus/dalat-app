import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attach this browser's guest check-in to the account that just signed in.
 *
 * Ownership is proven by the HttpOnly guest receipt cookie plus the session,
 * never by an email or a name. The row keeps its ID, so the practice table,
 * order and receipt code stay exactly as they were. An account that already
 * has its own arrival keeps it and the guest row is left untouched.
 * Failures are reported as `false`: linking must never break the receipt.
 */
export async function linkGuestArrival(admin: SupabaseClient, eventId: string, userId: string, guestHash: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(guestHash)) return false;
  try {
    const guest = await admin.from("event_arrival_participants").select("id,user_id")
      .eq("event_id", eventId).eq("token_hash", guestHash).maybeSingle();
    if (guest.error || !guest.data || guest.data.user_id) return false;
    const own = await admin.from("event_arrival_participants").select("id")
      .eq("event_id", eventId).eq("user_id", userId).maybeSingle();
    if (own.error || own.data) return false;
    // The null guard makes two racing requests harmless; UNIQUE(event_id,user_id)
    // rejects a second arrival for the account (23505) and both rows stay as-is.
    const linked = await admin.from("event_arrival_participants").update({ user_id: userId })
      .eq("id", guest.data.id).eq("event_id", eventId).is("user_id", null).select("id");
    return !linked.error && (linked.data?.length ?? 0) === 1;
  } catch { return false; }
}

import type { LanguageLevel, LanguagePreferences as LegacyLanguagePreferences } from "./legacy-languages";
import type { MenuSection } from "@/lib/menu/types";
import type { LanguagePreferences } from "./languages";

export type ArrivalAccess = { canWelcome: boolean; canOrder: boolean; canManage: boolean };
export type ArrivalParticipant = {
  id: string;
  event_id: string;
  user_id: string | null;
  nickname: string;
  practice_language: "english" | "vietnamese" | "both";
  english_level: LanguageLevel | null;
  vietnamese_level: LanguageLevel | null;
  checked_in_at: string;
  language_preferences?: LanguagePreferences | null;
};
export type ArrivalOrder = {
  id: string;
  participant_id: string | null;
  user_id: string | null;
  status: "pending" | "confirmed" | "fulfilled" | "cancelled";
  total_vnd: number;
  sponsored_vnd?: number;
  guest_due_vnd?: number;
  sponsor_status?: "none" | "reserved" | "owed" | "settled" | "void";
  sponsor_item_id?: string | null;
  sponsor_settled_at?: string | null;
  ready_for_preparation?: boolean;
  note: string | null;
  paid_at: string | null;
  created_at: string;
  items: { menu_item_id: string | null; name_snapshot: string; qty: number; unit_price_vnd: number }[];
  guestName?: string;
};
export type ArrivalReceipt = { participant: ArrivalParticipant; order: ArrivalOrder | null };
export type ArrivalEvent = { id: string; slug: string; title: string; startsAt: string; venueName: string; orderingEnabled: boolean; isOpen: boolean; sponsorship?: { sponsorName: string; eligibleItemIds: string[] } | null };
export type ArrivalContext = {
  event: ArrivalEvent;
  menu: MenuSection[];
  profile: { name: string } | null;
  preferences?: LegacyLanguagePreferences | null;
  receipt: ArrivalReceipt | null;
  priorOrder?: ArrivalOrder | null;
  rsvpStatus?: string | null;
  access: ArrivalAccess;
};
export type StaffArrivalContext = Omit<ArrivalContext, "receipt" | "profile"> & {
  sponsorAccounting?: { reserved_vnd: number; owed_vnd: number; settled_vnd: number } | null;
  participants: ArrivalParticipant[];
  orders: ArrivalOrder[];
  staff: { user_id: string; role: "welcome" | "orders" | "manager"; displayName: string; username: string | null }[];
  rsvps: { id: string; user_id: string; displayName: string; username: string | null; checked_in_at: string | null; preferences?: LegacyLanguagePreferences | null; languagePreferences?: LanguagePreferences | null }[];
};

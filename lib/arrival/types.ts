import type { MenuSection } from "@/lib/menu/types";

export type ArrivalAccess = { canWelcome: boolean; canOrder: boolean; canManage: boolean };
export type ArrivalParticipant = {
  id: string;
  event_id: string;
  user_id: string | null;
  nickname: string;
  practice_language: "english" | "vietnamese" | "both";
  english_level: "starting" | "some" | "comfortable" | null;
  vietnamese_level: "starting" | "some" | "comfortable" | null;
  checked_in_at: string;
};
export type ArrivalOrder = {
  id: string;
  participant_id: string | null;
  user_id: string | null;
  status: "pending" | "confirmed" | "fulfilled" | "cancelled";
  total_vnd: number;
  note: string | null;
  paid_at: string | null;
  created_at: string;
  items: { menu_item_id: string | null; name_snapshot: string; qty: number; unit_price_vnd: number }[];
  guestName?: string;
};
export type ArrivalReceipt = { participant: ArrivalParticipant; order: ArrivalOrder | null };
export type ArrivalEvent = { id: string; slug: string; title: string; startsAt: string; venueName: string; orderingEnabled: boolean; isOpen: boolean };
export type ArrivalContext = {
  event: ArrivalEvent;
  menu: MenuSection[];
  profile: { name: string } | null;
  receipt: ArrivalReceipt | null;
  priorOrder?: ArrivalOrder | null;
  access: ArrivalAccess;
};
export type StaffArrivalContext = Omit<ArrivalContext, "receipt" | "profile"> & {
  participants: ArrivalParticipant[];
  orders: ArrivalOrder[];
  staff: { user_id: string; role: "welcome" | "orders" | "manager"; displayName: string; username: string | null }[];
  rsvps: { id: string; user_id: string; displayName: string; username: string | null; checked_in_at: string | null }[];
};

import type { ArrivalParticipant, ArrivalOrder, StaffArrivalContext } from "@/lib/arrival/types";

export type PracticeLanguage = ArrivalParticipant["practice_language"];
export type LanguageLevel = NonNullable<ArrivalParticipant["english_level"]>;
export type OrderStatus = ArrivalOrder["status"];
export type HostParticipant = ArrivalParticipant;
export type HostRsvp = StaffArrivalContext["rsvps"][number];
export type HostOrder = ArrivalOrder;
export type HostStaff = StaffArrivalContext["staff"][number];
export type HostData = StaffArrivalContext;
export type HostAction = (body: Record<string, unknown>) => Promise<boolean>;

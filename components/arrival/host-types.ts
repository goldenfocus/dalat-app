import type { ArrivalParticipant, ArrivalOrder, StaffArrivalContext } from "@/lib/arrival/types";

export type PracticeLanguage = ArrivalParticipant["practice_language"];
export type LanguageLevel = NonNullable<ArrivalParticipant["english_level"]>;
export type OrderStatus = ArrivalOrder["status"];
export type HostParticipant = ArrivalParticipant;
export type HostRsvp = StaffArrivalContext["rsvps"][number];
export type HostOrder = ArrivalOrder;
export type HostStaff = StaffArrivalContext["staff"][number];
/** `doorKey` is present only for welcome staff; it marks a QR scan as made at the venue. */
export type HostData = StaffArrivalContext & { doorKey?: string | null };
export type HostAction = (body: Record<string, unknown>) => Promise<boolean>;

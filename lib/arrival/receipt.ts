import type { ArrivalAccess, ArrivalReceipt } from "./types";

/** Welcoming staff can check in an RSVP without reading its private order. */
export function visibleArrivalReceipt(receipt: ArrivalReceipt, staffEntry: boolean, access: ArrivalAccess): ArrivalReceipt {
  return staffEntry && !access.canOrder ? { participant: receipt.participant, order: null } : receipt;
}

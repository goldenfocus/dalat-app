import { describe, expect, it } from "vitest";
import { visibleArrivalReceipt } from "./receipt";
import type { ArrivalReceipt } from "./types";

describe("arrival receipt permissions", () => {
  const receipt = { participant: { id: "guest" }, order: { id: "order", note: "Private order note", phone: "Private phone" } } as unknown as ArrivalReceipt;
  it("does not expose order details through assisted check-in to welcoming-only staff", () => {
    expect(visibleArrivalReceipt(receipt, true, { canWelcome: true, canOrder: false, canManage: false })).toEqual({ participant: receipt.participant, order: null });
    expect(receipt.order).not.toBeNull();
  });
  it("keeps their own receipt available to guests and authorized order takers", () => {
    expect(visibleArrivalReceipt(receipt, false, { canWelcome: false, canOrder: false, canManage: false })).toBe(receipt);
    expect(visibleArrivalReceipt(receipt, true, { canWelcome: true, canOrder: true, canManage: false })).toBe(receipt);
  });
});

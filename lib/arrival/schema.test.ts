import { describe, expect, it } from "vitest";
import { arrivalSchema, staffActionSchema } from "./schema";

const requestId = "a1000000-0000-4000-8000-000000000001";
const itemId = "a2000000-0000-4000-8000-000000000001";
const guest = { requestId, nickname: " Vi ", practiceLanguage: "vietnamese", englishLevel: "comfortable", vietnameseLevel: "starting", items: [{ item_id: itemId, qty: 1 }] };

describe("arrival request boundary", () => {
  it("accepts and normalizes a guest without an account", () => {
    expect(arrivalSchema.parse(guest)).toMatchObject({ nickname: "Vi", staffEntry: false });
  });
  it("rejects a guest impersonating another account or participant", () => {
    expect(arrivalSchema.safeParse({ ...guest, userId: requestId }).success).toBe(false);
    expect(arrivalSchema.safeParse({ ...guest, participantId: requestId }).success).toBe(false);
  });
  it("rejects client prices, duplicate lines and invalid quantities", () => {
    expect(arrivalSchema.safeParse({ ...guest, total_vnd: 1 }).success).toBe(false);
    expect(arrivalSchema.safeParse({ ...guest, items: [{ item_id: itemId, qty: 1, price: 1 }] }).success).toBe(false);
    expect(arrivalSchema.safeParse({ ...guest, items: [...guest.items, ...guest.items] }).success).toBe(false);
    for (const qty of [0, 21, -1, 1.5]) expect(arrivalSchema.safeParse({ ...guest, items: [{ item_id: itemId, qty }] }).success).toBe(false);
  });
  it("allows a no-order arrival and explicit assisted identity", () => {
    expect(arrivalSchema.safeParse({ ...guest, items: [] }).success).toBe(true);
    expect(arrivalSchema.safeParse({ ...guest, staffEntry: true, userId: requestId }).success).toBe(true);
  });
  it("requires expected status for concurrent staff transitions", () => {
    const transition = { action: "setOrderStatus", orderId: itemId, status: "confirmed" };
    expect(staffActionSchema.safeParse(transition).success).toBe(false);
    expect(staffActionSchema.safeParse({ ...transition, expectedStatus: "pending" }).success).toBe(true);
  });
  it("keeps payment independent and refuses arbitrary account roles", () => {
    expect(staffActionSchema.safeParse({ action: "setPaid", orderId: itemId, paid: true }).success).toBe(true);
    expect(staffActionSchema.safeParse({ action: "addStaff", username: "vi", role: "admin" }).success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { planSchema, submissionSchema, emptyPlan } from "./plan";
import en from "@/messages/phuong/v2/en.json";
import vi from "@/messages/phuong/v2/vi.json";
import fr from "@/messages/phuong/v2/fr.json";
describe("private V2 plan", () => {
  it("starts without consent, a promised drink count or invented time", () => {
    expect(emptyPlan()).toMatchObject({
      birthday: null,
      startTime: "",
      rsvpCap: "",
      drink: "maybe",
    });
  });
  it("rejects invalid amounts and oversized private text", () => {
    expect(planSchema.safeParse({ revenue: "-50" }).success).toBe(false);
    expect(planSchema.safeParse({ notes: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
  it("requires a valid idempotency key and version", () => {
    expect(
      submissionSchema.safeParse({ plan: {}, action: "decision" }).success,
    ).toBe(false);
  });
  it("keeps matching reviewed translations and stable option indices", () => {
    for (const copy of [vi, fr]) {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(en).sort());
      expect(copy.choices).toHaveLength(5);
      expect(copy.vibes).toHaveLength(en.vibes.length);
      expect(copy.activityChoices).toHaveLength(en.activityChoices.length);
    }
  });
});

import { z } from "zod";

import { languageLevelSchema } from "./legacy-languages";
import { languagePreferencesSchema } from "./languages";

const orderItem = z.object({ item_id: z.uuid(), qty: z.number().int().min(1).max(20), selected_options: z.record(z.string().max(40), z.string().max(40)).refine(v => Object.keys(v).length <= 8).optional() }).strict();
const orderKey = (item: z.infer<typeof orderItem>) => item.item_id + JSON.stringify(Object.entries(item.selected_options || {}).sort());

const level = languageLevelSchema.nullable().optional();
export const arrivalSchema = z.object({
  requestId: z.uuid(),
  nickname: z.string().trim().min(1).max(80),
  practiceLanguage: z.enum(["english", "vietnamese", "both"]),
  englishLevel: level,
  vietnameseLevel: level,
  items: z.array(orderItem).max(30).default([]),
  note: z.string().trim().max(500).optional().default(""),
  sponsoredItemId: z.uuid().optional(),
  staffEntry: z.boolean().optional().default(false),
  userId: z.uuid().optional(),
  participantId: z.uuid().optional(),
  // Printed on the host's door QR only. Proves presence; never forwarded to the database.
  doorKey: z.string().max(64).optional(),
  languagePreferences: languagePreferencesSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.staffEntry && (value.userId || value.participantId)) {
    ctx.addIssue({ code: "custom", message: "invalid_identity" });
  }
  if (new Set(value.items.map(orderKey)).size !== value.items.length) {
    ctx.addIssue({ code: "custom", message: "duplicate_items" });
  }
});

export const reservationSchema = z.object({
  requestId: z.uuid(),
  items: z.array(orderItem).min(1).max(30),
  note: z.string().trim().max(500).optional().default(""),
  sponsoredItemId: z.uuid().optional(),
}).strict().refine((value) => new Set(value.items.map(orderKey)).size === value.items.length, "duplicate_items");

export const staffActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setOrderStatus"), orderId: z.uuid(), status: z.enum(["pending", "confirmed", "fulfilled", "cancelled"]), expectedStatus: z.enum(["pending", "confirmed", "fulfilled", "cancelled"]) }).strict(),
  z.object({ action: z.literal("settleSponsor"), orderId: z.uuid() }).strict(),
  z.object({ action: z.literal("setPaid"), orderId: z.uuid(), paid: z.boolean() }).strict(),
  z.object({ action: z.literal("addStaff"), username: z.string().trim().min(1).max(80), role: z.enum(["welcome", "orders", "manager"]) }).strict(),
  z.object({ action: z.literal("removeStaff"), userId: z.uuid() }).strict(),
]);

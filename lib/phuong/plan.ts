import { z } from "zod";
export const birthdayChoices = [
  "yes",
  "maybe",
  "date",
  "idea",
  "private",
] as const;
const text = z.string().max(2000).default("");
const amount = z
  .string()
  .max(12)
  .regex(/^\d*(\.\d{1,2})?$/)
  .default("");
export const planSchema = z.object({
  birthday: z.enum(birthdayChoices).nullable().default(null),
  birthdayPlans: text,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-09-19"),
  alternative: text,
  normalExperiment: z.boolean().default(false),
  responsibilities: text,
  capacity: amount,
  customers: amount,
  revenue: amount,
  spend: amount,
  greatNight: text,
  channels: z.array(z.string().max(40)).max(10).default([]),
  workflow: text,
  timeSink: text,
  pain: text,
  aiHelp: text,
  extraHours: text,
  customerSources: text,
  quietNights: text,
  eventName: z.string().max(160).default(""),
  startTime: z
    .string()
    .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
    .default(""),
  vibe: z.array(z.string().max(40)).max(10).default([]),
  rsvpCap: amount,
  drink: z.enum(["yes", "no", "maybe"]).default("maybe"),
  drinkNotes: text,
  activities: z.array(z.string().max(40)).max(10).default([]),
  notes: text,
  actualCustomers: amount,
  actualRevenue: amount,
  outcome: text,
});
export type Plan = z.infer<typeof planSchema>;
export const emptyPlan = (): Plan => planSchema.parse({});
export const submissionSchema = z.object({
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  action: z.enum(["decision", "baseline", "brief", "results"]),
  plan: planSchema,
});
export const messageSchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().trim().min(1).max(3000),
});

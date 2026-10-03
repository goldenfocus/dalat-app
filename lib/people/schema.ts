import { z } from "zod";
import { PEOPLE_INTENTIONS, PEOPLE_INTERESTS, PEOPLE_LANGUAGES, PEOPLE_REPORT_REASONS } from "./constants";

const distinct = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max).refine((values) => new Set(values).size === values.length);

export const peopleProfileSchema = z.object({
  enabled: z.boolean(),
  intentions: distinct(z.enum(PEOPLE_INTENTIONS), PEOPLE_INTENTIONS.length),
  interests: distinct(z.enum(PEOPLE_INTERESTS), PEOPLE_INTERESTS.length),
  languages: distinct(z.enum(PEOPLE_LANGUAGES), PEOPLE_LANGUAGES.length),
  help_offered: z.string().trim().max(500),
  help_wanted: z.string().trim().max(500),
  source_locale: z.enum(PEOPLE_LANGUAGES).nullable(),
}).strict();

// A dedicated opt-out operation cannot accidentally overwrite draft fields.
export const peoplePauseSchema = z.object({ enabled: z.literal(false) }).strict();
export const personTargetSchema = z.object({ user_id: z.uuid() }).strict();
export const peopleEventSchema = z.object({ event_id: z.uuid() }).strict();
export const peopleReportSchema = personTargetSchema.extend({
  reason: z.enum(PEOPLE_REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
}).strict();
export const peopleReviewSchema = z.object({
  id: z.uuid(),
  status: z.literal("reviewed"),
}).strict();

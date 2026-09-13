import { z } from "zod";
import { CONTENT_LOCALES as locales } from "@/lib/types";

export const categories = [
  "food",
  "coffee",
  "wellness",
  "outdoors",
  "culture",
  "stay",
  "other",
] as const;
export const observationSchema = z.object({
  subject: z.string().max(100),
  value: z.string().max(600),
  context: z.string().max(300),
  source_type: z.enum([
    "firsthand",
    "impression",
    "inferred",
    "owner_supplied",
  ]),
  evidence: z.string().max(600),
  confidence: z.number().min(0).max(1),
});
export const storySchema = z.object({
  title: z.string().max(160),
  narrative: z.string().max(12000),
  summary: z.string().max(500),
  venue_name: z.string().max(200),
  venue_address: z.string().max(400),
  category: z.enum(categories),
  tags: z.array(z.string().max(50)).max(12),
  original_language: z.enum(locales),
  observations: z.array(observationSchema).max(25),
  optional_question: z.string().max(300),
  photos: z
    .array(
      z.object({
        id: z.string().uuid(),
        alt: z.string().max(300),
        caption: z.string().max(400),
      }),
    )
    .max(12),
});
export type ExperienceStory = z.infer<typeof storySchema>;
export const saveSchema = z.object({
  title: z.string().max(160),
  narrative: z.string().max(12000),
  summary: z.string().max(500),
  venue_name: z.string().max(200),
  venue_address: z.string().max(400),
  venue_id: z.string().uuid().nullable(),
  visit_date: z.iso.date(),
  category: z.enum(categories),
  tags: z.array(z.string().max(50)).max(12),
  original_language: z.enum(locales),
  observations: z.array(observationSchema).max(25),
  selected_media: z.array(z.string().uuid()).max(12),
  photos: storySchema.shape.photos,
  permission_confirmed: z.boolean(),
  venue_confirmed: z.boolean(),
  sponsorship: z.string().max(300),
});
export const emptyStory = (locale: (typeof locales)[number]) => ({
  title: "",
  narrative: "",
  summary: "",
  venue_name: "",
  venue_address: "",
  category: "other" as const,
  tags: [],
  original_language: locale,
  observations: [],
  optional_question: "",
  photos: [],
});
export function audioFormat(mime: string) {
  const type = mime.split(";")[0];
  return (
    {
      "audio/mp4": "m4a",
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/mpeg": "mp3",
    } as Record<string, string>
  )[type];
}
export function canonicalExperience(id: string, locale: string) {
  return `https://dalat.app${locale === "en" ? "" : "/" + locale}/experiences/${id}`;
}

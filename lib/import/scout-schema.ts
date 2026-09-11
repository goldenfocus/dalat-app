import { z } from "zod";
import { parsePublicHttpUrl } from "./safe-url";

export const AI_VISUAL_DISCLOSURE_ALT =
  "AI-generated illustrative image of the verified event in Đà Lạt; not an actual event photograph.";
export const AI_VISUAL_DISCLOSURE_CAPTION =
  "AI-generated illustrative image by DaLat.app; not an actual event photograph.";

const httpUrl = z
  .string()
  .trim()
  .min(8)
  .max(2_000)
  .refine((value) => parsePublicHttpUrl(value) !== null, {
    message: "URL must be public http(s) without credentials",
  });

const visualProvenance = z.enum(["owner_authorized_source", "ai_generated"]);

export const scoutIngestSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(20_000),
    starts_at: z.string().trim().min(10).max(40).optional(),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .optional(),
    time: z
      .string()
      .trim()
      .regex(/^\d{1,2}:\d{2}$/, "time must be HH:MM")
      .optional(),
    ends_at: z.string().trim().min(10).max(40).optional(),
    venue: z.string().trim().min(2).max(200).optional(),
    location_name: z.string().trim().min(2).max(200).optional(),
    address: z.string().trim().min(3).max(400).optional(),
    google_maps_url: httpUrl.optional(),
    source_url: httpUrl,
    source_platform: z.string().trim().min(1).max(40).optional(),
    source_locale: z.string().trim().min(2).max(8).optional(),
    source_image_urls: z.array(httpUrl).max(6).optional(),
    promo_image_urls: z.array(httpUrl).max(6).optional(),
    visual_provenance: visualProvenance.optional(),
    image_alt: z.string().trim().min(8).max(300).optional(),
    image_caption: z.string().trim().min(8).max(600).optional(),
    visual_gap_reason: z.string().trim().min(8).max(400).optional(),
    organizer_name: z.string().trim().min(2).max(160).optional(),
    /** Ignored — scout/WhatsApp inserts are always drafts. */
    publish: z.boolean().optional(),
    status: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (!value.starts_at && !value.date) {
      context.addIssue({
        code: "custom",
        path: ["starts_at"],
        message: "Provide starts_at or date (+ optional time in Asia/Ho_Chi_Minh)",
      });
    }
    if (!value.venue && !value.location_name) {
      context.addIssue({
        code: "custom",
        path: ["location_name"],
        message: "Provide venue or location_name from the source",
      });
    }
    if (value.source_platform?.toLowerCase() === "activity-graph") {
      context.addIssue({
        code: "custom",
        path: ["source_platform"],
        message: "Activity Graph is a separate auto-publish lane",
      });
    }
    const hasSourceImages = (value.source_image_urls?.length ?? 0) > 0;
    const hasPromoImages = (value.promo_image_urls?.length ?? 0) > 0;
    const hasVisualGapReason = Boolean(value.visual_gap_reason);
    if (!hasSourceImages && !hasPromoImages && !hasVisualGapReason) {
      context.addIssue({
        code: "custom",
        path: ["source_image_urls"],
        message:
          "Provide source_image_urls, promo_image_urls, or visual_gap_reason",
      });
    }
  });

export type ScoutIngestInput = z.infer<typeof scoutIngestSchema>;

export const reviewIngestSchema = z.object({
  action: z.enum(["evaluate", "publish", "qa"]),
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).optional(),
}).superRefine((value, context) => {
  if (!value.id && !value.slug) {
    context.addIssue({
      code: "custom",
      path: ["id"],
      message: "Provide id or slug",
    });
  }
});

export type ReviewIngestInput = z.infer<typeof reviewIngestSchema>;

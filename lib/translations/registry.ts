import { metadataLabels } from "./metadata-labels";
/** Every public text surface must declare its source here and render an OriginalText control. */
// Event arrival nicknames, staff membership and order notes are private operational
// data: never enqueue them. Arrival menus reuse the public menu_item/menu_section
// sources below, including their transactional invalidation and original controls.
export const TRANSLATION_SOURCES = [
  {
    type: "venue",
    table: "venues",
    fields: ["description", "photos", "tags"],
    locale: "source_locale",
    filters: [],
  },
  {
    type: "organizer",
    table: "organizers",
    fields: ["description"],
    filters: [],
  },
  {
    type: "tribe",
    table: "tribes",
    fields: ["description"],
    filters: [["is_listed", true]],
    inFilter: ["access_type", ["public", "request"]],
  },
  {
    type: "experience",
    table: "experiences",
    fields: [
      "title",
      "summary",
      "narrative",
      "observations",
      "photos",
      "sponsorship",
    ],
    locale: "original_language",
    filters: [["status", "published"]],
  },
  {
    type: "menu_item",
    table: "venue_menu_items",
    fields: ["name", "description"],
    filters: [["is_available", true]],
  },
  {
    type: "menu_section",
    table: "venue_menu_sections",
    fields: ["title", "note"],
    filters: [["is_visible", true]],
  },
  {
    type: "festival",
    table: "festivals",
    fields: ["title", "subtitle", "description"],
    filters: [],
  },
  {
    type: "comment",
    table: "comments",
    fields: ["content"],
    locale: "source_locale",
    filters: [
      ["is_deleted", false],
      ["is_hidden", false],
    ],
  },
  {
    type: "event",
    table: "events",
    fields: ["title", "description", "image_alt", "image_description"],
    locale: "source_locale",
    filters: [["status", "published"]],
  },
  {
    type: "moment",
    table: "moments",
    fields: ["text_content"],
    locale: "source_locale",
    filters: [],
  },
  {
    type: "profile",
    table: "profiles",
    fields: ["bio"],
    locale: "bio_source_locale",
    filters: [["is_private", false]],
  },
  {
    type: "moment",
    table: "moment_metadata",
    idKey: "moment_id",
    fields: [
      "ai_description",
      "ai_title",
      "scene_description",
      "video_summary",
      "video_transcript",
      "audio_summary",
      "audio_transcript",
      "pdf_summary",
      "pdf_extracted_text",
      "tags",
    ],
    filters: [["processing_status", "completed"]],
  },
  {
    type: "track",
    table: "playlist_tracks",
    fields: ["lyrics"],
    locale: "source_locale",
    filters: [],
  },
  {
    type: "people",
    table: "people_profiles",
    idKey: "user_id",
    fields: ["help_offered", "help_wanted"],
    locale: "source_locale",
    filters: [["enabled", true]],
  },
  {
    type: "blog",
    table: "blog_posts",
    fields: ["title", "story_content", "technical_content", "meta_description"],
    locale: "source_locale",
    filters: [],
    publicRecaps: true,
  },
] as const;

export type SourceDefinition = (typeof TRANSLATION_SOURCES)[number];
export function sourceFields(
  def: SourceDefinition,
  row: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    def.fields.flatMap((field) => {
      // Public event recaps expose narrative only; storage draft technical notes remain private.
      if (
        def.type === "blog" &&
        row.status === "draft" &&
        field === "technical_content"
      )
        return [];
      const value =
        field === "tags" && def.table === "moment_metadata"
          ? metadataLabels(row)
          : field === "lyrics"
          ? String(row.lyrics_lrc || "")
              .split("\n")
              .map((line) =>
                line.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]/, "").trim(),
              )
              .filter((line) => line && !/^\[[a-z]+:.+\]$/i.test(line))
              .join("\n")
          : row[field];
      if (typeof value === "string")
        return value.trim() ? [[field, value]] : [];
      // Only translate prose leaves; IDs, tags, attribution and evidence remain source data.
      if (field === "tags" && Array.isArray(value))
        return value.length ? [[field, JSON.stringify(value)]] : [];
      if (field === "observations" && Array.isArray(value))
        return value.length
          ? [
              [
                field,
                JSON.stringify(
                  value.map((o) => ({
                    subject: o.subject,
                    value: o.value,
                    context: o.context,
                  })),
                ),
              ],
            ]
          : [];
      if (field === "photos" && Array.isArray(value))
        return value.some((p) =>
          [p.alt, p.caption].some(
            (text) => typeof text === "string" && text.trim(),
          ),
        )
          ? [
              [
                field,
                JSON.stringify(
                  value.map((p) => ({ alt: p.alt, caption: p.caption })),
                ),
              ],
            ]
          : [];
      return [];
    }),
  );
}

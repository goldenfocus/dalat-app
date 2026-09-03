/** Keep illustrative covers disclosed even in small cards and future occurrences. */
export function eventImageAlt(
  event: {
    image_url: string | null;
    source_metadata?: Record<string, unknown> | null;
  },
  title: string,
): string {
  const metadata = event.source_metadata;
  if (metadata?.activity_media_url !== event.image_url) return title;
  const alt = metadata?.activity_media_alt;
  if (metadata?.activity_media_provenance === "ai_generated") {
    const description = typeof alt === "string" && alt.trim() ? alt : title;
    return /AI-generated/i.test(description)
      ? description
      : `AI-generated illustration; not an actual event photo. ${description}`;
  }
  return typeof alt === "string" && alt.trim() ? alt : title;
}

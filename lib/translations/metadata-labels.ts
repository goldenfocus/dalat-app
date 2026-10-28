/** Ordered prose leaves shared by metadata translation collection and its reader. */
export interface MetadataLabelSource {
  ai_tags?: unknown;
  detected_objects?: unknown;
  location_hints?: unknown;
  mood?: unknown;
  detected_text?: unknown;
}

/** Keep exact source bytes and duplicates; only invalid/blank entries are removed. */
export function metadataLabels(row: MetadataLabelSource): string[] {
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter(
          (item): item is string => typeof item === "string" && !!item.trim(),
        )
      : [];
  return [
    ...strings(row.ai_tags),
    ...strings(row.detected_objects),
    ...strings(row.location_hints),
    ...(typeof row.mood === "string" && row.mood.trim() ? [row.mood] : []),
    ...strings(row.detected_text),
  ];
}

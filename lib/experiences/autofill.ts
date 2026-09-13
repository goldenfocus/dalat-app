import { type ExperienceStory, type saveSchema } from "./schema";
import type { z } from "zod";
type Draft = z.infer<typeof saveSchema>;
// Fill empty fields and prior AI wording; never replace a contributor's corrections.
export function autofill(
  current: Draft,
  generated: ExperienceStory,
  previous?: ExperienceStory | null,
): Draft {
  const next = { ...current };
  for (const key of [
    "title",
    "narrative",
    "summary",
    "venue_name",
    "venue_address",
  ] as const) {
    if (
      (key === "venue_name" || key === "venue_address") &&
      current.venue_confirmed
    )
      continue;
    if ((!previous && !current[key].trim()) || current[key] === previous?.[key])
      next[key] = generated[key];
  }
  if (
    (!previous && current.category === "other") ||
    current.category === previous?.category
  )
    next.category = generated.category;
  if (
    (!previous && !current.tags.length) ||
    JSON.stringify(current.tags) === JSON.stringify(previous?.tags)
  )
    next.tags = generated.tags;
  if (
    (!previous && !current.observations.length) ||
    JSON.stringify(current.observations) ===
      JSON.stringify(previous?.observations)
  )
    next.observations = generated.observations;
  next.original_language = generated.original_language;
  if (
    next.venue_name !== current.venue_name ||
    next.venue_address !== current.venue_address
  ) {
    next.venue_id = null;
    next.venue_confirmed = false;
  }
  next.photos = current.selected_media.map((id) => {
    const old = current.photos.find((p) => p.id === id) || {
      id,
      alt: "",
      caption: "",
    };
    const proposed = generated.photos.find((p) => p.id === id);
    const prior = previous?.photos.find((p) => p.id === id);
    return proposed
      ? {
          id,
          alt: !old.alt || old.alt === prior?.alt ? proposed.alt : old.alt,
          caption:
            !old.caption || old.caption === prior?.caption
              ? proposed.caption
              : old.caption,
        }
      : old;
  });
  return next;
}

// Completed stories may contain deliberate empty fields; reopening must not restore them.
export function restoreAutofill(
  current: Draft,
  generated: ExperienceStory,
): Draft {
  return current.narrative.trim() ? current : autofill(current, generated);
}

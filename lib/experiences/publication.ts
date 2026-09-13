import type { z } from "zod";
import type { saveSchema } from "./schema";
export function publicationReady(
  story: z.infer<typeof saveSchema>,
  today: string,
) {
  return (
    story.permission_confirmed &&
    (!(story.venue_name.trim() || story.venue_id) || story.venue_confirmed) &&
    !!story.title.trim() &&
    (story.narrative.trim().length > 0 || story.selected_media.length > 0) &&
    story.visit_date <= today
  );
}

import { z } from "zod";
import { venueEventEditor } from "@/lib/venues/event-editor";
import { experienceAdmin } from "@/lib/experiences/server";
import { arrivalJson, arrivalFailure, arrivalMutationAllowed } from "@/lib/arrival/http";
import { MIN_EVENT_DESCRIPTION_LENGTH } from "@/lib/translations-readiness";

const fields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(MIN_EVENT_DESCRIPTION_LENGTH).max(16000),
  starts_at: z.iso.datetime(),
  capacity: z.number().int().min(1).max(100000).nullable(),
  updated_at: z.string(),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ error: "forbidden" }, 403);
  try {
    const editor = await venueEventEditor((await params).slug);
    if (!editor) return arrivalJson({ error: "forbidden" }, 403);
    const parsed = fields.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return arrivalJson({ error: "invalid" }, 400);
    const { updated_at, ...changes } = parsed.data;
    const { event } = editor;
    if (updated_at !== event.updated_at) return arrivalJson({ error: "conflict" }, 409);
    if (changes.title === event.title && changes.description === event.description &&
        Date.parse(changes.starts_at) === Date.parse(event.starts_at) && changes.capacity === event.capacity) {
      return arrivalJson({ ok: true });
    }
    const timeShift = Date.parse(changes.starts_at) - Date.parse(event.starts_at);
    const contentChanged = changes.title !== event.title || changes.description !== event.description;
    const { data, error } = await experienceAdmin().from("events").update({
      ...changes,
      ...(event.ends_at && timeShift !== 0 ? { ends_at: new Date(Date.parse(event.ends_at) + timeShift).toISOString() } : {}),
      ...(contentChanged ? { source_locale: null } : {}),
      ...(event.series_id ? { is_exception: true } : {}),
    }).eq("id", event.id).eq("venue_id", event.venue_id).eq("updated_at", updated_at).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return arrivalJson({ error: "conflict" }, 409);
    return arrivalJson({ ok: true });
  } catch (error) {
    return arrivalFailure(error);
  }
}

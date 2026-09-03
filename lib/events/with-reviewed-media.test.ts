import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { eventImageAlt } from "./image-alt";
import { withReviewedMedia } from "./with-reviewed-media";

it("restores a listing RPC's missing disclosure without exposing other source metadata", async () => {
  const source = {
    activity_media_url: "https://cdn.dalat.app/yoga.jpg",
    activity_media_provenance: "ai_generated",
    internal_audit: "not for cards",
  };
  const supabase = {
    from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "yoga", source_metadata: source }], error: null }) }) }),
  } as unknown as SupabaseClient;
  const events = [{ id: "yoga", image_url: source.activity_media_url }];
  const hydrated = await withReviewedMedia(supabase, events);
  expect(eventImageAlt(hydrated[0], "Yoga")).toContain("AI-generated illustration; not an actual event photo");
  expect(JSON.stringify(hydrated)).not.toContain("internal_audit");
  expect(events).toEqual([{ id: "yoga", image_url: source.activity_media_url }]);
});

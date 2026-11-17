"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Refresh an already-open event as its localized fields arrive. No blocking UI. */
export function EventTranslationRefresh({
  eventId, locale, title, description,
}: {
  eventId: string;
  locale: string;
  title: string;
  description: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    const db = createClient();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function check() {
      const { data, error } = await db.from("content_translations")
        .select("field_name,translated_text")
        .eq("content_type", "event")
        .eq("content_id", eventId)
        .eq("target_locale", locale)
        .in("field_name", ["title", "description"]);
      if (stopped) return;
      if (!error) {
        const fields = new Map((data ?? []).map((row: { field_name: string; translated_text: string }) => [row.field_name, row.translated_text]));
        const nextTitle = fields.get("title");
        const nextDescription = fields.get("description");
        if ((nextTitle && nextTitle !== title) || (nextDescription && nextDescription !== description)) {
          router.refresh();
          return;
        }
        if (nextTitle && (!description || nextDescription)) return;
      }
      if (++attempts < 36) timer = setTimeout(check, 5_000);
    }
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [eventId, locale, title, description, router]);
  return null;
}

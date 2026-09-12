import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
export async function ExperienceList({
  authorId,
  venueId,
  category,
  excludeId,
}: {
  authorId?: string;
  venueId?: string;
  category?: string;
  excludeId?: string;
}) {
  const db = await createClient();
  const t = await getTranslations("experiences");
  let q = db
    .from("experiences")
    .select("id,title,summary,visit_date,venue_name,selected_media,status")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(24);
  if (authorId) q = q.eq("author_id", authorId);
  if (venueId) q = q.eq("venue_id", venueId);
  if (category) q = q.eq("category", category);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  if (!data?.length) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("experiences")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {data.map((e) => (
          <Link
            href={`/experiences/${e.id}`}
            key={e.id}
            className="overflow-hidden rounded-2xl border bg-card group"
          >
            {e.selected_media[0] && (
              <img
                src={`/experience-media/${e.id}/${e.selected_media[0]}`}
                alt={e.title}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            )}
            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                {e.venue_name} · {e.visit_date}
              </p>
              <h3 className="text-lg font-medium group-hover:underline">
                {e.title}
              </h3>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {e.summary}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

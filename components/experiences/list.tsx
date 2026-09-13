import { suggestsEventDiscovery } from "@/lib/experiences/actions";
import { AttributedText } from "./attributed-text";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
type ExperienceCard = {
  id: string;
  title: string;
  summary: string;
  visit_date: string;
  venue_name: string;
  selected_media: string[];
  status: string;
  category: string;
  author: { display_name: string | null; username: string | null } | null;
  venue: { slug: string } | null;
};
export async function ExperienceList({
  authorId,
  venueId,
  category,
  excludeId,
  showEmpty = false,
}: {
  authorId?: string;
  venueId?: string;
  category?: string;
  excludeId?: string;
  showEmpty?: boolean;
}) {
  const db = await createClient();
  const t = await getTranslations("experiences");
  let q = db
    .from("experiences")
    .select(
      "id,title,summary,visit_date,venue_name,selected_media,status,category,author:profiles!experiences_author_id_fkey(display_name,username),venue:venues(slug)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(24);
  if (authorId) q = q.eq("author_id", authorId);
  if (venueId) q = q.eq("venue_id", venueId);
  if (category) q = q.eq("category", category);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.returns<ExperienceCard[]>();
  if (!data?.length)
    return showEmpty ? (
      <section className="rounded-2xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground">{t("empty")}</p>
      </section>
    ) : null;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t("experiences")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {data.map((e) => (
          <article
            key={e.id}
            className="overflow-hidden rounded-2xl border bg-card group"
          >
            <Link href={`/experiences/${e.id}`}>
              {e.selected_media[0] && (
                <img
                  src={`/experience-media/${e.id}/${e.selected_media[0]}`}
                  alt={e.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}
            </Link>
            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                {[e.venue_name, e.visit_date].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pastAccount")} · {t("accessUnknown")}
                {e.selected_media.length > 0 && <> · {t("originalPhoto")}</>}
              </p>
              <h3 className="text-lg font-medium group-hover:underline">
                <Link href={`/experiences/${e.id}`}>{e.title}</Link>
              </h3>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                <AttributedText
                  text={e.summary}
                  username={e.author?.username}
                />
              </p>
            </div>
            <div className="border-t px-4 py-3 flex flex-wrap gap-3 text-sm">
              {e.author?.username && (
                <Link
                  className="min-h-11 py-3 underline"
                  href={`/${e.author.username}`}
                >
                  {`@${e.author.username}`}
                </Link>
              )}
              {e.venue?.slug && (
                <Link
                  className="min-h-11 py-3 underline"
                  href={`/${e.venue.slug}`}
                >
                  {t("exploreVenue")}
                </Link>
              )}
              {!e.venue?.slug && suggestsEventDiscovery(e.category, `${e.title} ${e.summary}`) && (
                <Link
                  className="min-h-11 py-3 underline"
                  href="/events/upcoming"
                >
                  {t("upcomingActions")}
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
